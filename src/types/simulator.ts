export type ImageDisplayMode = 'hidden' | 'blurred'

export interface PluginSettings {
  imageMode: ImageDisplayMode
  nsfwOnly: boolean
  hideText: boolean
  hiddenUsers: Record<string, boolean>
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
  nsfw: boolean
  topic: string
}

export interface MessageSegment {
  type: 'text' | 'spoiler'
  value: string
}

export interface SimMessage {
  id: string
  channelId: string
  authorId: string
  timestamp: string
  isSilent?: boolean
  segments: MessageSegment[]
  image?: {
    url: string
    alt: string
    filename: string
    dimensions: string
  }
}
