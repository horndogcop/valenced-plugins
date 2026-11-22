import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
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
  // Always append so negative filters are repeatable (e.g. multiple -from: filters)
  const next = base.length > 0 ? `${base} ${token}` : token
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

  // 1. Extend search autocomplete suggestions when user types `-` or `-has:` / `-from:` / `-in:`
  unpatches.push(
    getModules(
      withProps<{
        getSearchFilterSuggestions: (query: string, guildId?: string) => any[]
      }>('getSearchFilterSuggestions'),
      mod => {
        unpatches.push(
          instead(mod, 'getSearchFilterSuggestions', (args, orig) => {
            const [query] = args
            const suggestions = orig(...args)
            if (typeof query !== 'string') return suggestions
            const lastToken = query.split(/\s+/).pop() ?? ''
            if (!lastToken.startsWith('-')) return suggestions

            const hasPrefixMatch = lastToken.match(/^-has:(.*)$/i)
            if (hasPrefixMatch) {
              const partial = hasPrefixMatch[1].toLowerCase()
              return HAS_SUGGESTIONS.filter(opt => opt.startsWith(partial)).map(
                opt => ({
                  token: `-has:${opt}`,
                  label: `-has:${opt}`,
                  description: `Exclude messages with ${opt}`,
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

  // 2. Patch SearchFilterMenu / SearchOptions component to render inline negative filter chips
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
