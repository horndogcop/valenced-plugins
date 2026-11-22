export interface PluginSourceFile {
  path: string
  language: 'json' | 'typescript' | 'markdown'
  summary: string
  content: string
}

export const PLUGIN_SOURCE_FILES: PluginSourceFile[] = [
  {
    path: 'plugins/hide-user-content/manifest.json',
    language: 'json',
    summary: 'Valenced plugin manifest declaring ID, API constraints, and JS bundle entry.',
    content: `{
  "format": 1,
  "id": "com.valenced.hide-user-content",
  "name": "Hide User Content",
  "description": "Adds a user context menu item to hide or blur images and spoiler-wrap message blocks from selected users.",
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
    path: 'plugins/hide-user-content/tsconfig.json',
    language: 'json',
    summary: 'Isolated TypeScript project extending the template tsconfig.base.json.',
    content: `{
  "extends": "../../tsconfig.base.json"
}
`,
  },
  {
    path: 'plugins/hide-user-content/js/index.ts',
    language: 'typescript',
    summary: 'Plugin lifecycle entrypoint registering jsonStorage, patches, and SettingsComponent.',
    content: `import SettingsPage from './components/SettingsPage'
import { patchMessageHiding } from './patches/messageHiding'
import { patchUserContextMenu } from './patches/userContextMenu'
import { resetTransientMessageState } from './state'
import { bindSettingsStorage, DEFAULT_SETTINGS } from './storage'
import type { PluginSettings } from './types'

export default plugin<{ jsonStorage: PluginSettings }>({
  jsonStorage: {
    load: true,
    default: DEFAULT_SETTINGS,
  },

  async start(api) {
    bindSettingsStorage(api.jsonStorage)
    await api.jsonStorage.get()

    api.cleanup(
      patchUserContextMenu(),
      patchMessageHiding(),
      () => resetTransientMessageState(),
    )
  },

  stop() {
    resetTransientMessageState()
  },

  SettingsComponent: SettingsPage,
})
`,
  },
  {
    path: 'plugins/hide-user-content/js/types.ts',
    language: 'typescript',
    summary: 'Settings schema and Discord mobile message/user type definitions.',
    content: `export type ImageDisplayMode = 'hidden' | 'blurred'

export interface PluginSettings {
  /** Whether images from hidden users are hidden or blurred. */
  imageMode: ImageDisplayMode
  /** Whether hiding only applies inside NSFW channels. */
  nsfwOnly: boolean
  /** Whether only images are hidden (false) or both text and images are hidden (true). */
  hideText: boolean
  /** Map of hidden user IDs keyed by Discord snowflake. */
  hiddenUsers: Record<string, boolean>
}

export interface DiscordChannelLike {
  id: string
  nsfw?: boolean
  isNSFW?: () => boolean
}

export interface DiscordUserLike {
  id: string
  username?: string
  globalName?: string
}

export interface DiscordAttachmentLike {
  id?: string
  url?: string
  proxy_url?: string
  content_type?: string
  width?: number
  height?: number
  spoiler?: boolean
}

export interface DiscordMessageLike {
  id: string
  channel_id?: string
  channelId?: string
  author?: DiscordUserLike
  content?: string
  attachments?: DiscordAttachmentLike[]
  embeds?: Array<{
    type?: string
    image?: { url?: string; proxyURL?: string }
    thumbnail?: { url?: string; proxyURL?: string }
  }>
  flags?: number
}
`,
  },
  {
    path: 'plugins/hide-user-content/js/storage.ts',
    language: 'typescript',
    summary: 'Persistent jsonStorage bindings and NSFW channel gating checks.',
    content: `import { Stores } from '@valenced/discord/flux'
import type { JsonStorage } from '@valenced/json-storage'
import type { DiscordChannelLike, PluginSettings } from './types'

export const DEFAULT_SETTINGS: PluginSettings = {
  imageMode: 'hidden',
  nsfwOnly: false,
  hideText: false,
  hiddenUsers: {},
}

let storageRef: JsonStorage<PluginSettings> | null = null

export function bindSettingsStorage(storage: JsonStorage<PluginSettings>) {
  storageRef = storage
}

export function getSettingsStorage(): JsonStorage<PluginSettings> {
  if (!storageRef) {
    throw new Error('Hide User Content storage has not been initialized')
  }
  return storageRef
}

export function getCachedSettings(): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(storageRef?.cache as Partial<PluginSettings> | undefined),
  }
}

