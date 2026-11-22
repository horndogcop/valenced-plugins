import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import {
  getCachedStorage,
  setChannelBlocked,
  setInterceptionBypass,
  setUserBlocked,
} from '../storage'
import { ADD_COMMAND_NAME, REMOVE_COMMAND_NAME } from './autocomplete'
import type {
  BuiltInCommand,
  CommandContext,
  CommandOptionArg,
} from '../types'

const ApplicationCommandType = {
  CHAT: 1,
} as const

const ApplicationCommandInputType = {
  BUILT_IN: 0,
} as const

const ApplicationCommandOptionType = {
  SUB_COMMAND: 1,
  USER: 6,
  CHANNEL: 7,
} as const

function parseMentionOrId(raw?: string): string | undefined {
  if (!raw) return undefined
  const trimmed = String(raw).trim()
  const mentionMatch = trimmed.match(/^<(?:@!?|#)(\d+)>$/)
  if (mentionMatch) return mentionMatch[1]
  if (/^\d+$/.test(trimmed)) return trimmed
  return trimmed
}

function getSubcommandAndTarget(args: CommandOptionArg[]): {
  subcommand?: string
  targetId?: string
} {
  if (!Array.isArray(args) || args.length === 0) return {}
  const first = args[0]
  if (
    first.type === ApplicationCommandOptionType.SUB_COMMAND ||
    Array.isArray(first.options)
  ) {
    const nested = first.options?.[0]
    return {
      subcommand: first.name,
      targetId: parseMentionOrId(nested?.value),
    }
  }
  return {
    subcommand: first.name,
    targetId: parseMentionOrId(first.value),
  }
}

function sendEphemeralMessage(channelId: string, content: string): void {
  const [messageActions] = lookupModule(
    withProps<{
      sendBotMessage: (channelId: string, content: string) => void
    }>('sendBotMessage'),
  )

  if (typeof messageActions?.sendBotMessage === 'function') {
    messageActions.sendBotMessage(channelId, content)
    return
  }

  const dispatcher = (Stores as Record<string, any>).Dispatcher
  dispatcher?.dispatch?.({
    type: 'MESSAGE_CREATE',
    channelId,
    message: {
      id: `valenced-ephemeral-${Date.now()}`,
      channel_id: channelId,
      content,
      flags: 64,
      author: {
        id: '1',
        username: 'Clyde',
        bot: true,
      },
      timestamp: new Date().toISOString(),
    },
  })
}

function createCommands(): BuiltInCommand[] {
  const addCommand: BuiltInCommand = {
    id: '-91101',
    type: ApplicationCommandType.CHAT,
    inputType: ApplicationCommandInputType.BUILT_IN,
    applicationId: '-1',
    name: ADD_COMMAND_NAME,
    displayName: ADD_COMMAND_NAME,
    description:
      'Block a user or channel from appearing in mention autocomplete.',
    displayDescription:
      'Block a user or channel from appearing in mention autocomplete.',
    options: [
      {
        name: 'user',
        displayName: 'user',
        description:
          'Block a user from @mention autocomplete (accepts intercepted mentions).',
        displayDescription:
          'Block a user from @mention autocomplete (accepts intercepted mentions).',
        type: ApplicationCommandOptionType.SUB_COMMAND,
        options: [
          {
            name: 'target',
            displayName: 'target',
            description: 'User mention (@user) or user ID to block.',
            displayDescription: 'User mention (@user) or user ID to block.',
            type: ApplicationCommandOptionType.USER,
            required: true,
          },
        ],
      },
      {
        name: 'channel',
        displayName: 'channel',
        description:
          'Block a channel from #mention autocomplete (accepts intercepted mentions).',
        displayDescription:
          'Block a channel from #mention autocomplete (accepts intercepted mentions).',
        type: ApplicationCommandOptionType.SUB_COMMAND,
        options: [
          {
            name: 'target',
            displayName: 'target',
            description: 'Channel mention (#channel) or channel ID to block.',
            displayDescription:
              'Channel mention (#channel) or channel ID to block.',
            type: ApplicationCommandOptionType.CHANNEL,
            required: true,
          },
        ],
      },
    ],
    async execute(args, ctx) {
      const channelId = ctx.channel?.id
      if (!channelId) return
      const { subcommand, targetId } = getSubcommandAndTarget(args)
      if (!targetId) {
        sendEphemeralMessage(
          channelId,
          'Specify a valid user or channel mention.',
        )
        return
      }

      if (subcommand === 'user') {
        await setUserBlocked(targetId, true)
        sendEphemeralMessage(
          channelId,
          `Blocked <@${targetId}> from mention autocomplete.`,
        )
      } else if (subcommand === 'channel') {
        await setChannelBlocked(targetId, true)
        sendEphemeralMessage(
          channelId,
          `Blocked <#${targetId}> from mention autocomplete.`,
        )
      }
    },
  }

  const removeCommand: BuiltInCommand = {
    id: '-91102',
    type: ApplicationCommandType.CHAT,
    inputType: ApplicationCommandInputType.BUILT_IN,
    applicationId: '-1',
    name: REMOVE_COMMAND_NAME,
    displayName: REMOVE_COMMAND_NAME,
    description:
      'Restore a blocked user or channel to mention autocomplete (bypasses interception).',
    displayDescription:
      'Restore a blocked user or channel to mention autocomplete (bypasses interception).',
    options: [
      {
        name: 'user',
        displayName: 'user',
        description: 'Restore a blocked user to @mention autocomplete.',
        displayDescription: 'Restore a blocked user to @mention autocomplete.',
        type: ApplicationCommandOptionType.SUB_COMMAND,
        options: [
          {
            name: 'target',
            displayName: 'target',
            description: 'User to restore (interception bypassed).',
            displayDescription: 'User to restore (interception bypassed).',
            type: ApplicationCommandOptionType.USER,
            required: true,
          },
        ],
      },
      {
        name: 'channel',
        displayName: 'channel',
        description: 'Restore a blocked channel to #mention autocomplete.',
        displayDescription:
          'Restore a blocked channel to #mention autocomplete.',
        type: ApplicationCommandOptionType.SUB_COMMAND,
        options: [
          {
            name: 'target',
            displayName: 'target',
            description: 'Channel to restore (interception bypassed).',
            displayDescription: 'Channel to restore (interception bypassed).',
            type: ApplicationCommandOptionType.CHANNEL,
            required: true,
          },
        ],
      },
    ],
    async execute(args, ctx) {
      setInterceptionBypass(false)
      const channelId = ctx.channel?.id
      if (!channelId) return
      const { subcommand, targetId } = getSubcommandAndTarget(args)
      if (!targetId) {
        sendEphemeralMessage(
          channelId,
          'Specify a valid user or channel mention.',
        )
        return
      }

      if (subcommand === 'user') {
        await setUserBlocked(targetId, false)
        sendEphemeralMessage(
          channelId,
          `Restored <@${targetId}> to mention autocomplete.`,
        )
      } else if (subcommand === 'channel') {
        await setChannelBlocked(targetId, false)
        sendEphemeralMessage(
          channelId,
          `Restored <#${targetId}> to mention autocomplete.`,
        )
      }
    },
  }

  // Listing command: no subcommands, ephemeral message scoped to current server.
  // Command mentions are omitted because Discord/Valenced cannot prefill parameters.
  const listCommand: BuiltInCommand = {
    id: '-91103',
    type: ApplicationCommandType.CHAT,
    inputType: ApplicationCommandInputType.BUILT_IN,
    applicationId: '-1',
    name: 'mention-list',
    displayName: 'mention-list',
    description: 'List blocked users and channels from the current server.',
    displayDescription:
      'List blocked users and channels from the current server.',
    execute(_args, ctx: CommandContext) {
      const channelId = ctx.channel?.id
      if (!channelId) return

      const stores = Stores as Record<string, any>
      const channelStore = stores.ChannelStore
      const guildMemberStore = stores.GuildMemberStore
      const currentChannel = ctx.channel ?? channelStore?.getChannel?.(channelId)
      const guildId: string | undefined =
        ctx.guild?.id ?? currentChannel?.guild_id ?? currentChannel?.guildId

      if (!guildId) {
        sendEphemeralMessage(
          channelId,
          'Run `/mention-list` inside a server channel to view blocked users and channels for that server.',
        )
        return
      }

      const { blockedUsers, blockedChannels } = getCachedStorage()

      const serverChannels = Object.keys(blockedChannels).filter(id => {
        if (!blockedChannels[id]) return false
        const ch = channelStore?.getChannel?.(id)
        return (ch?.guild_id ?? ch?.guildId) === guildId
      })

      const serverUsers = Object.keys(blockedUsers).filter(id => {
        if (!blockedUsers[id]) return false
        return Boolean(guildMemberStore?.getMember?.(guildId, id))
      })

      const channelLines =
        serverChannels.length > 0
          ? serverChannels.map(id => `• <#${id}>`).join('\n')
          : '• None'

      const userLines =
        serverUsers.length > 0
          ? serverUsers.map(id => `• <@${id}>`).join('\n')
          : '• None'

      const message = [
        '**Blocked Mentions in This Server**',
        '',
        '**Blocked Channels**',
        channelLines,
        '',
        '**Blocked Users**',
        userLines,
      ].join('\n')

      sendEphemeralMessage(channelId, message)
    },
  }

  return [addCommand, removeCommand, listCommand]
}

export function patchCommands(): () => void {
  const unpatches: Array<() => void> = []
  const commands = createCommands()
  const commandIds = new Set(commands.map(c => c.id))

  unpatches.push(
    getModules(
      withProps<{
        getBuiltInCommands: (type?: number) => BuiltInCommand[]
      }>('getBuiltInCommands'),
      mod => {
        const builtInList = (mod as { BUILT_IN_COMMANDS?: BuiltInCommand[] })
          .BUILT_IN_COMMANDS
        if (Array.isArray(builtInList)) {
          for (const cmd of commands) {
            if (!builtInList.some(c => c.id === cmd.id)) {
              builtInList.push(cmd)
            }
          }
          unpatches.push(() => {
            if (!Array.isArray(builtInList)) return
            for (let i = builtInList.length - 1; i >= 0; i--) {
              if (commandIds.has(builtInList[i]?.id)) {
                builtInList.splice(i, 1)
              }
            }
          })
        }

        if (typeof mod.getBuiltInCommands === 'function') {
          unpatches.push(
            instead(mod, 'getBuiltInCommands', (args, orig) => {
              const res = orig(...args)
              const [type] = args
              if (type !== undefined && type !== ApplicationCommandType.CHAT) {
                return res
              }
              if (!Array.isArray(res)) return res
              const existing = new Set(res.map((c: BuiltInCommand) => c.id))
              const missing = commands.filter(c => !existing.has(c.id))
              return missing.length > 0 ? [...res, ...missing] : res
            }),
          )
        }
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
