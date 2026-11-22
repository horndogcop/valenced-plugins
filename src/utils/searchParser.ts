import type {
  ParsedFilterToken,
  ParsedSearchQuery,
  SearchFilterKey,
  SimChannel,
  SimSearchMessage,
  SimUser,
} from '../types/simulator'

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

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const tokens = tokenizeRespectingQuotes(query)
  const serverTokens: string[] = []
  const positiveFilters: ParsedFilterToken[] = []
  const negativeFilters: ParsedFilterToken[] = []

  for (const raw of tokens) {
    const match = raw.match(/^(-|!)?([a-zA-Z]+):(.+)$/)
    if (match) {
      const negated = Boolean(match[1])
      const keyLower = match[2].toLowerCase() as SearchFilterKey
      const value = stripQuotes(match[3])

      if (SUPPORTED_KEYS.has(keyLower) && value.length > 0) {
        const parsed: ParsedFilterToken = {
          raw,
          negated,
          key: keyLower,
          value,
        }
        if (negated) {
          negativeFilters.push(parsed)
        } else {
          positiveFilters.push(parsed)
          if (keyLower === 'has' && value.toLowerCase() === 'attachment') {
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

export function extractFreeTextTerms(query: string): string[] {
  const tokens = tokenizeRespectingQuotes(query)
  const terms: string[] = []
  for (const raw of tokens) {
    const match = raw.match(/^(-|!)?([a-zA-Z]+):(.+)$/)
    if (match && SUPPORTED_KEYS.has(match[2].toLowerCase() as SearchFilterKey)) {
      continue
    }
    terms.push(stripQuotes(raw).toLowerCase())
  }
  return terms.filter(Boolean)
}

function msgHasImage(msg: SimSearchMessage): boolean {
  return Boolean(
    msg.attachments?.some(
      att =>
        att.content_type.startsWith('image/') || IMAGE_EXT_RE.test(att.filename),
    ),
  )
}

function msgHasVideo(msg: SimSearchMessage): boolean {
  return Boolean(
    msg.attachments?.some(
      att =>
        att.content_type.startsWith('video/') || VIDEO_EXT_RE.test(att.filename),
    ),
  )
}

function msgHasSound(msg: SimSearchMessage): boolean {
  return Boolean(
    msg.attachments?.some(
      att =>
        att.content_type.startsWith('audio/') || SOUND_EXT_RE.test(att.filename),
    ),
  )
}

function msgHasLink(msg: SimSearchMessage): boolean {
  return URL_RE.test(msg.content) || Boolean(msg.embeds?.some(e => Boolean(e.url)))
}

function matchesHas(msg: SimSearchMessage, val: string): boolean {
  switch (val.toLowerCase()) {
    case 'attachment':
    case 'file':
      return Boolean(msg.attachments && msg.attachments.length > 0)
    case 'image':
      return msgHasImage(msg)
    case 'video':
      return msgHasVideo(msg)
    case 'sound':
    case 'audio':
      return msgHasSound(msg)
    case 'embed':
      return Boolean(msg.embeds && msg.embeds.length > 0)
    case 'link':
      return msgHasLink(msg)
    default:
      return false
  }
}

function matchesToken(
  msg: SimSearchMessage,
  token: ParsedFilterToken,
  users: Record<string, SimUser>,
  channels: SimChannel[],
): boolean {
  switch (token.key) {
    case 'from': {
      const target = token.value.replace(/^@/, '').toLowerCase()
      const author = users[msg.authorId]
      if (!author) return false
      return (
        author.id.toLowerCase() === target ||
        author.username.toLowerCase() === target ||
        author.displayName.toLowerCase() === target
      )
    }
    case 'in': {
      const target = token.value.replace(/^#/, '').toLowerCase()
      const ch = channels.find(c => c.id === msg.channelId)
      if (!ch) return false
      return ch.id.toLowerCase() === target || ch.name.toLowerCase() === target
    }
    case 'mentions': {
      const target = token.value.replace(/^@/, '').toLowerCase()
      return Boolean(
        msg.mentions?.some(uid => {
          const u = users[uid]
          return (
            uid.toLowerCase() === target ||
            u?.username.toLowerCase() === target ||
            u?.displayName.toLowerCase() === target
          )
        }),
      )
    }
    case 'has':
      return matchesHas(msg, token.value)
    case 'pinned': {
      const expected = token.value.toLowerCase() !== 'false'
      return Boolean(msg.pinned) === expected
    }
    case 'before':
      return msg.date < token.value
    case 'after':
      return msg.date > token.value
    case 'during':
      return msg.date === token.value
    default:
      return false
  }
}

export function evaluateSearchCorpus(
  query: string,
  messages: SimSearchMessage[],
  users: Record<string, SimUser>,
  channels: SimChannel[],
): {
  parsed: ParsedSearchQuery
  serverMatches: SimSearchMessage[]
  finalMatches: SimSearchMessage[]
} {
  const parsed = parseSearchQuery(query)
  const textTerms = extractFreeTextTerms(query)

  // Step 1: Server-side evaluation (positive filters + text terms ONLY)
  const serverMatches = messages.filter(msg => {
    for (const term of textTerms) {
      if (!msg.content.toLowerCase().includes(term)) return false
    }
    for (const pos of parsed.positiveFilters) {
      if (!matchesToken(msg, pos, users, channels)) return false
    }
    return true
  })

  // Step 2: Client-side negative filter evaluation (repeatable)
  const finalMatches = serverMatches.filter(msg => {
    for (const neg of parsed.negativeFilters) {
      if (matchesToken(msg, neg, users, channels)) return false
    }
    return true
  })

  return { parsed, serverMatches, finalMatches }
}