export function isUserHidden(settings: PluginSettings, userId?: string): boolean {
  if (!userId) return false
  return Boolean(settings.hiddenUsers[userId])
}

export async function toggleHiddenUser(userId: string): Promise<boolean> {
  const storage = getSettingsStorage()
  const current = await storage.get()
  const nextHidden = !current.hiddenUsers[userId]
  const nextUsers = { ...current.hiddenUsers }
  if (nextHidden) {
    nextUsers[userId] = true
  } else {
    delete nextUsers[userId]
  }
  await storage.set({ hiddenUsers: nextUsers })
  return nextHidden
}

export function isChannelNsfw(channelId?: string): boolean {
  if (!channelId) return false
  const channelStore = (Stores as Record<string, any>).ChannelStore
  const channel: DiscordChannelLike | undefined = channelStore?.getChannel?.(channelId)
  if (!channel) return false
  if (typeof channel.isNSFW === 'function') return Boolean(channel.isNSFW())
  return Boolean(channel.nsfw)
}

export function shouldHideMessage(
  settings: PluginSettings,
  authorId?: string,
  channelId?: string,
): boolean {
  if (!isUserHidden(settings, authorId)) return false
  if (settings.nsfwOnly && !isChannelNsfw(channelId)) return false
  return true
}
`,
  },
  {
    path: 'plugins/hide-user-content/js/state.ts',
    language: 'typescript',
    summary: 'Per-message state store for block spoiler reveals and post-timestamp image toggles.',
    content: `import { useEffect, useState } from 'react'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'

const revealedBlocks = new Set<string>()
const displayedImages = new Set<string>()
const listeners = new Set<() => void>()
let revision = 0

function emitChange() {
  revision += 1
  for (const listener of listeners) {
    listener()
  }
}

export function isBlockRevealed(messageId: string): boolean {
  return revealedBlocks.has(messageId)
}

export function revealBlock(messageId: string): void {
  if (revealedBlocks.has(messageId)) return
  revealedBlocks.add(messageId)
  emitChange()
}

export function collapseBlock(messageId: string): void {
  if (!revealedBlocks.delete(messageId)) return
  emitChange()
}

export function isImageDisplayed(messageId: string): boolean {
  return displayedImages.has(messageId)
}

export function toggleImageDisplayed(messageId: string): boolean {
  const next = !displayedImages.has(messageId)
  if (next) {
    displayedImages.add(messageId)
  } else {
    displayedImages.delete(messageId)
  }
  emitChange()
  refreshActiveChannelRows()
  return next
}

export function resetTransientMessageState(): void {
  revealedBlocks.clear()
  displayedImages.clear()
  emitChange()
}

