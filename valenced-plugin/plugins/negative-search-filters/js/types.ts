export type SearchFilterKey =
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
