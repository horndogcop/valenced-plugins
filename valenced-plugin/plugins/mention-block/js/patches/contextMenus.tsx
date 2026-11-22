import { getAssetIdByName } from '@valenced/assets'
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
      ? `Blocked @${label} from mention autocomplete`
      : `Restored @${label} to mention autocomplete`,
    icon: getAssetIdByName(blockedNow ? 'CircleXIcon' : 'CheckmarkIcon'),
  })
}

async function handleToggleChannelMention(channel: DiscordChannel) {
  const blockedNow = await toggleChannelBlocked(channel.id)
  ActionSheetActionCreators.hideActionSheet()
  const label = channel.name ? `#${channel.name}` : channel.id
  ToastActionCreators.open('VALENCED_MENTION_BLOCK_CHANNEL', {
    text: blockedNow
      ? `Blocked ${label} from mention autocomplete`
      : `Restored ${label} to mention autocomplete`,
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

  // 1. Patch Discord Mobile ActionSheets:
  //    - Message Context Menu -> TWO entries (author user + current channel)
  //    - Channel Context Menu -> ONE entry (channel)
  //    - User Profile Overflow / ActionSheet -> ONE entry (user)
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
      const isMessageSheet =
        /message/i.test(sheetKey) || Boolean(message?.id)
      const isChannelSheet =
        !isMessageSheet && (/channel/i.test(sheetKey) || Boolean(channel?.id))
      const isUserProfileSheet =
        !isMessageSheet && !isChannelSheet && (/user|profile/i.test(sheetKey) || Boolean(user?.id))

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
                  `valenced-mb-msg-user-${msgUser.id}`,
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
                  `valenced-mb-msg-chan-${msgChannel.id}`,
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
                `valenced-mb-chan-${targetChannel.id}`,
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
                `valenced-mb-user-${targetUser.id}`,
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

  // 2. Patch User Profile Action Buttons directly so the action also appears on profile views
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
              const btnKey = `valenced-mb-profile-btn-${user.id}`
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

  // 3. Patch ContextMenu components for split/tablet layouts
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
          const itemKey = `valenced-mb-ctx-user-${user.id}`
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
          const itemKey = `valenced-mb-ctx-chan-${targetChannel.id}`
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
