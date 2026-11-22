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
  serverQuery: string
  positiveFilters: ParsedFilterToken[]
  negativeFilters: ParsedFilterToken[]
}

export interface SimUser {
  id: string
  username: string
  displayName: string
  roleColor: string
  avatar: string
}

export interface SimChannel {
  id: string
  name: string
}

export interface SimAttachment {
  id: string
  filename: string
  content_type: string
  sizeLabel: string
  url?: string
}

export interface SimEmbed {
  title: string
  domain: string
  url: string
  description: string
}

export interface SimSearchMessage {
  id: string
  channelId: string
  authorId: string
  timestamp: string
  date: string
  content: string
  pinned?: boolean
  mentions?: string[]
  attachments?: SimAttachment[]
  embeds?: SimEmbed[]
}
