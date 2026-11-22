import type {
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

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|heic)(\?|$)/i
const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|avi)(\?|$)/i
const SOUND_EXT_RE = /\.(mp3|wav|ogg|flac|m4a|opus)(\?|$)/i
const URL_RE = /https?:\/\/[^\s<>]+/i

function tokenizeRespectingQuotes(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
    } else if (/\s/.test(ch) && !inQuotes) {
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

/**
 * Parses an inline Discord search query into server-safe query text, positive filters,
 * and repeatable client-side negative filters (`-from:`, `-in:`, `-has:`, etc.).
 */
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
          // Normalize `has:attachment` to Discord's native `has:file` for server queries
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
      return Boolean(msg.content && msg.content.includes(`<@${target}>`))
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return false
      if (filter.key === 'before') return msgDate < targetDate
      if (filter.key === 'after') return msgDate > targetDate
      return msgDate === targetDate
    }
    default:
      return false
  }
}

/**
 * Returns true if `msg` passes ALL positive filters (when evaluated locally)
 * AND passes EVERY repeatable negative filter (i.e. matches NONE of them).
 */
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
