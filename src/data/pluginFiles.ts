export interface PluginSourceFile {
  path: string
  language: 'json' | 'typescript' | 'markdown'
  summary: string
  content: string
}

export const PLUGIN_SOURCE_FILES: PluginSourceFile[] = [
  {
    path: 'plugins/negative-search-filters/manifest.json',
    language: 'json',
    summary: 'Valenced plugin manifest crediting horndogcop and declaring JS bundle entry.',
    content: `{
  "format": 1,
  "id": "com.valenced.negative-search-filters",
  "name": "Negative Search Filters",
  "description": "Adds repeatable client-side negative inline search filters (-from:, -in:, -has:image, -has:embed, etc.) to Discord mobile search.",
  "author": "horndogcop",
  "version": "1.0.0",
  "dependencies": {
    "valenced.api": {
      "version": ">=1 <2"
    },
    "discord": {
      "version": "*"
    }
  },
  "dist": {
    "script": "index.js"
  }
}
`,
  },
  {
    path: 'plugins/negative-search-filters/tsconfig.json',
    language: 'json',
    summary: 'Isolated TypeScript project extending the template tsconfig.base.json.',
    content: `{
  "extends": "../../tsconfig.base.json"
}
`,
  },
  {
    path: 'plugins/negative-search-filters/js/index.ts',
    language: 'typescript',
    summary: 'Plugin entrypoint with no SettingsComponent; registers filter & menu patches.',
    content: `import { patchSearchFilter } from './patches/searchFilter'
import { patchSearchMenu } from './patches/searchMenu'

// Intentionally no SettingsComponent: filters are entered inline or via the search menu.
export default plugin({
  start(api) {
    api.cleanup(patchSearchFilter(), patchSearchMenu())
  },
})
`,
  },
  {
    path: 'plugins/negative-search-filters/js/types.ts',
    language: 'typescript',
    summary: 'Search filter keys, parsed token types, and message attachment/embed contracts.',
    content: `export type SearchFilterKey =
  | 'from'
  | 'in'
  | 'mentions'
  | 'has'
  | 'pinned'
  | 'before'
  | 'after'
  | 'during'

export interface ParsedFilterToken {
  raw: string
  negated: boolean
  key: SearchFilterKey
  value: string
}

export interface ParsedSearchQuery {
  /** Free-text search terms after removing all negative filter tokens. */
  serverQuery: string
  /** Positive inline filters preserved for server search. */
  positiveFilters: ParsedFilterToken[]
  /** Repeatable negative inline filters evaluated client-side. */
  negativeFilters: ParsedFilterToken[]
}

export interface SearchAttachmentLike {
  id?: string
  filename?: string
  content_type?: string
  url?: string
  width?: number
  height?: number
}

export interface SearchEmbedLike {
  type?: string
  url?: string
  title?: string
  image?: { url?: string }
  thumbnail?: { url?: string }
  video?: { url?: string }
}

export interface SearchMessageLike {
  id: string
  channel_id?: string
  channelId?: string
  content?: string
  timestamp?: string
  pinned?: boolean
  author?: {
    id: string
    username?: string
    globalName?: string
  }
  mentions?: Array<{ id: string; username?: string; globalName?: string }>
  attachments?: SearchAttachmentLike[]
  embeds?: SearchEmbedLike[]
  sticker_items?: Array<{ id: string }>
  stickers?: Array<{ id: string }>
}
`,
  },
  {
    path: 'plugins/negative-search-filters/js/parser.ts',
    language: 'typescript',
    summary: 'Tokenizer, repeatable negative filter parser, and client-side message evaluator.',
    content: `import type {
  ParsedFilterToken,
  ParsedSearchQuery,
  SearchFilterKey,
  SearchMessageLike,
} from './types'

const SUPPORTED_KEYS = new Set<SearchFilterKey>([
  'from',
  'in',
  'mentions',
  'has',
  'pinned',
  'before',
  'after',
  'during',
])

const IMAGE_EXT_RE = /\\.(png|jpe?g|gif|webp|avif|bmp|heic)(\\?|$)/i
const VIDEO_EXT_RE = /\\.(mp4|mov|webm|mkv|avi)(\\?|$)/i
const SOUND_EXT_RE = /\\.(mp3|wav|ogg|flac|m4a|opus)(\\?|$)/i
const URL_RE = /https?:\\/\\/[^\\s<>]+/i

function tokenizeRespectingQuotes(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
    } else if (/\\s/.test(ch) && !inQuotes) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

function stripQuotes(val: string): string {
  const trimmed = val.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function normalizeFilterKey(rawKey: string): SearchFilterKey | undefined {
  const k = rawKey.toLowerCase()
  if (SUPPORTED_KEYS.has(k as SearchFilterKey)) {
    return k as SearchFilterKey
  }
  return undefined
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const tokens = tokenizeRespectingQuotes(query)
  const serverTokens: string[] = []
  const positiveFilters: ParsedFilterToken[] = []
  const negativeFilters: ParsedFilterToken[] = []

  for (const raw of tokens) {
    const match = raw.match(/^(-|!)?([a-zA-Z]+):(.+)$/)
    if (match) {
      const negated = Boolean(match[1])
      const key = normalizeFilterKey(match[2])
      const value = stripQuotes(match[3])

      if (key && value.length > 0) {
        const parsed: ParsedFilterToken = {
          raw,
          negated,
          key,
          value,
        }
        if (negated) {
          negativeFilters.push(parsed)
        } else {
          positiveFilters.push(parsed)
          if (key === 'has' && value.toLowerCase() === 'attachment') {
            serverTokens.push('has:file')
          } else {
            serverTokens.push(raw)
          }
        }
        continue
      }
    }

    serverTokens.push(raw)
  }

  return {
    serverQuery: serverTokens.join(' ').trim(),
    positiveFilters,
    negativeFilters,
  }
}

export function messageHasAttachment(msg: SearchMessageLike): boolean {
  return Array.isArray(msg.attachments) && msg.attachments.length > 0
}

export function messageHasImage(msg: SearchMessageLike): boolean {
  if (Array.isArray(msg.attachments)) {
    const hasImgAtt = msg.attachments.some(
      att =>
        att.content_type?.startsWith('image/') ||
        IMAGE_EXT_RE.test(att.filename ?? '') ||
        IMAGE_EXT_RE.test(att.url ?? '') ||
        (typeof att.width === 'number' &&
          typeof att.height === 'number' &&
          !att.content_type?.startsWith('video/')),
    )
    if (hasImgAtt) return true
  }
  if (Array.isArray(msg.embeds)) {
    return msg.embeds.some(
      embed =>
        embed.type === 'image' ||
        embed.type === 'gifv' ||
        Boolean(embed.image?.url || embed.thumbnail?.url),
    )
  }
  return false
}

export function messageHasVideo(msg: SearchMessageLike): boolean {
  if (Array.isArray(msg.attachments)) {
    const hasVid = msg.attachments.some(
      att =>
        att.content_type?.startsWith('video/') ||
        VIDEO_EXT_RE.test(att.filename ?? '') ||
        VIDEO_EXT_RE.test(att.url ?? ''),
    )
    if (hasVid) return true
  }
  if (Array.isArray(msg.embeds)) {
    return msg.embeds.some(embed => embed.type === 'video' || Boolean(embed.video?.url))
  }
  return false
}

export function messageHasSound(msg: SearchMessageLike): boolean {
  if (!Array.isArray(msg.attachments)) return false
  return msg.attachments.some(
    att =>
      att.content_type?.startsWith('audio/') ||
      SOUND_EXT_RE.test(att.filename ?? '') ||
      SOUND_EXT_RE.test(att.url ?? ''),
  )
}

export function messageHasEmbed(msg: SearchMessageLike): boolean {
  return Array.isArray(msg.embeds) && msg.embeds.length > 0
}

export function messageHasLink(msg: SearchMessageLike): boolean {
  if (typeof msg.content === 'string' && URL_RE.test(msg.content)) return true
  if (Array.isArray(msg.embeds)) {
    return msg.embeds.some(embed => Boolean(embed.url))
  }
  return false
}

export function messageHasSticker(msg: SearchMessageLike): boolean {
  return (
    (Array.isArray(msg.sticker_items) && msg.sticker_items.length > 0) ||
    (Array.isArray(msg.stickers) && msg.stickers.length > 0)
  )
}

function normalizeUserRef(val: string): string {
  return val.replace(/^<@!?|>$|^@/g, '').trim().toLowerCase()
}

function normalizeChannelRef(val: string): string {
  return val.replace(/^<#|>$|^#/g, '').trim().toLowerCase()
}

function matchesHasPredicate(msg: SearchMessageLike, rawType: string): boolean {
  const kind = rawType.toLowerCase()
  switch (kind) {
    case 'attachment':
    case 'file':
      return messageHasAttachment(msg)
    case 'image':
      return messageHasImage(msg)
    case 'video':
      return messageHasVideo(msg)
    case 'sound':
    case 'audio':
      return messageHasSound(msg)
    case 'embed':
      return messageHasEmbed(msg)
    case 'link':
      return messageHasLink(msg)
    case 'sticker':
      return messageHasSticker(msg)
    default:
      return false
  }
}

export interface SearchResolutionHelpers {
  resolveChannelName?: (channelId: string) => string | undefined
}

function matchesFilter(
  msg: SearchMessageLike,
  filter: ParsedFilterToken,
  helpers?: SearchResolutionHelpers,
): boolean {
  switch (filter.key) {
    case 'from': {
      const target = normalizeUserRef(filter.value)
      const authorId = msg.author?.id?.toLowerCase()
      const username = msg.author?.username?.toLowerCase()
      const globalName = msg.author?.globalName?.toLowerCase()
      return authorId === target || username === target || globalName === target
    }
    case 'in': {
      const target = normalizeChannelRef(filter.value)
      const chId = (msg.channel_id ?? msg.channelId ?? '').toLowerCase()
      const chName = helpers?.resolveChannelName?.(chId)?.toLowerCase()
      return chId === target || chName === target
    }
    case 'mentions': {
      const target = normalizeUserRef(filter.value)
      if (Array.isArray(msg.mentions)) {
        const found = msg.mentions.some(
          m =>
            m.id.toLowerCase() === target ||
            m.username?.toLowerCase() === target ||
            m.globalName?.toLowerCase() === target,
        )
        if (found) return true
      }
      return Boolean(msg.content && msg.content.includes(\`<@\${target}>\`))
    }
    case 'has':
      return matchesHasPredicate(msg, filter.value)
    case 'pinned': {
      const expected = filter.value.toLowerCase() !== 'false'
      return Boolean(msg.pinned) === expected
    }
    case 'before':
    case 'after':
    case 'during': {
      if (!msg.timestamp) return false
      const msgDate = msg.timestamp.slice(0, 10)
      const targetDate = filter.value.slice(0, 10)
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) return false
      if (filter.key === 'before') return msgDate < targetDate
      if (filter.key === 'after') return msgDate > targetDate
      return msgDate === targetDate
    }
    default:
      return false
  }
}

export function matchesParsedSearchQuery(
  msg: SearchMessageLike,
  parsed: ParsedSearchQuery,
  helpers?: SearchResolutionHelpers,
  evaluatePositiveLocally = false,
): boolean {
  if (evaluatePositiveLocally) {
    for (const pos of parsed.positiveFilters) {
      if (!matchesFilter(msg, pos, helpers)) return false
    }
  }

  for (const neg of parsed.negativeFilters) {
    if (matchesFilter(msg, neg, helpers)) return false
  }

  return true
}
`,
  },
  {
    path: 'plugins/negative-search-filters/js/patches/searchFilter.ts',
    language: 'typescript',
    summary: 'Strips negative tokens from server search requests and filters results client-side.',
    content: `import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { matchesParsedSearchQuery, parseSearchQuery } from '../parser'
import type { ParsedSearchQuery, SearchMessageLike } from '../types'

let latestQueryText = ''
const searchQueryById = new Map<string, ParsedSearchQuery>()

export function setActiveRawSearchQuery(query: string, searchId = 'default'): void {
  latestQueryText = query
  searchQueryById.set(searchId, parseSearchQuery(query))
}

export function getActiveParsedQuery(searchId = 'default'): ParsedSearchQuery {
  return searchQueryById.get(searchId) ?? parseSearchQuery(latestQueryText)
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

  if (Array.isArray(messages[0])) {
    const groups = (messages as SearchMessageLike[][]).filter(group => {
      const hitMsg = group.find((m: any) => m?.hit) ?? group[0]
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
    return nextQs ? \`\${base}?\${nextQs}\` : base
  } catch {
    return url
  }
}

export function patchSearchFilter(): () => void {
  const unpatches: Array<() => void> = []

  unpatches.push(
    getModules(
      withProps<{ tokenize: (query: string) => any[] }>('tokenize'),
      mod => {
        unpatches.push(
          after(mod, 'tokenize', ([query], tokens) => {
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
                  type: \`NEGATED_FILTER_\${token?.type ?? 'INLINE'}\`,
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
            } else if (
              query &&
              typeof query === 'object' &&
              typeof query.content === 'string'
            ) {
              setActiveRawSearchQuery(query.content, String(searchId ?? 'default'))
              const parsed = parseSearchQuery(query.content)
              if (parsed.negativeFilters.length > 0) {
                args[1] = { ...query, content: parsed.serverQuery }
              }
            }
          }),
        )
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    getModules(
      withProps<{ get: (req: any) => Promise<any> }>('get', 'post', 'put'),
      restApi => {
        unpatches.push(
          before(restApi, 'get', ([req]) => {
            if (
              req &&
              typeof req.url === 'string' &&
              req.url.includes('/messages/search')
            ) {
              req.url = stripNegativeTokensFromRestQuery(req.url)
            }
          }),
        )
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    before(Dispatcher as any, 'dispatch', ([payload]) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.type !== 'SEARCH_FINISH') return

      const parsed = getActiveParsedQuery(String(payload.id ?? 'default'))
      if (parsed.negativeFilters.length === 0) return

      const { filtered, removedCount } = filterSearchMessages(
        payload.messages,
        parsed,
      )
      payload.messages = filtered
      if (typeof payload.totalResults === 'number') {
        payload.totalResults = Math.max(0, payload.totalResults - removedCount)
      }
    }),
  )

  unpatches.push(
    getModules(
      withProps<{ getSearchResults: (id: string) => any }>('getSearchResults'),
      searchStore => {
        unpatches.push(
          after(searchStore, 'getSearchResults', ([searchId], res) => {
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
`,
  },
  {
    path: 'plugins/negative-search-filters/js/patches/searchMenu.tsx',
    language: 'typescript',
    summary: 'Extends Discord search filter menu and autocomplete with repeatable negative filter tokens.',
    content: `import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { setActiveRawSearchQuery } from './searchFilter'

const { Text } = Design

const NEGATIVE_FILTER_DEFINITIONS = [
  { key: '-from:', hint: 'Exclude user', example: '-from:username' },
  { key: '-in:', hint: 'Exclude channel', example: '-in:channel' },
  { key: '-mentions:', hint: 'Exclude mentioned user', example: '-mentions:username' },
  { key: '-has:image', hint: 'Exclude images', example: '-has:image' },
  { key: '-has:embed', hint: 'Exclude embeds', example: '-has:embed' },
  { key: '-has:link', hint: 'Exclude links', example: '-has:link' },
  { key: '-has:attachment', hint: 'Exclude files', example: '-has:attachment' },
  { key: '-has:video', hint: 'Exclude videos', example: '-has:video' },
  { key: '-pinned:true', hint: 'Exclude pinned', example: '-pinned:true' },
] as const

const HAS_SUGGESTIONS = [
  'image',
  'embed',
  'link',
  'attachment',
  'file',
  'video',
  'sound',
  'sticker',
]

const styles = StyleSheet.create({
  menuSection: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  negateToggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  negateToggleActive: {
    backgroundColor: '#DA373C',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
})

function appendInlineFilter(
  currentQuery: string,
  token: string,
  onUpdateQuery?: (next: string) => void,
) {
  const base = currentQuery.trimEnd()
  const next = base.length > 0 ? \`\${base} \${token}\` : token
  setActiveRawSearchQuery(next)
  onUpdateQuery?.(next)
}

function NegativeFilterMenuExtension({
  query,
  onUpdateQuery,
}: {
  query: string
  onUpdateQuery?: (next: string) => void
}) {
  const [negateMode, setNegateMode] = useState(true)

  return (
    <View style={styles.menuSection}>
      <View style={styles.headerRow}>
        <Text variant="text-xs/semibold" color="text-muted">
          Negative Filters (Repeatable)
        </Text>
        <Pressable
          style={[styles.negateToggle, negateMode && styles.negateToggleActive]}
          onPress={() => setNegateMode(v => !v)}
        >
          <Text variant="text-xs/semibold" color="text-normal">
            {negateMode ? 'Negate (-): ON' : 'Negate (-): OFF'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.chipGrid}>
        {NEGATIVE_FILTER_DEFINITIONS.map(item => {
          const token = negateMode ? item.key : item.key.replace(/^-/, '')
          return (
            <Pressable
              key={item.key}
              style={styles.filterChip}
              onPress={() => appendInlineFilter(query, token, onUpdateQuery)}
            >
              <Text variant="text-xs/medium" color="text-normal">
                {token}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export function patchSearchMenu(): () => void {
  const unpatches: Array<() => void> = []

  unpatches.push(
    getModules(
      withProps<{
        getSearchFilterSuggestions: (query: string, guildId?: string) => any[]
      }>('getSearchFilterSuggestions'),
      mod => {
        unpatches.push(
          after(mod, 'getSearchFilterSuggestions', ([query], suggestions) => {
            if (typeof query !== 'string') return suggestions
            const lastToken = query.split(/\\s+/).pop() ?? ''
            if (!lastToken.startsWith('-')) return suggestions

            const hasPrefixMatch = lastToken.match(/^-has:(.*)$/i)
            if (hasPrefixMatch) {
              const partial = hasPrefixMatch[1].toLowerCase()
              return HAS_SUGGESTIONS.filter(opt => opt.startsWith(partial)).map(
                opt => ({
                  token: \`-has:\${opt}\`,
                  label: \`-has:\${opt}\`,
                  description: \`Exclude messages with \${opt}\`,
                }),
              )
            }

            const matchingDefs = NEGATIVE_FILTER_DEFINITIONS.filter(def =>
              def.key.startsWith(lastToken.toLowerCase()),
            ).map(def => ({
              token: def.key,
              label: def.key,
              description: def.hint,
            }))

            return matchingDefs.length > 0
              ? [...matchingDefs, ...(Array.isArray(suggestions) ? suggestions : [])]
              : suggestions
          }),
        )
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    getModules(
      withProps<{ SearchFilterOptions: any }>('SearchFilterOptions'),
      ({ SearchFilterOptions }) => {
        unpatches.push(
          insteadJSX(SearchFilterOptions, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const query = typeof props?.query === 'string' ? props.query : ''
            const onUpdateQuery =
              props?.onChangeText ?? props?.onSelectFilter ?? props?.setQuery

            return (
              <View>
                {rendered}
                <NegativeFilterMenuExtension
                  query={query}
                  onUpdateQuery={onUpdateQuery}
                />
              </View>
            )
          }),
        )
      },
      { max: 1 },
    ),
  )

  return () => {
    for (const unpatch of unpatches) {
      unpatch()
    }
  }
}
`,
  },
  {
    path: 'package.json',
    language: 'json',
    summary: 'Template root package.json wired to @valenced/plugin-cli and @valenced/types.',
    content: `{
  "name": "@valenced/negative-search-filters-repo",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "valenced-plugin build",
    "build:dev": "valenced-plugin build --dev",
    "generate-index": "valenced-plugin generate-index",
    "serve": "valenced-plugin serve",
    "lint:types": "tsc -b plugins/*/tsconfig.json"
  },
  "dependencies": {
    "@valenced/plugin-cli": "git+https://github.com/Valenced/valenced-plugin-cli.git",
    "@valenced/types": "git+https://github.com/Valenced/valenced-types.git"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@types/react": "^19.0.0",
    "react-native": "0.81.6",
    "typescript": "^7.0.2"
  }
}
`,
  },
  {
    path: 'repo.config.json',
    language: 'json',
    summary: 'Repository index metadata matching Valenced/valenced-plugin-template.',
    content: `{
  "name": "Negative Search Filters Repository",
  "description": "Valenced plugin repository by horndogcop.",
  "channels": {}
}
`,
  },
  {
    path: 'tsconfig.base.json',
    language: 'json',
    summary: 'Shared TypeScript configuration referencing @valenced/types.',
    content: `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "tsBuildInfoFile": "\${configDir}/build/tsconfig.tsbuildinfo",
    "types": ["@valenced/types"]
  },
  "include": ["\${configDir}/**/*", "types"],
  "exclude": ["\${configDir}/build", "\${configDir}/node_modules"]
}
`,
  },
]