export function useMessageStateRevision(): number {
  const [rev, setRev] = useState(revision)
  useEffect(() => {
    const listener = () => setRev(revision)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return rev
}

export function refreshActiveChannelRows(): void {
  try {
    const selectedChannelStore = (Stores as Record<string, any>).SelectedChannelStore
    const channelId = selectedChannelStore?.getChannelId?.()
    if (!channelId) return
    Dispatcher?.dispatch?.({
      type: 'MESSAGE_UPDATE',
      message: { id: '__valenced_hide_refresh__', channel_id: channelId },
    })
  } catch {
    // Non-fatal if dispatcher isn't ready yet
  }
}
`,
  },
  {
    path: 'plugins/hide-user-content/js/patches/userContextMenu.tsx',
    language: 'typescript',
    summary: 'Patches ActionSheetActionCreators.openLazy and Design.ContextMenu for users.',
    content: `import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators, ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { before } from '@valenced/patcher'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { findInTree } from '@valenced/utils/tree'
import { createElement } from 'react'
import { refreshActiveChannelRows } from '../state'
import { getCachedSettings, isUserHidden, toggleHiddenUser } from '../storage'
import type { DiscordUserLike } from '../types'
import type { ReactElement } from 'react'

const USER_SHEET_KEYS = new Set([
  'UserProfileOverflow',
  'UserActionSheet',
  'GuildUserSheet',
  'UserContextMenu',
  'MessageAuthorActionSheet',
  'LongPressUserActionSheet',
])

function extractTargetUser(source: unknown): DiscordUserLike | undefined {
  if (!source || typeof source !== 'object') return undefined
  const record = source as Record<string, any>
  if (record.user && typeof record.user.id === 'string') {
    return record.user as DiscordUserLike
  }
  if (typeof record.userId === 'string') {
    return { id: record.userId }
  }
  return findInTree(
    record,
    node =>
      Boolean(
        node &&
          typeof node === 'object' &&
          ((node.user && typeof node.user.id === 'string') ||
            typeof node.userId === 'string'),
      ),
    { maxDepth: 4 },
  ) as DiscordUserLike | undefined
}

async function handleToggleUser(user: DiscordUserLike) {
  const hiddenNow = await toggleHiddenUser(user.id)
  ActionSheetActionCreators.hideActionSheet()
  refreshActiveChannelRows()

  const label = user.globalName || user.username || user.id
  ToastActionCreators.open('VALENCED_HIDE_USER_TOGGLED', {
    text: hiddenNow ? \`Hiding content from \${label}\` : \`Showing content from \${label}\`,
    icon: getAssetIdByName(hiddenNow ? 'EyeSlashIcon' : 'EyeIcon'),
  })
}

function buildActionSheetRow(user: DiscordUserLike) {
  const settings = getCachedSettings()
  const hidden = isUserHidden(settings, user.id)
  const iconId = getAssetIdByName(hidden ? 'EyeIcon' : 'EyeSlashIcon')

  return createElement(Design.ActionSheetRow, {
    key: \`valenced-hide-user-\${user.id}\`,
    label: hidden ? 'Unhide User Content' : 'Hide User Content',
    icon: iconId
      ? createElement(Design.ActionSheetRow.Icon ?? 'View', { source: iconId } as any)
      : undefined,
    onPress: () => {
      void handleToggleUser(user)
    },
  } as any)
}

function injectRowIntoTree(tree: ReactElement, user: DiscordUserLike): ReactElement {
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
    const alreadyInjected = groupNode.props.children.some(
      (child: any) => child?.key === \`valenced-hide-user-\${user.id}\`,
    )
    if (!alreadyInjected) {
      groupNode.props.children.push(buildActionSheetRow(user))
    }
  }

  return tree
}

export function patchUserContextMenu(): () => void {
  const unpatches: Array<() => void> = []

  unpatches.push(
    before(ActionSheetActionCreators, 'openLazy', args => {
      const [sheetPromise, key, props] = args
      const user = extractTargetUser(props)
      const isUserSheet =
        (typeof key === 'string' && USER_SHEET_KEYS.has(key)) || Boolean(user?.id)

      if (!isUserSheet || !user?.id || !sheetPromise) return

      args[0] = sheetPromise.then(mod => {
        if (!mod?.default || (mod.default as any).__valencedHidePatched) return mod
        const OriginalSheet = mod.default

        const WrappedSheet = (sheetProps: any) => {
          const rendered = OriginalSheet(sheetProps)
          const resolvedUser = extractTargetUser(sheetProps) ?? user
          if (rendered && resolvedUser?.id) {
            return injectRowIntoTree(rendered, resolvedUser)
          }
          return rendered
        }
        ;(WrappedSheet as any).__valencedHidePatched = true

        return { ...mod, default: WrappedSheet }
      })
    }),
  )

  if (Design.ContextMenu) {
    unpatches.push(
      afterJSX(Design.ContextMenu, ([, props], res) => {
        const user = extractTargetUser(props)
        if (!user?.id || !res || typeof res !== 'object') return res

        const resProps = (res as ReactElement<any>).props
        if (!Array.isArray(resProps?.children)) return res

        const hidden = isUserHidden(getCachedSettings(), user.id)
        const alreadyInjected = resProps.children.some(
          (child: any) => child?.key === \`valenced-hide-ctx-\${user.id}\`,
        )

        if (!alreadyInjected) {
          resProps.children.push(
            createElement(Design.ContextMenuItem, {
              key: \`valenced-hide-ctx-\${user.id}\`,
              label: hidden ? 'Unhide User Content' : 'Hide User Content',
              action: () => {
                void handleToggleUser(user)
              },
            } as any),
          )
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
    path: 'plugins/hide-user-content/js/patches/messageHiding.tsx',
    language: 'typescript',
    summary: 'Patches RowManager, MessageHeader indicator, block spoiler overlay, and media blur/hide.',
    content: `import { getAssetIdByName } from '@valenced/assets'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { findInTree } from '@valenced/utils/tree'
import { cloneElement, isValidElement } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  collapseBlock,
  isBlockRevealed,
  isImageDisplayed,
  revealBlock,
  toggleImageDisplayed,
  useMessageStateRevision,
} from '../state'
import { getCachedSettings, shouldHideMessage } from '../storage'
import type { DiscordMessageLike } from '../types'
import type { FC, ReactElement, ReactNode } from 'react'
import type { GestureResponderEvent } from 'react-native'

const styles = StyleSheet.create({
  indicatorButton: {
    marginLeft: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  indicatorIcon: {
    width: 13,
    height: 13,
    tintColor: '#949BA4',
  },
  indicatorIconActive: {
    tintColor: '#DBDEE1',
  },
  spoilerBlockOverlay: {
    backgroundColor: '#2B2D31',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  revealedBlockWrapper: {
    borderRadius: 8,
    paddingVertical: 2,
  },
  blurredImageWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },
  blurredScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 18, 20, 0.35)',
  },
  fallbackGlyph: {
    color: '#949BA4',
    fontSize: 12,
    fontWeight: '600',
  },
})

function hasImageMedia(message?: DiscordMessageLike): boolean {
  if (!message) return false
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message.attachments.some(
      att => !att.content_type || att.content_type.startsWith('image/'),
    )
  }
  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    return message.embeds.some(embed => Boolean(embed.image || embed.thumbnail))
  }
  return false
}

function HiddenMediaIndicator({ messageId }: { messageId: string }) {
  useMessageStateRevision()
  const displayed = isImageDisplayed(messageId)
  const iconAsset = getAssetIdByName(displayed ? 'EyeIcon' : 'EyeSlashIcon')

  return (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={displayed ? 'Hide image' : 'Show hidden image'}
      style={styles.indicatorButton}
      onPress={(e: GestureResponderEvent) => {
        e?.stopPropagation?.()
        toggleImageDisplayed(messageId)
      }}
    >
      {iconAsset ? (
        <Image
          source={iconAsset}
          style={[styles.indicatorIcon, displayed && styles.indicatorIconActive]}
        />
      ) : (
        <Text style={styles.fallbackGlyph}>{displayed ? '◉' : '⊘'}</Text>
      )}
    </Pressable>
  )
}

function isolateInteractiveChildren(
  node: ReactNode,
  imageMode: 'hidden' | 'blurred',
  imageDisplayed: boolean,
): ReactNode {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return node
  }
  if (Array.isArray(node)) {
    return node.map(child =>
      isolateInteractiveChildren(child, imageMode, imageDisplayed),
    )
  }
  if (!isValidElement(node)) return node

  const props = (node.props ?? {}) as Record<string, any>
  const typeName =
    typeof node.type === 'function'
      ? (node.type as any).displayName || node.type.name || ''
      : String(node.type ?? '')

  const isSpoilerNode =
    /spoiler/i.test(typeName) || Boolean(props.isSpoiler) || Boolean(props.spoiler)

  const isMediaNode =
    node.type === Image ||
    /attachment|media|image/i.test(typeName) ||
    Boolean(props.attachment) ||
    Boolean(props.media)

  if (isMediaNode) {
    if (!imageDisplayed && imageMode === 'blurred') {
      return (
        <View
          style={styles.blurredImageWrap}
          onStartShouldSetResponder={() => true}
        >
          {cloneElement(node as ReactElement<any>, {
            blurRadius: 28,
            onPress: (e: GestureResponderEvent) => {
              e?.stopPropagation?.()
              props.onPress?.(e)
            },
          })}
          <View pointerEvents="none" style={styles.blurredScrim} />
        </View>
      )
    }
  }

  if (typeof props.onPress === 'function' || isSpoilerNode || isMediaNode) {
    const originalOnPress = props.onPress
    const nextChildren = props.children
      ? isolateInteractiveChildren(props.children, imageMode, imageDisplayed)
      : props.children

    return cloneElement(node as ReactElement<any>, {
      children: nextChildren,
      onPress: (e: GestureResponderEvent) => {
        e?.stopPropagation?.()
        originalOnPress?.(e)
      },
    })
  }

  if (props.children !== undefined) {
    return cloneElement(node as ReactElement<any>, {
      children: isolateInteractiveChildren(props.children, imageMode, imageDisplayed),
    })
  }

  return node
}

