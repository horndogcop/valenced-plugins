import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before, instead } from '@valenced/patcher'
import { matchesParsedSearchQuery, parseSearchQuery } from '../parser'
import type { ParsedSearchQuery, SearchMessageLike } from '../types'

let latestQueryText = ''
const searchQueryById = new Map<string, ParsedSearchQuery>()

export function setActiveRawSearchQuery(query: string, searchId = 'default'): void {
  latestQueryText = query
  searchQueryById.set(searchId, parseSearchQuery(query))
}

export function getActiveParsedQuery(searchId = 'default'): ParsedSearchQuery {
  return (
    searchQueryById.get(searchId) ??
    parseSearchQuery(latestQueryText)
  )
}

function resolveChannelName(channelId: string): string | undefined {
  const channelStore = (Stores as Record<string, any>).ChannelStore
  return channelStore?.getChannel?.(channelId)?.name
}

function filterSearchMessages(
  messages: unknown,
  parsed: ParsedSearchQuery,
): { filtered: unknown; removedCount: number } {
  if (!Array.isArray(messages) || parsed.negativeFilters.length === 0) {
    return { filtered: messages, removedCount: 0 }
  }

  let removedCount = 0
  const helpers = { resolveChannelName }

  // Discord returns search results either as Message[][] (context groups) or Message[]
  if (Array.isArray(messages[0])) {
    const groups = (messages as SearchMessageLike[][]).filter(group => {
      // The hit message in each Discord search result group is marked `hit: true` (or first item)
      const hitMsg =
        group.find((m: any) => m?.hit) ?? group[0]
      if (!hitMsg) return false
      const keep = matchesParsedSearchQuery(hitMsg, parsed, helpers, false)
      if (!keep) removedCount += 1
      return keep
    })
    return { filtered: groups, removedCount }
  }

  const flat = (messages as SearchMessageLike[]).filter(msg => {
    const keep = matchesParsedSearchQuery(msg, parsed, helpers, false)
    if (!keep) removedCount += 1
    return keep
  })

  return { filtered: flat, removedCount }
}

function stripNegativeTokensFromRestQuery(url: string): string {
  try {
    const [base, queryString] = url.split('?')
    if (!queryString) return url
    const params = new URLSearchParams(queryString)
    const content = params.get('content')
    if (content) {
      const parsed = parseSearchQuery(content)
      if (parsed.negativeFilters.length > 0) {
        setActiveRawSearchQuery(content)
        if (parsed.serverQuery) {
          params.set('content', parsed.serverQuery)
        } else {
          params.delete('content')
        }
      }
    }
    const nextQs = params.toString()
    return nextQs ? `${base}?${nextQs}` : base
  } catch {
    return url
  }
}

export function patchSearchFilter(): () => void {
  const unpatches: Array<() => void> = []

  // 1. Patch SearchQuery tokenizer/parser so `-key:value` inline tokens are recognized
  //    and repeatable alongside standard Discord positive filters.
  unpatches.push(
    getModules(
      withProps<{ tokenize: (query: string) => any[] }>('tokenize'),
      mod => {
        unpatches.push(
          instead(mod, 'tokenize', (args, orig) => {
            const [query] = args
            const tokens = orig(...args)
            if (typeof query !== 'string' || !Array.isArray(tokens)) return tokens
            setActiveRawSearchQuery(query)
            const parsed = parseSearchQuery(query)
            if (parsed.negativeFilters.length === 0) return tokens

            const negValues = new Set(parsed.negativeFilters.map(n => n.raw))
            return tokens.map(token => {
              const text = String(token?.fullMatch ?? token?.text ?? '')
              if (negValues.has(text)) {
                return {
                  ...token,
                  type: `NEGATED_FILTER_${token?.type ?? 'INLINE'}`,
                  isNegatedFilter: true,
                }
              }
              return token
            })
          }),
        )
      },
      { max: 1 },
    ),
  )

  // 2. Patch SearchActionCreators to strip negative filter tokens before server submission
  unpatches.push(
    getModules(
      withProps<{ search: (...args: any[]) => any }>('search'),
      mod => {
        unpatches.push(
          before(mod, 'search', args => {
            const [searchId, query] = args
            if (typeof query === 'string') {
              setActiveRawSearchQuery(query, String(searchId ?? 'default'))
              const parsed = parseSearchQuery(query)
              if (parsed.negativeFilters.length > 0) {
                args[1] = parsed.serverQuery
              }
            } else if (query && typeof query === 'object' && typeof query.content === 'string') {
              setActiveRawSearchQuery(query.content, String(searchId ?? 'default'))
              const parsed = parseSearchQuery(query.content)
              if (parsed.negativeFilters.length > 0) {
                args[1] = { ...query, content: parsed.serverQuery }
              }
            }
            return args
          }),
        )
      },
      { max: 1 },
    ),
  )

  // 3. Patch RestAPI.get for `/messages/search` requests so negative filters never hit the API
  unpatches.push(
    getModules(
      withProps<{
        get: (req: any) => Promise<any>
        post: (...args: any[]) => any
        put: (...args: any[]) => any
      }>('get', 'post', 'put'),
      restApi => {
        unpatches.push(
          before(restApi, 'get', args => {
            const [req] = args
            if (req && typeof req.url === 'string' && req.url.includes('/messages/search')) {
              req.url = stripNegativeTokensFromRestQuery(req.url)
            }
            return args
          }),
        )
      },
      { max: 1 },
    ),
  )

  // 4. Patch SearchStore results & SEARCH_FINISH payload client-side
  unpatches.push(
    before(Dispatcher as any, 'dispatch', args => {
      const [payload] = args
      if (!payload || typeof payload !== 'object') return args
      if (payload.type !== 'SEARCH_FINISH') return args

      const parsed = getActiveParsedQuery(String(payload.id ?? 'default'))
      if (parsed.negativeFilters.length === 0) return args

      const { filtered, removedCount } = filterSearchMessages(
        payload.messages,
        parsed,
      )
      payload.messages = filtered
      if (typeof payload.totalResults === 'number') {
        payload.totalResults = Math.max(0, payload.totalResults - removedCount)
      }
      return args
    }),
  )

  unpatches.push(
    getModules(
      withProps<{ getSearchResults: (id: string) => any }>('getSearchResults'),
      searchStore => {
        unpatches.push(
          instead(searchStore, 'getSearchResults', (args, orig) => {
            const [searchId] = args
            const res = orig(...args)
            if (!res || typeof res !== 'object') return res
            const parsed = getActiveParsedQuery(String(searchId ?? 'default'))
            if (parsed.negativeFilters.length === 0) return res

            if (Array.isArray(res.results)) {
              const { filtered, removedCount } = filterSearchMessages(
                res.results,
                parsed,
              )
              return {
                ...res,
                results: filtered,
                totalResults:
                  typeof res.totalResults === 'number'
                    ? Math.max(0, res.totalResults - removedCount)
                    : res.totalResults,
              }
            }
            return res
          }),
        )
      },
      { max: 1 },
    ),
  )

  return () => {
    searchQueryById.clear()
    latestQueryText = ''
    for (const unpatch of unpatches) {
      unpatch()
    }
  }
}
