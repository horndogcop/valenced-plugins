import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before, instead } from '@valenced/patcher'
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
        const firstToken = draft.slice(1).trim().split(/\s+/)[0]
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

  const target = payload.results && typeof payload.results === 'object'
    ? payload.results
    : payload

  if (Array.isArray(target.users)) {
    target.users = filterUserList(target.users)
  }
  if (Array.isArray(target.members)) {
    target.members = filterUserList(target.members)
  }
  if (Array.isArray(target.channels)) {
    target.channels = filterChannelList(target.channels)
  }
  if (Array.isArray(target.textChannels)) {
    target.textChannels = filterChannelList(target.textChannels)
  }
  if (Array.isArray(target.voiceChannels)) {
    target.voiceChannels = filterChannelList(target.voiceChannels)
  }
  if (Array.isArray(target.threads)) {
    target.threads = filterChannelList(target.threads)
  }

  return payload
}

export function patchAutocomplete(): () => void {
  const unpatches: Array<() => void> = []

  // 1. Track active command selection so `mention-remove` bypasses interception
  unpatches.push(
    getModules(
      withProps<{
        setActiveCommand: (channelId: string, command: any) => void
      }>('setActiveCommand'),
      mod => {
        if (typeof mod.setActiveCommand === 'function') {
          unpatches.push(
            before(mod, 'setActiveCommand', args => {
              const [, command] = args
              setInterceptionBypass(command?.name === REMOVE_COMMAND_NAME)
              return args
            }),
          )
        }
      },
      { max: 1 },
    ),
  )

  // 2. Patch queryUserResults & queryChannelResults (Discord React Native AutocompleteManager)
  unpatches.push(
    getModules(
      withProps<{
        queryUserResults: (...args: any[]) => any
        queryChannelResults: (...args: any[]) => any
      }>('queryUserResults', 'queryChannelResults'),
      mod => {
        unpatches.push(
          instead(mod, 'queryUserResults', (args, orig) => {
            const res = orig(...args)
            const channelId = args[0]?.id ?? args[0]?.channel_id
            return scrubAutocompletePayload(res, channelId)
          }),
        )
        unpatches.push(
          instead(mod, 'queryChannelResults', (args, orig) => {
            const res = orig(...args)
            const channelId = args[0]?.id ?? args[0]?.channel_id
            return scrubAutocompletePayload(res, channelId)
          }),
        )
      },
      { max: 1 },
    ),
  )

  // 3. Patch unified queryResults / getAutocompleteResults used by mention popups & command options
  unpatches.push(
    getModules(
      withProps<{ queryResults: (...args: any[]) => any }>('queryResults'),
      mod => {
        unpatches.push(
          instead(mod, 'queryResults', (args, orig) => {
            const res = orig(...args)
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