function HiddenMessageSpoilerBlock({
  messageId,
  imageMode,
  children,
}: {
  messageId: string
  imageMode: 'hidden' | 'blurred'
  children: ReactNode
}) {
  useMessageStateRevision()
  const revealed = isBlockRevealed(messageId)
  const imageDisplayed = isImageDisplayed(messageId)

  if (!revealed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hidden message spoiler, tap to reveal"
        style={styles.spoilerBlockOverlay}
        onPress={() => revealBlock(messageId)}
      >
        <View style={{ opacity: 0 }} pointerEvents="none">
          {children}
        </View>
      </Pressable>
    )
  }

  return (
    <Pressable
      style={styles.revealedBlockWrapper}
      onPress={() => collapseBlock(messageId)}
    >
      {isolateInteractiveChildren(children, imageMode, imageDisplayed)}
    </Pressable>
  )
}

function HiddenImagesContainer({
  messageId,
  imageMode,
  children,
}: {
  messageId: string
  imageMode: 'hidden' | 'blurred'
  children: ReactNode
}) {
  useMessageStateRevision()
  const imageDisplayed = isImageDisplayed(messageId)

  if (imageDisplayed) {
    return <>{children}</>
  }

  if (imageMode === 'hidden') {
    return null
  }

  return (
    <View style={styles.blurredImageWrap}>
      {cloneElement(
        isValidElement(children) ? (children as ReactElement<any>) : <View>{children}</View>,
        { blurRadius: 28 },
      )}
      <View pointerEvents="none" style={styles.blurredScrim} />
    </View>
  )
}

