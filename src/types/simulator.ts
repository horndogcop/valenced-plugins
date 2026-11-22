export interface SimUser {
  id: string
  username: string
  displayName: string
  roleColor: string
  avatar: string
  bio: string
  guildIds: string[]
}

export interface SimGuild {
  id: string
  name: string
  shortName: string
}

export interface SimChannel {
  id: string
  guildId: string
  name: string
  topic: string
}

export interface SimMessage {
  id: string
  channelId: string
  authorId: string
  timestamp: string
  content: string
  isEphemeral?: boolean
  ephemeralChannels?: string[]
  ephemeralUsers?: string[]
}

export interface MentionBlockStorage {
  blockedUsers: Record<string, boolean>
  blockedChannels: Record<string, boolean>
}
