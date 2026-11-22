import { getAssetIdByName } from '@valenced/assets'
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
    text: hiddenNow ? `Hiding content from ${label}` : `Showing content from ${label}`,
    icon: getAssetIdByName(hiddenNow ? 'EyeSlashIcon' : 'EyeIcon'),
  })
}

function buildActionSheetRow(user: DiscordUserLike) {
  const settings = getCachedSettings()
  const hidden = isUserHidden(settings, user.id)
  const iconId = getAssetIdByName(hidden ? 'EyeIcon' : 'EyeSlashIcon')

  return createElement(Design.ActionSheetRow, {
    key: `valenced-hide-user-${user.id}`,
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
      (child: any) => child?.key === `valenced-hide-user-${user.id}`,
    )
    if (!alreadyInjected) {
      groupNode.props.children.push(buildActionSheetRow(user))
    }
  }

  return tree
}

export function patchUserContextMenu(): () => void {
  const unpatches: Array<() => void> = []

  // 1. Intercept Discord Mobile bottom ActionSheets opened for users
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

  // 2. Intercept ContextMenu components rendered in tablet / split layouts
  if (Design.ContextMenu) {
    unpatches.push(
      afterJSX(Design.ContextMenu, ([, props], res) => {
        const user = extractTargetUser(props)
        if (!user?.id || !res || typeof res !== 'object') return res

        const resProps = (res as ReactElement<any>).props
        if (!Array.isArray(resProps?.children)) return res

        const hidden = isUserHidden(getCachedSettings(), user.id)
        const alreadyInjected = resProps.children.some(
          (child: any) => child?.key === `valenced-hide-ctx-${user.id}`,
        )

        if (!alreadyInjected) {
          resProps.children.push(
            createElement(Design.ContextMenuItem, {
              key: `valenced-hide-ctx-${user.id}`,
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