function isHeaderNode(node: any): boolean {
  if (!isValidElement(node)) return false
  const name = String(
    (node.type as any)?.displayName || (node.type as any)?.name || '',
  )
  return /MessageHeader|Header/i.test(name)
}

export function patchMessageHiding(): () => void {
  const unpatches: Array<() => void> = []

  unpatches.push(
    getModules(
      withProps<{ prototype: { generate: (data: any) => any } }>('prototype'),
      mod => {
        const proto = mod?.prototype as Record<string, any> | undefined
        if (!proto || typeof proto.generate !== 'function' || !proto.getTextColor) return

        unpatches.push(
          after(proto, 'generate', ([data], row) => {
            const msg: DiscordMessageLike | undefined = data?.message ?? row?.message
            if (!msg?.id) return row

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? data?.channelId
            if (!shouldHideMessage(settings, msg.author?.id, channelId)) return row

            row.__valencedHidden = {
              messageId: msg.id,
              imageMode: settings.imageMode,
              hideText: settings.hideText,
              hasImages: hasImageMedia(msg),
            }

            if (
              !settings.hideText &&
              settings.imageMode === 'hidden' &&
              !isImageDisplayed(msg.id) &&
              Array.isArray(row.message?.attachments)
            ) {
              row.message = {
                ...row.message,
                attachments: [],
              }
            }

            return row
          }),
        )
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    getModules(
      withProps<{ MessageHeader: FC<any> }>('MessageHeader'),
      ({ MessageHeader }) => {
        unpatches.push(
          insteadJSX(MessageHeader, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const msg: DiscordMessageLike | undefined = props?.message
            if (!msg?.id) return rendered

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? props?.channelId
            if (!shouldHideMessage(settings, msg.author?.id, channelId)) {
              return rendered
            }

            const timestampGroup = findInTree(
              rendered as Record<string, any>,
              node =>
                Boolean(
                  node &&
                    typeof node === 'object' &&
                    Array.isArray(node.props?.children) &&
                    node.props.children.some(
                      (c: any) =>
                        isValidElement(c) &&
                        /timestamp/i.test(
                          String((c.type as any)?.displayName || (c.type as any)?.name || ''),
                        ),
                    ),
                ),
              { maxDepth: 6 },
            )

            if (timestampGroup && Array.isArray(timestampGroup.props?.children)) {
              timestampGroup.props.children.push(
                <HiddenMediaIndicator
                  key={\`valenced-hidden-indicator-\${msg.id}\`}
                  messageId={msg.id}
                />,
              )
            }

            return rendered
          }),
        )
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    getModules(
      withProps<{ Message: FC<any> }>('Message'),
      ({ Message }) => {
        unpatches.push(
          insteadJSX(Message, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const msg: DiscordMessageLike | undefined = props?.message
            if (!msg?.id || !isValidElement(rendered)) return rendered

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? props?.channelId
            if (!settings.hideText || !shouldHideMessage(settings, msg.author?.id, channelId)) {
              return rendered
            }

            const bodyContainer = findInTree(
              rendered as Record<string, any>,
              node =>
                Boolean(
                  node &&
                    typeof node === 'object' &&
                    Array.isArray(node.props?.children) &&
                    node.props.children.some(isHeaderNode),
                ),
              { maxDepth: 5 },
            )

            if (bodyContainer && Array.isArray(bodyContainer.props?.children)) {
              const headerNodes: ReactNode[] = []
              const blockNodes: ReactNode[] = []

              for (const child of bodyContainer.props.children) {
                if (isHeaderNode(child)) headerNodes.push(child)
                else blockNodes.push(child)
              }

              bodyContainer.props.children = [
                ...headerNodes,
                <HiddenMessageSpoilerBlock
                  key={\`valenced-spoiler-block-\${msg.id}\`}
                  messageId={msg.id}
                  imageMode={settings.imageMode}
                >
                  {blockNodes}
                </HiddenMessageSpoilerBlock>,
              ]
              return rendered
            }

            return (
              <HiddenMessageSpoilerBlock
                messageId={msg.id}
                imageMode={settings.imageMode}
              >
                {rendered}
              </HiddenMessageSpoilerBlock>
            )
          }),
        )
      },
      { max: 1 },
    ),
  )

  unpatches.push(
    getModules(
      withProps<{ MessageAttachments: FC<any> }>('MessageAttachments'),
      ({ MessageAttachments }) => {
        unpatches.push(
          insteadJSX(MessageAttachments, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const msg: DiscordMessageLike | undefined = props?.message
            if (!msg?.id) return rendered

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? props?.channelId
            if (settings.hideText || !shouldHideMessage(settings, msg.author?.id, channelId)) {
              return rendered
            }

            return (
              <HiddenImagesContainer
                messageId={msg.id}
                imageMode={settings.imageMode}
              >
                {rendered}
              </HiddenImagesContainer>
            )
          }),
        )
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
    path: 'plugins/hide-user-content/js/components/SettingsPage.tsx',
    language: 'typescript',
    summary: 'Settings UI containing strictly the 3 requested configuration options.',
    content: `import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { refreshActiveChannelRows } from '../state'
import { DEFAULT_SETTINGS } from '../storage'
import type { ImageDisplayMode, PluginSettings } from '../types'
import type { PluginApi } from '@valenced/plugins/types'

const { TableRadioGroup, TableRadioRow, TableRowGroup, TableSwitchRow } = Design

export default function SettingsPage({
  api,
}: {
  api: PluginApi<{ jsonStorage: PluginSettings }>
}) {
  const settings = api.jsonStorage.use() ?? DEFAULT_SETTINGS

  const updateSettings = async (patch: Partial<PluginSettings>) => {
    await api.jsonStorage.set(patch)
    refreshActiveChannelRows()
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <Page>
        <TableRadioGroup
          title="Image Behavior"
          value={settings.imageMode}
          onChange={(value: string) => {
            void updateSettings({ imageMode: value as ImageDisplayMode })
          }}
        >
          <TableRadioRow
            label="Hidden"
            subLabel="Hide images completely until toggled via the message indicator."
            value="hidden"
          />
          <TableRadioRow
            label="Blurred"
            subLabel="Blur images in place until toggled via the message indicator."
            value="blurred"
          />
        </TableRadioGroup>

        <TableRowGroup title="Filtering Scope">
          <TableSwitchRow
            label="Only in NSFW channels"
            subLabel="Apply hiding only inside age-restricted channels."
            value={settings.nsfwOnly}
            onValueChange={(value: boolean) => {
              void updateSettings({ nsfwOnly: value })
            }}
          />
          <TableSwitchRow
            label="Also hide message text"
            subLabel="Cover the entire message block with a spoiler overlay instead of hiding images only."
            value={settings.hideText}
            onValueChange={(value: boolean) => {
              void updateSettings({ hideText: value })
            }}
          />
        </TableRowGroup>
      </Page>
    </ScrollView>
  )
}
`,
  },
  {
    path: 'package.json',
    language: 'json',
    summary: 'Template root package.json wired to @valenced/plugin-cli and @valenced/types.',
    content: `{
  "name": "@valenced/hide-user-content-repo",
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
  "name": "Hide User Content Repository",
  "description": "Valenced plugin repository providing Hide User Content.",
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
  {
    path: 'README.md',
    language: 'markdown',
    summary: 'Setup, build, and behavior documentation for the Valenced plugin.',
    content: `# Hide User Content (Valenced Plugin)

A plugin for [Valenced](https://github.com/Valenced/valenced) structured with \`valenced-plugin-template\`.

## Features

- **User Context Menu Action**: Adds **Hide User Content** / **Unhide User Content** to user action sheets and context menus.
- **Strict 3-Option Settings**:
  1. **Image Behavior**: \`Hidden\` or \`Blurred\`
  2. **Only in NSFW channels**: Toggle whether hiding applies only in NSFW-marked channels
  3. **Also hide message text**: Toggle between hiding images only or both images and text
- **Full-Block Spoiler Overlay** (when text + images are hidden):
  - Covers the entire message block background with a spoiler overlay.
  - Inline \`||text spoilers||\` and image taps remain interactive inside a revealed message.
  - Tapping whitespace inside a revealed message restores the spoiler overlay.
- **Post-Timestamp Indicator**:
  - Displays a subtle indicator icon right after the message timestamp (similar to Discord's \`@silent\` bell).
  - Tapping the indicator toggles displaying the image.

## Building

\`\`\`sh
bun install
bun run build
\`\`\`
`,
  },
]
