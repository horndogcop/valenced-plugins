import { useState } from 'react'
import {
  AtSign,
  BellOff,
  Eye,
  EyeOff,
  Hash,
  MoreHorizontal,
  ShieldAlert,
  User,
  X,
} from 'lucide-react'
import type {
  PluginSettings,
  SimChannel,
  SimMessage,
  SimUser,
} from '../types/simulator'

interface DiscordSimulatorProps {
  settings: PluginSettings
  users: Record<string, SimUser>
  channels: SimChannel[]
  messages: SimMessage[]
  activeChannelId: string
  revealedBlocks: Record<string, boolean>
  displayedImages: Record<string, boolean>
  revealedInlineSpoilers: Record<string, boolean>
  onSelectChannel: (channelId: string) => void
  onToggleUserHidden: (userId: string) => void
  onRevealBlock: (messageId: string) => void
  onCollapseBlock: (messageId: string) => void
  onToggleImageIndicator: (messageId: string) => void
  onToggleInlineSpoiler: (spoilerKey: string) => void
}

export function DiscordSimulator({
  settings,
  users,
  channels,
  messages,
  activeChannelId,
  revealedBlocks,
  displayedImages,
  revealedInlineSpoilers,
  onSelectChannel,
  onToggleUserHidden,
  onRevealBlock,
  onCollapseBlock,
  onToggleImageIndicator,
  onToggleInlineSpoiler,
}: DiscordSimulatorProps) {
  const [sheetUserId, setSheetUserId] = useState<string | null>(null)
  const [lightboxImage, setLightboxImage] = useState<{
    url: string
    alt: string
    filename: string
    dimensions: string
  } | null>(null)
  const [toastText, setToastText] = useState<string | null>(null)

  const activeChannel =
    channels.find(c => c.id === activeChannelId) ?? channels[0]
  const channelMessages = messages.filter(
    m => m.channelId === activeChannel.id,
  )

  const showToast = (text: string) => {
    setToastText(text)
    setTimeout(() => {
      setToastText(prev => (prev === text ? null : prev))
    }, 2200)
  }

  const handleActionSheetToggle = (userId: string) => {
    const user = users[userId]
    const wasHidden = Boolean(settings.hiddenUsers[userId])
    onToggleUserHidden(userId)
    setSheetUserId(null)
    if (user) {
      showToast(
        wasHidden
          ? `Showing content from ${user.displayName}`
          : `Hiding content from ${user.displayName}`,
      )
    }
  }

  const sheetUser = sheetUserId ? users[sheetUserId] : null
  const sheetUserHidden = sheetUserId
    ? Boolean(settings.hiddenUsers[sheetUserId])
    : false

  return (
    <div className="flex flex-col items-center">
      {/* Mobile Device Bezel */}
      <div className="relative flex h-[740px] w-full max-w-[404px] flex-col overflow-hidden rounded-[34px] border border-white/[0.12] bg-[#1C1D22] shadow-2xl">
        {/* Android Status Strip */}
        <div className="flex items-center justify-between bg-[#141519] px-6 pt-3 pb-2 text-[11px] font-medium text-slate-300 tabular-nums">
          <span>22:27</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span>Valenced</span>
            <span aria-hidden="true">·</span>
            <span>5G</span>
          </div>
        </div>

        {/* Discord Channel Header & Channel Switcher */}
        <div className="border-b border-white/[0.06] bg-[#1C1D22] px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {activeChannel.nsfw ? (
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
              ) : (
                <Hash className="h-4 w-4 text-slate-400 shrink-0" />
              )}
              <span className="truncate font-display text-sm font-semibold text-white">
                {activeChannel.name}
              </span>
              {activeChannel.nsfw && (
                <span className="ml-1 text-[11px] font-medium text-amber-400">
                  NSFW
                </span>
              )}
            </div>

            {/* Channel switcher buttons */}
            <div className="flex items-center gap-1 rounded-lg bg-[#111216] p-0.5">
              {channels.map(ch => {
                const active = ch.id === activeChannel.id
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSelectChannel(ch.id)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#2B2D36] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    #{ch.nsfw ? 'nsfw' : 'general'}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-1 truncate text-[11px] text-slate-400">
            {activeChannel.topic}
          </p>
        </div>

        {/* Toast Overlay */}
        {toastText && (
          <div className="pointer-events-none absolute top-24 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-white/10 bg-[#111216]/95 px-3.5 py-2 text-xs font-medium text-slate-100 shadow-lg whitespace-nowrap">
            {toastText}
          </div>
        )}

        {/* Chat Message Stream */}
        <div className="flex-1 space-y-1 overflow-y-auto bg-[#1C1D22] px-3 py-3">
          {channelMessages.map(msg => {
            const author = users[msg.authorId]
            if (!author) return null

            const isUserHidden = Boolean(settings.hiddenUsers[author.id])
            const hidingApplies =
              isUserHidden && (!settings.nsfwOnly || activeChannel.nsfw)
            const blockRevealed = Boolean(revealedBlocks[msg.id])
            const imageDisplayed = Boolean(displayedImages[msg.id])

            return (
              <div
                key={msg.id}
                className="group rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-start gap-3">
                  {/* User Avatar (opens User ActionSheet) */}
                  <button
                    type="button"
                    onClick={() => setSheetUserId(author.id)}
                    title={`Open context menu for ${author.displayName}`}
                    className="mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10 transition-transform active:scale-95"
                  >
                    <img
                      src={author.avatar}
                      alt={author.displayName}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    {/* Message Header: Author + Timestamp + Silent Bell / Hidden Media Indicator */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSheetUserId(author.id)}
                          className="truncate text-[13.5px] font-semibold hover:underline"
                          style={{ color: author.roleColor }}
                        >
                          {author.displayName}
                        </button>

                        <span className="font-mono text-[11px] text-[#949BA4] tabular-nums shrink-0">
                          {msg.timestamp}
                        </span>

                        {/* Native @silent bell indicator for visual comparison */}
                        {msg.isSilent && (
                          <span
                            title="Silent message (@silent)"
                            className="inline-flex items-center text-[#949BA4]"
                          >
                            <BellOff className="h-3.5 w-3.5" />
                          </span>
                        )}

                        {/* Plugin Post-Timestamp Indicator (mirrors silent bell) */}
                        {hidingApplies && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              onToggleImageIndicator(msg.id)
                            }}
                            title={
                              imageDisplayed
                                ? 'Hide image (indicator toggle)'
                                : 'Display image (indicator toggle)'
                            }
                            aria-label={
                              imageDisplayed
                                ? 'Hide hidden user image'
                                : 'Display hidden user image'
                            }
                            className={`inline-flex items-center justify-center rounded p-0.5 transition-colors ${
                              imageDisplayed
                                ? 'text-slate-200 hover:bg-white/10'
                                : 'text-[#949BA4] hover:bg-white/10 hover:text-slate-200'
                            }`}
                          >
                            {imageDisplayed ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Quick Context Menu Trigger */}
                      <button
                        type="button"
                        onClick={() => setSheetUserId(author.id)}
                        aria-label={`User actions for ${author.displayName}`}
                        className="rounded p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Message Block Body (Text + Images) */}
                    {hidingApplies && settings.hideText ? (
                      !blockRevealed ? (
                        /* Unified Spoiler Overlay across the entire message block background */
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onRevealBlock(msg.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onRevealBlock(msg.id)
                            }
                          }}
                          aria-label="Spoilered hidden user message block, tap to reveal"
                          className="mt-1.5 cursor-pointer select-none rounded-lg border border-white/[0.06] bg-[#2B2D31] p-3 transition-colors hover:bg-[#313339]"
                        >
                          <div
                            aria-hidden="true"
                            className="pointer-events-none select-none opacity-0"
                          >
                            <p className="text-[13.5px] leading-5">
                              {msg.segments.map(s => s.value).join('')}
                            </p>
                            {msg.image && (
                              <div className="mt-2 h-36 w-full rounded-lg" />
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Revealed message block: whitespace click restores spoiler overlay;
                           inline spoilers & image taps stopPropagation so they stay interactive */
                        <div
                          onClick={() => onCollapseBlock(msg.id)}
                          className="mt-1.5 cursor-pointer rounded-lg border border-white/[0.05] bg-white/[0.02] p-2 transition-colors"
                          title="Tap whitespace to restore spoiler overlay"
                        >
                          <div className="text-[13.5px] leading-[21px] text-[#DBDEE1]">
                            {msg.segments.map((seg, idx) => {
                              if (seg.type === 'text') {
                                return <span key={idx}>{seg.value}</span>
                              }
                              const spoilerKey = `${msg.id}-sp-${idx}`
                              const spoilerOpen = Boolean(
                                revealedInlineSpoilers[spoilerKey],
                              )
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    onToggleInlineSpoiler(spoilerKey)
                                  }}
                                  className={`mx-0.5 inline rounded px-1.5 py-0.5 text-[13px] transition-colors ${
                                    spoilerOpen
                                      ? 'bg-[#383A40] text-[#DBDEE1]'
                                      : 'bg-[#111214] text-transparent hover:bg-[#191B1F]'
                                  }`}
                                >
                                  {seg.value}
                                </button>
                              )
                            })}
                          </div>

                          {msg.image && (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setLightboxImage(msg.image!)
                                  }}
                                  className="relative block w-full overflow-hidden rounded-lg border border-white/[0.06] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
                                >
                                  <img
                                    src={msg.image.url}
                                    alt={msg.image.alt}
                                    referrerPolicy="no-referrer"
                                    className={`h-36 w-full object-cover transition-[filter,transform] duration-200 ${
                                      !imageDisplayed && settings.imageMode === 'blurred'
                                        ? 'scale-105 blur-xl'
                                        : 'blur-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            )}
                        </div>
                      )
                    ) : (
                      /* Standard or Images-Only Hidden/Blurred Rendering */
                      <div className="mt-0.5">
                        <div className="text-[13.5px] leading-[21px] text-[#DBDEE1]">
                          {msg.segments.map((seg, idx) => {
                            if (seg.type === 'text') {
                              return <span key={idx}>{seg.value}</span>
                            }
                            const spoilerKey = `${msg.id}-sp-${idx}`
                            const spoilerOpen = Boolean(
                              revealedInlineSpoilers[spoilerKey],
                            )
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => onToggleInlineSpoiler(spoilerKey)}
                                className={`mx-0.5 inline rounded px-1.5 py-0.5 text-[13px] transition-colors ${
                                  spoilerOpen
                                    ? 'bg-[#383A40] text-[#DBDEE1]'
                                    : 'bg-[#111214] text-transparent hover:bg-[#191B1F]'
                                }`}
                              >
                                {seg.value}
                              </button>
                            )
                          })}
                        </div>

                        {msg.image &&
                          (!hidingApplies ||
                            imageDisplayed ||
                            settings.imageMode === 'blurred') && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!hidingApplies || imageDisplayed) {
                                    setLightboxImage(msg.image!)
                                  } else {
                                    onToggleImageIndicator(msg.id)
                                  }
                                }}
                                className="relative block w-full overflow-hidden rounded-lg border border-white/[0.06] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
                              >
                                <img
                                  src={msg.image.url}
                                  alt={msg.image.alt}
                                  referrerPolicy="no-referrer"
                                  className={`h-40 w-full object-cover transition-[filter,transform] duration-200 ${
                                    hidingApplies &&
                                    !imageDisplayed &&
                                    settings.imageMode === 'blurred'
                                      ? 'scale-105 blur-xl'
                                      : 'blur-0'
                                  }`}
                                />
                              </button>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Simulated Discord Mobile Message Composer Bar */}
        <div className="border-t border-white/[0.06] bg-[#1C1D22] px-3.5 py-3">
          <div className="flex items-center justify-between rounded-full bg-[#2B2D31] px-4 py-2 text-xs text-slate-400">
            <span>Message #{activeChannel.name}</span>
            <span className="font-mono text-[11px] text-slate-500">
              {settings.nsfwOnly && !activeChannel.nsfw
                ? 'NSFW-only idle'
                : 'Filter active'}
            </span>
          </div>
        </div>

        {/* User ActionSheet / Context Menu Overlay */}
        {sheetUser && (
          <div
            onClick={() => setSheetUserId(null)}
            className="absolute inset-0 z-40 flex flex-col justify-end bg-black/60 backdrop-blur-[1px]"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="rounded-t-2xl border-t border-white/10 bg-[#1E1F24] px-4 pt-3 pb-6"
            >
              <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-white/20" />

              <div className="mb-4 flex items-center gap-3 px-1">
                <img
                  src={sheetUser.avatar}
                  alt={sheetUser.displayName}
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div>
                  <div className="font-display text-sm font-semibold text-white">
                    {sheetUser.displayName}
                  </div>
                  <div className="font-mono text-xs text-slate-400">
                    @{sheetUser.username}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-[#262830]">
                <button
                  type="button"
                  onClick={() => setSheetUserId(null)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/[0.04]"
                >
                  <User className="h-4 w-4 text-slate-400" />
                  <span>View Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSheetUserId(null)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/[0.04]"
                >
                  <AtSign className="h-4 w-4 text-slate-400" />
                  <span>Mention</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleActionSheetToggle(sheetUser.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
                >
                  <span className="flex items-center gap-3">
                    {sheetUserHidden ? (
                      <Eye className="h-4 w-4 text-[#7984F6]" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-[#7984F6]" />
                    )}
                    <span>
                      {sheetUserHidden
                        ? 'Unhide User Content'
                        : 'Hide User Content'}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">Valenced</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-Screen Media Viewer Lightbox (Image tap inside revealed block) */}
        {lightboxImage && (
          <div
            onClick={() => setLightboxImage(null)}
            className="absolute inset-0 z-50 flex flex-col bg-black/95"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-slate-200">
                  {lightboxImage.filename}
                </div>
                <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {lightboxImage.dimensions}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Close image viewer"
                className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              onClick={e => e.stopPropagation()}
              className="flex flex-1 items-center justify-center p-4"
            >
              <img
                src={lightboxImage.url}
                alt={lightboxImage.alt}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
