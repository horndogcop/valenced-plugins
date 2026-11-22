import type { JsonStorage } from '@valenced/json-storage'
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

/**
 * Temporarily bypasses autocomplete filtering (used by the remove command
 * so blocked users and channels appear in suggestion lists).
 */
export function setInterceptionBypass(active: boolean): void {
  bypassAutocompleteInterception = active
}

export function isInterceptionBypassed(): boolean {
  return bypassAutocompleteInterception
}
