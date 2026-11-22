export interface MentionBlockStorage {
  /** Blocked user IDs excluded from @user mention autocomplete suggestions. */
  blockedUsers: Record<string, boolean>
  /** Blocked channel IDs excluded from #channel mention autocomplete suggestions. */
  blockedChannels: Record<string, boolean>
}

export interface DiscordUser {
  id: string
  username?: string
  globalName?: string
}

export interface DiscordChannel {
  id: string
  name?: string
  guild_id?: string
  guildId?: string
}

export interface DiscordMessage {
  id: string
  channel_id?: string
  channelId?: string
  author?: DiscordUser
}

export interface CommandOptionArg {
  name: string
  type: number
  value?: string
  options?: CommandOptionArg[]
}

export interface CommandContext {
  channel?: DiscordChannel
  guild?: { id: string; name?: string }
}

export interface BuiltInCommand {
  id: string
  type: number
  inputType: number
  applicationId: string
  name: string
  displayName: string
  description: string
  displayDescription: string
  options?: Array<{
    name: string
    displayName: string
    description: string
    displayDescription: string
    type: number
    required?: boolean
    options?: Array<{
      name: string
      displayName: string
      description: string
      displayDescription: string
      type: number
      required?: boolean
    }>
  }>
  execute: (args: CommandOptionArg[], ctx: CommandContext) => void | Promise<void>
}
