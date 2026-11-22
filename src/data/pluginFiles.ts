export interface PluginSourceFile {
  path: string
  language: 'json' | 'typescript' | 'markdown'
  summary: string
  content: string
}

export const PLUGIN_SOURCE_FILES: PluginSourceFile[] = [
  {
    path: 'plugins/mention-block/manifest.json',
    language: 'json',
    summary: 'Valenced plugin manifest crediting horndogcop and declaring JS bundle entry.',
    content: `{
  "format": 1,
  "id": "com.valenced.mention-block",
  "name": "Mention Block",
  "description": "Intercepts @user and #channel mention autocomplete to block users and channels from suggestions via context menus and commands.",
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
    path: 'plugins/mention-block/tsconfig.json',
    language: 'json',
    summary: 'Isolated TypeScript project extending the template tsconfig.base.json.',
    content: `{
  "extends": "../../tsconfig.base.json"
}
`,
  },
  {
    path: 'plugins/mention-block/js/index.ts',
    language: 'typescript',
    summary: 'Plugin entrypoint with no SettingsComponent; managed via context menus and commands.',
    content: `import { patchAutocomplete } from './patches/autocomplete'
import { patchCommands } from './patches/commands'
import { patchContextMenus } from './patches/contextMenus'
import { bindStorage, DEFAULT_STORAGE, setInterceptionBypass } from './storage'
import type { MentionBlockStorage } from './types'

// Intentionally no SettingsComponent: managed strictly via context menus and commands.
export default plugin<{ jsonStorage: MentionBlockStorage }>({
  jsonStorage: {
    load: true,
    default: DEFAULT_STORAGE,
  },

  async start(api) {
    bindStorage(api.jsonStorage)
    await api.jsonStorage.get()

    api.cleanup(
      patchAutocomplete(),
      patchContextMenus(),
      patchCommands(),
      () => setInterceptionBypass(false),
    )
  },

  stop() {
    setInterceptionBypass(false)
  },
})
`,
  },
  {
    path: 'plugins/mention-block/js/types.ts',
    language: 'typescript',
    summary: 'Storage schema and Discord command/user/channel type contracts.',
    content: `export interface MentionBlockStorage {
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
`,
  },
  {
    path: 'plugins/mention-block/js/storage.ts',
    language: 'typescript',
    summary: 'Persistent jsonStorage helpers and autocomplete interception bypass state.',
    content: `import type { JsonStorage } from '@valenced/json-storage'
import type { MentionBlockStorage } from './types'

export const DEFAULT_STORAGE: MentionBlockStorage = {
  blockedUsers: {},
  blockedChannels: {},
}

let storageRef: JsonStorage<MentionBlockStorage> | null = null
let bypassAutocompleteInterception = false

export function bindStorage(storage: JsonStorage<MentionBlockStorage>): void {
  storageRef = storage
}

export function getCachedStorage(): MentionBlockStorage {
  return {
    blockedUsers: { ...(storageRef?.cache?.blockedUsers ?? {}) },
    blockedChannels: { ...(storageRef?.cache?.blockedChannels ?? {}) },
  }
}

export function isUserBlocked(userId?: string): boolean {
  if (!userId) return false
  return Boolean(getCachedStorage().blockedUsers[userId])
}

export function isChannelBlocked(channelId?: string): boolean {
  if (!channelId) return false
  return Boolean(getCachedStorage().blockedChannels[channelId])
}

export async function setUserBlocked(
  userId: string,
  blocked: boolean,
): Promise<boolean> {
  if (!storageRef) return false
  const current = await storageRef.get()
  const nextUsers = { ...current.blockedUsers }
  if (blocked) {
    nextUsers[userId] = true
  } else {
    delete nextUsers[userId]
  }
  await storageRef.set({ blockedUsers: nextUsers })
  return blocked
}

export async function toggleUserBlocked(userId: string): Promise<boolean> {
  return setUserBlocked(userId, !isUserBlocked(userId))
}

export async function setChannelBlocked(
  channelId: string,
  blocked: boolean,
): Promise<boolean> {
  if (!storageRef) return false
  const current = await storageRef.get()
  const nextChannels = { ...current.blockedChannels }
  if (blocked) {
    nextChannels[channelId] = true
  } else {
    delete nextChannels[channelId]
  }
  await storageRef.set({ blockedChannels: nextChannels })
  return blocked
}

export async function toggleChannelBlocked(channelId: string): Promise<boolean> {
  return setChannelBlocked(channelId, !isChannelBlocked(channelId))
}

export function setInterceptionBypass(active: boolean): void {
  bypassAutocompleteInterception = active
}

export function isInterceptionBypassed(): boolean {
  return bypassAutocompleteInterception
}
`,
  },
  {
    path: 'plugins/mention-block/js/patches/autocomplete.ts',
    language: 'typescript',
    summary: 'Intercepts @user and #channel autocomplete results, with bypass for mention-remove.',
    content: `import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import {
  isChannelBlocked,
  isInterceptionBypassed,
  isUserBlocked,
  setInterceptionBypass,
} from '../storage'

export const REMOVE_COMMAND_NAME = 'mention-remove'
export const ADD_COMMAND_NAME = 'mention-add'

function getActiveSlashCommandName(channelId?: string): string | undefined {
  try {
    const stores = Stores as Record<string, any>
    const cmdStore =
      stores.ApplicationCommandAutocompleteStore ??
      stores.SlashCommandStore ??
      stores.ChatInputCommandStore
    if (cmdStore && channelId) {
      const active =
        cmdStore.getActiveCommand?.(channelId) ??
        cmdStore.getSelectedCommand?.(channelId)
      if (active?.name) return String(active.name)
    }

    const draftStore = stores.DraftStore
    if (draftStore && channelId) {
      const draft: unknown = draftStore.getDraft?.(channelId, 0)
      if (typeof draft === 'string' && draft.startsWith('/')) {
        const firstToken = draft.slice(1).trim().split(/\\s+/)[0]
        return firstToken
      }
    }
  } catch {
    // Ignore store lookup failures
  }
  return undefined
}

function shouldBypassForContext(channelId?: string): boolean {
  if (isInterceptionBypassed()) return true
  const activeCmd = getActiveSlashCommandName(channelId)
  return activeCmd === REMOVE_COMMAND_NAME
}

function filterUserList(users: unknown[]): unknown[] {
  return users.filter(entry => {
    if (!entry || typeof entry !== 'object') return true
    const rec = entry as Record<string, any>
    const userId = rec.user?.id ?? rec.id ?? rec.userId
    return !isUserBlocked(typeof userId === 'string' ? userId : undefined)
  })
}

function filterChannelList(channels: unknown[]): unknown[] {
  return channels.filter(entry => {
    if (!entry || typeof entry !== 'object') return true
    const rec = entry as Record<string, any>
    const channelId = rec.channel?.id ?? rec.id ?? rec.channelId
    return !isChannelBlocked(typeof channelId === 'string' ? channelId : undefined)
  })
}

function scrubAutocompletePayload(payload: any, channelId?: string): any {
  if (!payload || typeof payload !== 'object') return payload
  if (shouldBypassForContext(channelId)) return payload

  const target =
    payload.results && typeof payload.results === 'object'
      ? payload.results
      : payload

  if (Array.isArray(target.users)) target.users = filterUserList(target.users)
  if (Array.isArray(target.members)) target.members = filterUserList(target.members)
  if (Array.isArray(target.channels)) target.channels = filterChannelList(target.channels)
  if (Array.isArray(target.textChannels)) target.textChannels = filterChannelList(target.textChannels)
  if (Array.isArray(target.voiceChannels)) target.voiceChannels = filterChannelList(target.voiceChannels)
  if (Array.isArray(target.threads)) target.threads = filterChannelList(target.threads)

  return payload
}

export function patchAutocomplete(): () => void {
  const unpatches: Array<() => void> = []

  unpatches.push(
    getModules(
      withProps<{
        setActiveCommand?: (channelId: string, command: any) => void
      }>('setActiveCommand'),
      mod => {
        if (typeof mod.setActiveCommand === 'function') {
          unpatches.push(
            before(mod, 'setActiveCommand', ([, command]) => {
              setInterceptionBypass(command?.name === REMOVE_COMMAND_NAME)
            }),
          )
        }
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    getModules(
      withProps<{
        queryUserResults: (...args: any[]) => any
        queryChannelResults: (...args: any[]) => any
      }>('queryUserResults', 'queryChannelResults'),
      mod => {
        unpatches.push(
          after(mod, 'queryUserResults', (args, res) => {
            const channelId = args[0]?.id ?? args[0]?.channel_id
            return scrubAutocompletePayload(res, channelId)
          }),
        )
        unpatches.push(
          after(mod, 'queryChannelResults', (args, res) => {
            const channelId = args[0]?.id ?? args[0]?.channel_id
            return scrubAutocompletePayload(res, channelId)
          }),
        )
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    getModules(
      withProps<{ queryResults: (...args: any[]) => any }>('queryResults'),
      mod => {
        unpatches.push(
          after(mod, 'queryResults', (args, res) => {
            const channelId = args[0]?.id ?? args[0]?.channel_id
            if (res && typeof (res as Promise<any>).then === 'function') {
              return (res as Promise<any>).then(resolved =>
                scrubAutocompletePayload(resolved, channelId),
              )
            }
            return scrubAutocompletePayload(res, channelId)
          }),
        )
      },
      { max: 1 },
    ),
  )

  return () => {
    setInterceptionBypass(false)
    for (const unpatch of unpatches) {
      unpatch()
    }
  }
}
`,
  },
  {
    path: 'plugins/mention-block/js/patches/contextMenus.tsx',
    language: 'typescript',
    summary: 'Adds 2 entries to messages (user + channel), channel context menu, and user profile.',
    content: `import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators, ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import { afterJSX, insteadJSX } from '@valenced/react/jsx-runtime'
import { findInTree } from '@valenced/utils/tree'
import { createElement } from 'react'
import {
  isChannelBlocked,
  isUserBlocked,
  toggleChannelBlocked,
  toggleUserBlocked,
} from '../storage'
import type { DiscordChannel, DiscordMessage, DiscordUser } from '../types'
import type { FC, ReactElement } from 'react'

function findMessageInProps(source: unknown): DiscordMessage | undefined {
  if (!source || typeof source !== 'object') return undefined
  const rec = source as Record<string, any>
  if (rec.message && typeof rec.message.id === 'string') {
    return rec.message as DiscordMessage
  }
  return findInTree(
    rec,
    node => Boolean(node && typeof node === 'object' && node.message?.id),
    { maxDepth: 4 },
  )?.message as DiscordMessage | undefined
}

function findChannelInProps(source: unknown): DiscordChannel | undefined {
  if (!source || typeof source !== 'object') return undefined
  const rec = source as Record<string, any>
  if (rec.channel && typeof rec.channel.id === 'string') {
    return rec.channel as DiscordChannel
  }
  if (typeof rec.channelId === 'string') {
    const channelStore = (Stores as Record<string, any>).ChannelStore
    return channelStore?.getChannel?.(rec.channelId) ?? { id: rec.channelId }
  }
  return findInTree(
    rec,
    node => Boolean(node && typeof node === 'object' && node.channel?.id),
    { maxDepth: 4 },
  )?.channel as DiscordChannel | undefined
}

function findUserInProps(source: unknown): DiscordUser | undefined {
  if (!source || typeof source !== 'object') return undefined
  const rec = source as Record<string, any>
  if (rec.user && typeof rec.user.id === 'string') {
    return rec.user as DiscordUser
  }
  if (typeof rec.userId === 'string') {
    const userStore = (Stores as Record<string, any>).UserStore
    return userStore?.getUser?.(rec.userId) ?? { id: rec.userId }
  }
  return findInTree(
    rec,
    node => Boolean(node && typeof node === 'object' && node.user?.id),
    { maxDepth: 4 },
  )?.user as DiscordUser | undefined
}

async function handleToggleUserMention(user: DiscordUser) {
  const blockedNow = await toggleUserBlocked(user.id)
  ActionSheetActionCreators.hideActionSheet()
  const label = user.globalName || user.username || user.id
  ToastActionCreators.open('VALENCED_MENTION_BLOCK_USER', {
    text: blockedNow
      ? \`Blocked @\${label} from mention autocomplete\`
      : \`Restored @\${label} to mention autocomplete\`,
    icon: getAssetIdByName(blockedNow ? 'CircleXIcon' : 'CheckmarkIcon'),
  })
}

async function handleToggleChannelMention(channel: DiscordChannel) {
  const blockedNow = await toggleChannelBlocked(channel.id)
  ActionSheetActionCreators.hideActionSheet()
  const label = channel.name ? \`#\${channel.name}\` : channel.id
  ToastActionCreators.open('VALENCED_MENTION_BLOCK_CHANNEL', {
    text: blockedNow
      ? \`Blocked \${label} from mention autocomplete\`
      : \`Restored \${label} to mention autocomplete\`,
    icon: getAssetIdByName(blockedNow ? 'CircleXIcon' : 'CheckmarkIcon'),
  })
}

function createActionRow(
  key: string,
  label: string,
  iconName: string,
  onPress: () => void,
) {
  const iconId = getAssetIdByName(iconName)
  return createElement(Design.ActionSheetRow, {
    key,
    label,
    icon: iconId
      ? createElement(Design.ActionSheetRow.Icon ?? 'View', { source: iconId } as any)
      : undefined,
    onPress,
  } as any)
}

function appendRowsToSheetTree(tree: ReactElement, rows: ReactElement[]): ReactElement {
  const groupNode = findInTree(
    tree as Record<string, any>,
    node =>
      Boolean(
        node &&
          typeof node === 'object' &&
          (node.type === Design.ActionSheetRowGroup ||
            node.type === Design.TableRowGroup) &&
          Array.isArray(node.props?.children),
      ),
    { maxDepth: 8 },
  )

  if (groupNode && Array.isArray(groupNode.props?.children)) {
    for (const row of rows) {
      const exists = groupNode.props.children.some(
        (child: any) => child?.key === row.key,
      )
      if (!exists) {
        groupNode.props.children.push(row)
      }
    }
  }

  return tree
}

export function patchContextMenus(): () => void {
  const unpatches: Array<() => void> = []

  unpatches.push(
    before(ActionSheetActionCreators, 'openLazy', args => {
      const [sheetPromise, key, props] = args
      if (!sheetPromise) return

      const message = findMessageInProps(props)
      const channel =
        findChannelInProps(props) ??
        (message
          ? findChannelInProps({
              channelId: message.channel_id ?? message.channelId,
            })
          : undefined)
      const user = message?.author ?? findUserInProps(props)

      const sheetKey = typeof key === 'string' ? key : ''
      const isMessageSheet = /message/i.test(sheetKey) || Boolean(message?.id)
      const isChannelSheet =
        !isMessageSheet && (/channel/i.test(sheetKey) || Boolean(channel?.id))
      const isUserProfileSheet =
        !isMessageSheet &&
        !isChannelSheet &&
        (/user|profile/i.test(sheetKey) || Boolean(user?.id))

      if (!isMessageSheet && !isChannelSheet && !isUserProfileSheet) return

      args[0] = sheetPromise.then(mod => {
        if (!mod?.default || (mod.default as any).__valencedMentionBlockPatched) {
          return mod
        }
        const OriginalSheet = mod.default

        const WrappedSheet = (sheetProps: any) => {
          const rendered = OriginalSheet(sheetProps)
          if (!rendered) return rendered

          const rowsToInject: ReactElement[] = []

          if (isMessageSheet) {
            const msg = findMessageInProps(sheetProps) ?? message
            const msgUser = msg?.author ?? user
            const msgChannel =
              findChannelInProps(sheetProps) ??
              (msg
                ? findChannelInProps({
                    channelId: msg.channel_id ?? msg.channelId,
                  })
                : channel)

            if (msgUser?.id) {
              const blocked = isUserBlocked(msgUser.id)
              rowsToInject.push(
                createActionRow(
                  \`valenced-mb-msg-user-\${msgUser.id}\`,
                  blocked
                    ? 'Unblock User from Mentions'
                    : 'Block User from Mentions',
                  blocked ? 'CheckmarkIcon' : 'CircleXIcon',
                  () => void handleToggleUserMention(msgUser),
                ),
              )
            }

            if (msgChannel?.id) {
              const blocked = isChannelBlocked(msgChannel.id)
              rowsToInject.push(
                createActionRow(
                  \`valenced-mb-msg-chan-\${msgChannel.id}\`,
                  blocked
                    ? 'Unblock Channel from Mentions'
                    : 'Block Channel from Mentions',
                  blocked ? 'CheckmarkIcon' : 'CircleXIcon',
                  () => void handleToggleChannelMention(msgChannel),
                ),
              )
            }
          } else if (isChannelSheet && channel?.id) {
            const targetChannel = findChannelInProps(sheetProps) ?? channel
            const blocked = isChannelBlocked(targetChannel.id)
            rowsToInject.push(
              createActionRow(
                \`valenced-mb-chan-\${targetChannel.id}\`,
                blocked
                  ? 'Unblock Channel from Mentions'
                  : 'Block Channel from Mentions',
                blocked ? 'CheckmarkIcon' : 'CircleXIcon',
                () => void handleToggleChannelMention(targetChannel),
              ),
            )
          } else if (isUserProfileSheet && user?.id) {
            const targetUser = findUserInProps(sheetProps) ?? user
            const blocked = isUserBlocked(targetUser.id)
            rowsToInject.push(
              createActionRow(
                \`valenced-mb-user-\${targetUser.id}\`,
                blocked
                  ? 'Unblock User from Mentions'
                  : 'Block User from Mentions',
                blocked ? 'CheckmarkIcon' : 'CircleXIcon',
                () => void handleToggleUserMention(targetUser),
              ),
            )
          }

          return rowsToInject.length > 0
            ? appendRowsToSheetTree(rendered, rowsToInject)
            : rendered
        }

        ;(WrappedSheet as any).__valencedMentionBlockPatched = true
        return { ...mod, default: WrappedSheet }
      })
    }),
  )

  unpatches.push(
    getModules(
      withProps<{ UserProfileActions: FC<any> }>('UserProfileActions'),
      ({ UserProfileActions }) => {
        unpatches.push(
          insteadJSX(UserProfileActions, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const user = findUserInProps(props)
            if (!user?.id || !rendered || typeof rendered !== 'object') {
              return rendered
            }

            const blocked = isUserBlocked(user.id)
            const children = (rendered as ReactElement<any>).props?.children
            if (Array.isArray(children)) {
              const btnKey = \`valenced-mb-profile-btn-\${user.id}\`
              if (!children.some((c: any) => c?.key === btnKey)) {
                children.push(
                  createElement(Design.Button, {
                    key: btnKey,
                    size: 'sm',
                    variant: blocked ? 'secondary' : 'destructive',
                    text: blocked ? 'Unblock Mentions' : 'Block Mentions',
                    onPress: () => void handleToggleUserMention(user),
                  }),
                )
              }
            }

            return rendered
          }),
        )
      },
      { max: 1 },
    ),
  )

  if (Design.ContextMenu) {
    unpatches.push(
      afterJSX(Design.ContextMenu, ([, props], res) => {
        if (!res || typeof res !== 'object') return res
        const resProps = (res as ReactElement<any>).props
        if (!Array.isArray(resProps?.children)) return res

        const msg = findMessageInProps(props)
        const channel = findChannelInProps(props)
        const user = msg?.author ?? findUserInProps(props)

        if (user?.id) {
          const blocked = isUserBlocked(user.id)
          const itemKey = \`valenced-mb-ctx-user-\${user.id}\`
          if (!resProps.children.some((c: any) => c?.key === itemKey)) {
            resProps.children.push(
              createElement(Design.ContextMenuItem, {
                key: itemKey,
                label: blocked
                  ? 'Unblock User from Mentions'
                  : 'Block User from Mentions',
                action: () => void handleToggleUserMention(user),
              } as any),
            )
          }
        }

        const targetChannel =
          channel ??
          (msg
            ? findChannelInProps({ channelId: msg.channel_id ?? msg.channelId })
            : undefined)
        if (targetChannel?.id) {
          const blocked = isChannelBlocked(targetChannel.id)
          const itemKey = \`valenced-mb-ctx-chan-\${targetChannel.id}\`
          if (!resProps.children.some((c: any) => c?.key === itemKey)) {
            resProps.children.push(
              createElement(Design.ContextMenuItem, {
                key: itemKey,
                label: blocked
                  ? 'Unblock Channel from Mentions'
                  : 'Block Channel from Mentions',
                action: () => void handleToggleChannelMention(targetChannel),
              } as any),
            )
          }
        }

        return res
      }),
    )
  }

  return () => {
    for (const unpatch of unpatches) {
      unpatch()
    }
  }
}
`,
  },
  {
    path: 'plugins/mention-block/js/patches/commands.ts',
    language: 'typescript',
    summary: 'Registers /mention-add, /mention-remove (bypass), and ephemeral /mention-list.',
    content: `import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
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
  const mentionMatch = trimmed.match(/^<(?:@!?|#)(\\d+)>$/)
  if (mentionMatch) return mentionMatch[1]
  if (/^\\d+$/.test(trimmed)) return trimmed
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
  const [messageActions] = lookupModule<{
    sendBotMessage?: (channelId: string, content: string) => void
  }>(withProps('sendBotMessage'))

  if (typeof messageActions?.sendBotMessage === 'function') {
    messageActions.sendBotMessage(channelId, content)
    return
  }

  const dispatcher = (Stores as Record<string, any>).Dispatcher
  dispatcher?.dispatch?.({
    type: 'MESSAGE_CREATE',
    channelId,
    message: {
      id: \`valenced-ephemeral-\${Date.now()}\`,
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
          \`Blocked <@\${targetId}> from mention autocomplete.\`,
        )
      } else if (subcommand === 'channel') {
        await setChannelBlocked(targetId, true)
        sendEphemeralMessage(
          channelId,
          \`Blocked <#\${targetId}> from mention autocomplete.\`,
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
          \`Restored <@\${targetId}> to mention autocomplete.\`,
        )
      } else if (subcommand === 'channel') {
        await setChannelBlocked(targetId, false)
        sendEphemeralMessage(
          channelId,
          \`Restored <#\${targetId}> to mention autocomplete.\`,
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
          'Run \`/mention-list\` inside a server channel to view blocked users and channels for that server.',
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
          ? serverChannels.map(id => \`• <#\${id}>\`).join('\\n')
          : '• None'

      const userLines =
        serverUsers.length > 0
          ? serverUsers.map(id => \`• <@\${id}>\`).join('\\n')
          : '• None'

      const message = [
        '**Blocked Mentions in This Server**',
        '',
        '**Blocked Channels**',
        channelLines,
        '',
        '**Blocked Users**',
        userLines,
      ].join('\\n')

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
        BUILT_IN_COMMANDS?: BuiltInCommand[]
        getBuiltInCommands?: (type?: number) => BuiltInCommand[]
      }>('getBuiltInCommands'),
      mod => {
        if (Array.isArray(mod.BUILT_IN_COMMANDS)) {
          for (const cmd of commands) {
            if (!mod.BUILT_IN_COMMANDS.some(c => c.id === cmd.id)) {
              mod.BUILT_IN_COMMANDS.push(cmd)
            }
          }
          unpatches.push(() => {
            if (!Array.isArray(mod.BUILT_IN_COMMANDS)) return
            for (let i = mod.BUILT_IN_COMMANDS.length - 1; i >= 0; i--) {
              if (commandIds.has(mod.BUILT_IN_COMMANDS[i]?.id)) {
                mod.BUILT_IN_COMMANDS.splice(i, 1)
              }
            }
          })
        }

        if (typeof mod.getBuiltInCommands === 'function') {
          unpatches.push(
            after(mod, 'getBuiltInCommands', ([type], res) => {
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
`,
  },
  {
    path: 'package.json',
    language: 'json',
    summary: 'Template root package.json wired to @valenced/plugin-cli and @valenced/types.',
    content: `{
  "name": "@valenced/mention-block-repo",
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
  "name": "Mention Block Repository",
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
