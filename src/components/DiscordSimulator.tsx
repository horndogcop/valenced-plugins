import { useEffect, useState } from 'react'
import {
  AtSign,
  Ban,
  CheckCircle2,
  Hash,
  MoreHorizontal,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react'
import type {
  MentionBlockStorage,
  SimChannel,
  SimGuild,
  SimMessage,
  SimUser,
} from '../types/simulator'

interface DiscordSimulatorProps {
  storage: MentionBlockStorage
  guilds: SimGuild[]
  channels: SimChannel[]
  users: Record<string, SimUser>
  messages: SimMessage[]
  activeGuildId: string
  activeChannelId: string
  composerDraft: string
  onComposerDraftChange: (val: string) => void
  onSelectGuild: (guildId: string) => void
  onSelectChannel: (channelId: string) => void
  onToggleUserBlocked: (userId: string) => boolean
  onToggleChannelBlocked: (channelId: string) => boolean
  onSetUserBlocked: (userId: string, blocked: boolean) => void
  onSetChannelBlocked: (channelId: string, blocked: boolean) => void
  onAppendMessage: (msg: SimMessage) => void
}

type SheetMode =
  | { kind: 'message'; message: SimMessage }
  | { kind: 'channel'; channel: SimChannel }
  | { kind: 'profile'; user: SimUser }
  | null

export function DiscordSimulator({
  storage,
  guilds,
  channels,
  users,
  messages,
  activeGuildId,
  activeChannelId,
  composerDraft,
  onComposerDraftChange,
  onSelectGuild,
  onSelectChannel,
  onToggleUserBlocked,
  onToggleChannelBlocked,
  onSetUserBlocked,
  onSetChannelBlocked,
  onAppendMessage,
}: DiscordSimulatorProps) {
  const [sheet, setSheet] = useState<SheetMode>(null)
  const [toastText, setToastText] = useState<string | null>(null)

  const guildChannels = channels.filter(c => c.guildId === activeGuildId)
  const activeChannel =
    guildChannels.find(c => c.id === activeChannelId) ?? guildChannels[0]
  const activeGuild = guilds.find(g => g.id === activeGuildId) ?? guilds[0]
  const guildUsers = Object.values(users).filter(u =>
    u.guildIds.includes(activeGuild.id),
  )

  const channelMessages = messages.filter(
    m => m.channelId === activeChannel.id,
  )

  const showToast = (text: string) => {
    setToastText(text)
    setTimeout(() => {
      setToastText(prev => (prev === text ? null : prev))
    }, 2200)
  }

  // Detect active slash command & mention autocomplete trigger in composerDraft
  const trimmedDraft = composerDraft.trimStart()
  const isRemoveCommand = trimmedDraft.startsWith('/mention-remove')
  const isAddCommand = trimmedDraft.startsWith('/mention-add')
  const bypassInterception = isRemoveCommand

  const slashQueryMatch = trimmedDraft.match(/^\/([a-z-]*)$/)
  const subcommandMatch = trimmedDraft.match(
    /^\/(mention-add|mention-remove)\s+([a-z]*)$/,
  )
  const mentionTriggerMatch = composerDraft.match(/(^|\s)([@#])([^\s@#]*)$/)

  const slashCommands = [
    {
      name: 'mention-add',
      usage: '/mention-add user | channel <target>',
      desc: 'Block user or channel from autocomplete (accepts intercepted mentions)',
    },
    {
      name: 'mention-remove',
      usage: '/mention-remove user | channel <target>',
      desc: 'Restore user or channel (bypasses autocomplete interception)',
    },
    {
      name: 'mention-list',
      usage: '/mention-list',
      desc: 'Ephemeral list of blocked users & channels in this server',
    },
  ]

  const matchingSlashCommands = slashQueryMatch
    ? slashCommands.filter(c => c.name.startsWith(slashQueryMatch[1]))
    : []

  const matchingSubcommands = subcommandMatch
    ? ['user', 'channel'].filter(s => s.startsWith(subcommandMatch[2]))
    : []

  const mentionKind = mentionTriggerMatch?.[2] as '@' | '#' | undefined
  const mentionQuery = (mentionTriggerMatch?.[3] ?? '').toLowerCase()

  const userSuggestions =
    mentionKind === '@'
      ? guildUsers.filter(u => {
          const matchesQuery =
            u.username.toLowerCase().includes(mentionQuery) ||
            u.displayName.toLowerCase().includes(mentionQuery)
          if (!matchesQuery) return false
          if (bypassInterception) return true
          return !storage.blockedUsers[u.id]
        })
      : []

  const channelSuggestions =
    mentionKind === '#'
      ? guildChannels.filter(c => {
          const matchesQuery = c.name.toLowerCase().includes(mentionQuery)
          if (!matchesQuery) return false
          if (bypassInterception) return true
          return !storage.blockedChannels[c.id]
        })
      : []

  const applySuggestion = (token: string) => {
    if (slashQueryMatch) {
      if (token === 'mention-list') {
        onComposerDraftChange('/mention-list')
      } else {
        onComposerDraftChange(`/${token} `)
      }
      return
    }
    if (subcommandMatch) {
      const prefix = subcommandMatch[1]
      const nextMention = token === 'user' ? '@' : '#'
      onComposerDraftChange(`/${prefix} ${token} ${nextMention}`)
      return
    }
    if (mentionTriggerMatch) {
      const idx = composerDraft.lastIndexOf(mentionTriggerMatch[2])
      const before = composerDraft.slice(0, idx)
      onComposerDraftChange(`${before}${token} `)
    }
  }

  const resolveUserTarget = (raw: string): SimUser | undefined => {
    const clean = raw.replace(/^<@!?|>$|^@/g, '').trim().toLowerCase()
    return Object.values(users).find(
      u =>
        u.id === clean ||
        u.username.toLowerCase() === clean ||
        u.displayName.toLowerCase() === clean,
    )
  }

  const resolveChannelTarget = (raw: string): SimChannel | undefined => {
    const clean = raw.replace(/^<#|>$|^#/g, '').trim().toLowerCase()
    return channels.find(
      c => c.id === clean || c.name.toLowerCase() === clean,
    )
  }

  const pushEphemeral = (
    content: string,
    extra?: { ephemeralChannels?: string[]; ephemeralUsers?: string[] },
  ) => {
    onAppendMessage({
      id: `ephemeral-${Date.now()}`,
      channelId: activeChannel.id,
      authorId: 'clyde',
      timestamp: 'Now',
      content,
      isEphemeral: true,
      ...extra,
    })
  }

  const handleSend = () => {
    const text = composerDraft.trim()
    if (!text) return

    if (text.startsWith('/mention-list')) {
      const serverChannels = guildChannels
        .filter(c => storage.blockedChannels[c.id])
        .map(c => c.name)
      const serverUsers = guildUsers
        .filter(u => storage.blockedUsers[u.id])
        .map(u => u.displayName)

      pushEphemeral(
        `Blocked Mentions in ${activeGuild.name}`,
        {
          ephemeralChannels: serverChannels,
          ephemeralUsers: serverUsers,
        },
      )
      onComposerDraftChange('')
      return
    }

    const addMatch = text.match(/^\/mention-add\s+(user|channel)\s+(.+)$/i)
    if (addMatch) {
      const sub = addMatch[1].toLowerCase()
      const targetRaw = addMatch[2]
      if (sub === 'user') {
        const user = resolveUserTarget(targetRaw)
        if (!user) {
          pushEphemeral('Could not resolve user mention. Try @Maya, @Kaito, or @Sora.')
        } else {
          onSetUserBlocked(user.id, true)
          pushEphemeral(
            `Blocked @${user.username} from mention autocomplete (intercepted mention accepted).`,
          )
        }
      } else {
        const ch = resolveChannelTarget(targetRaw)
        if (!ch) {
          pushEphemeral('Could not resolve channel mention. Try #general or #dev-chat.')
        } else {
          onSetChannelBlocked(ch.id, true)
          pushEphemeral(
            `Blocked #${ch.name} from mention autocomplete (intercepted mention accepted).`,
          )
        }
      }
      onComposerDraftChange('')
      return
    }

    const remMatch = text.match(/^\/mention-remove\s+(user|channel)\s+(.+)$/i)
    if (remMatch) {
      const sub = remMatch[1].toLowerCase()
      const targetRaw = remMatch[2]
      if (sub === 'user') {
        const user = resolveUserTarget(targetRaw)
        if (!user) {
          pushEphemeral('Could not resolve blocked user.')
        } else {
          onSetUserBlocked(user.id, false)
          pushEphemeral(`Restored @${user.username} to mention autocomplete.`)
        }
      } else {
        const ch = resolveChannelTarget(targetRaw)
        if (!ch) {
          pushEphemeral('Could not resolve blocked channel.')
        } else {
          onSetChannelBlocked(ch.id, false)
          pushEphemeral(`Restored #${ch.name} to mention autocomplete.`)
        }
      }
      onComposerDraftChange('')
      return
    }

    onAppendMessage({
      id: `msg-${Date.now()}`,
      channelId: activeChannel.id,
      authorId: 'you',
      timestamp: '22:55',
      content: text,
    })
    onComposerDraftChange('')
  }

  // Close sheets on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex flex-col items-center">
      {/* Mobile Device Bezel */}
      <div className="relative flex h-[760px] w-full max-w-[404px] flex-col overflow-hidden rounded-[34px] border border-white/[0.12] bg-[#1C1D22] shadow-2xl">
        {/* Android Status Strip */}
        <div className="flex items-center justify-between bg-[#141519] px-6 pt-3 pb-2 text-[11px] font-medium text-slate-300 tabular-nums">
          <span>22:54</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span>Valenced</span>
            <span aria-hidden="true">·</span>
            <span>5G</span>
          </div>
        </div>

        {/* Server + Channel Top Bar */}
        <div className="border-b border-white/[0.06] bg-[#1C1D22] px-4 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {guilds.map(g => {
                const active = g.id === activeGuild.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectGuild(g.id)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#5865F2] text-white'
                        : 'bg-[#111216] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {g.shortName}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-1">
              {guildChannels.map(ch => {
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
                    #{ch.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSheet({ kind: 'channel', channel: activeChannel })}
              className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/[0.05]"
              title="Open Channel Context Menu"
            >
              <Hash className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate font-display text-sm font-semibold text-white">
                {activeChannel.name}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSheet({ kind: 'channel', channel: activeChannel })}
              aria-label="Open channel context menu"
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#252730] px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Channel Menu</span>
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {toastText && (
          <div className="pointer-events-none absolute top-28 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-white/10 bg-[#111216]/95 px-3.5 py-2 text-xs font-medium text-slate-100 shadow-lg whitespace-nowrap">
            {toastText}
          </div>
        )}

        {/* Chat Stream */}
        <div className="flex-1 space-y-2 overflow-y-auto bg-[#1C1D22] px-3 py-3">
          {channelMessages.map(msg => {
            if (msg.isEphemeral) {
              return (
                <div
                  key={msg.id}
                  className="rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/[0.08] px-3 py-2.5"
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-[#99AAB5]">
                    <span className="font-semibold text-[#A3B0FF]">
                      Clyde · Ephemeral
                    </span>
                    <span>Only you can see this</span>
                  </div>
                  <div className="text-xs font-medium text-slate-100">
                    {msg.content}
                  </div>
                  {(msg.ephemeralChannels || msg.ephemeralUsers) && (
                    <div className="mt-2 space-y-1.5 text-xs text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-200">
                          Blocked Channels:{' '}
                        </span>
                        {msg.ephemeralChannels && msg.ephemeralChannels.length > 0
                          ? msg.ephemeralChannels.map(c => `#${c}`).join(', ')
                          : 'None'}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200">
                          Blocked Users:{' '}
                        </span>
                        {msg.ephemeralUsers && msg.ephemeralUsers.length > 0
                          ? msg.ephemeralUsers.map(u => `@${u}`).join(', ')
                          : 'None'}
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            const author =
              users[msg.authorId] ??
              (msg.authorId === 'you'
                ? {
                    id: 'you',
                    username: 'horndogcop',
                    displayName: 'You',
                    roleColor: '#F8FAFC',
                    avatar: '/src/assets/images/avatar_user_kaito_1795329072613.jpg',
                    bio: 'Valenced Plugin Author',
                    guildIds: ['g-1', 'g-2'],
                  }
                : undefined)
            if (!author) return null

            return (
              <div
                key={msg.id}
                className="group rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: 'profile', user: author })}
                    title={`Open User Profile for ${author.displayName}`}
                    className="mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10"
                  >
                    <img
                      src={author.avatar}
                      alt={author.displayName}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSheet({ kind: 'profile', user: author })}
                          className="truncate text-[13.5px] font-semibold hover:underline"
                          style={{ color: author.roleColor }}
                        >
                          {author.displayName}
                        </button>
                        <span className="font-mono text-[11px] text-[#949BA4] tabular-nums shrink-0">
                          {msg.timestamp}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSheet({ kind: 'message', message: msg })}
                        aria-label="Open message context menu"
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <p className="mt-0.5 text-[13.5px] leading-[20px] text-[#DBDEE1]">
                      {msg.content}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Autocomplete Popup Tray (Slash commands, Subcommands, @user, #channel) */}
        {(matchingSlashCommands.length > 0 ||
          matchingSubcommands.length > 0 ||
          mentionKind === '@' ||
          mentionKind === '#') && (
          <div className="max-h-48 overflow-y-auto border-t border-white/[0.08] bg-[#16181F] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {slashQueryMatch
                  ? 'Built-in Commands'
                  : subcommandMatch
                    ? 'Subcommands'
                    : mentionKind === '@'
                      ? 'Mention User Suggestions'
                      : 'Mention Channel Suggestions'}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {bypassInterception
                  ? 'Interception bypassed'
                  : isAddCommand
                    ? 'Command mentions allowed'
                    : 'Interception active'}
              </span>
            </div>

            {matchingSlashCommands.map(cmd => (
              <button
                key={cmd.name}
                type="button"
                onClick={() => applySuggestion(cmd.name)}
                className="flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-white">
                    /{cmd.name}
                  </div>
                  <div className="text-[11px] text-slate-400">{cmd.desc}</div>
                </div>
              </button>
            ))}

            {matchingSubcommands.map(sub => (
              <button
                key={sub}
                type="button"
                onClick={() => applySuggestion(sub)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium text-white transition-colors hover:bg-white/[0.06]"
              >
                <span className="font-mono">{sub}</span>
                <span className="text-[11px] text-slate-400">
                  {sub === 'user' ? '@user target' : '#channel target'}
                </span>
              </button>
            ))}

            {mentionKind === '@' &&
              (userSuggestions.length === 0 ? (
                <div className="px-2 py-2 text-xs text-slate-500">
                  No unblocked @user suggestions match.
                </div>
              ) : (
                userSuggestions.map(u => {
                  const isBlocked = Boolean(storage.blockedUsers[u.id])
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => applySuggestion(`@${u.username}`)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={u.avatar}
                          alt={u.displayName}
                          referrerPolicy="no-referrer"
                          className="h-6 w-6 rounded-full object-cover"
                        />
                        <span className="truncate text-xs font-medium text-white">
                          {u.displayName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          @{u.username}
                        </span>
                      </div>
                      {isBlocked && (
                        <span className="text-[10px] font-medium text-amber-400">
                          Blocked
                        </span>
                      )}
                    </button>
                  )
                })
              ))}

            {mentionKind === '#' &&
              (channelSuggestions.length === 0 ? (
                <div className="px-2 py-2 text-xs text-slate-500">
                  No unblocked #channel suggestions match.
                </div>
              ) : (
                channelSuggestions.map(ch => {
                  const isBlocked = Boolean(storage.blockedChannels[ch.id])
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => applySuggestion(`#${ch.name}`)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <div className="flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs font-medium text-white">
                          {ch.name}
                        </span>
                      </div>
                      {isBlocked && (
                        <span className="text-[10px] font-medium text-amber-400">
                          Blocked
                        </span>
                      )}
                    </button>
                  )
                })
              ))}
          </div>
        )}

        {/* Composer Input + Trigger Shortcuts */}
        <div className="border-t border-white/[0.06] bg-[#1C1D22] px-3 pt-2 pb-3">
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
            {[
              { label: '@mention', value: '@' },
              { label: '#channel', value: '#' },
              { label: '/mention-add', value: '/mention-add ' },
              { label: '/mention-remove', value: '/mention-remove ' },
              { label: '/mention-list', value: '/mention-list' },
            ].map(chip => (
              <button
                key={chip.label}
                type="button"
                onClick={() => onComposerDraftChange(chip.value)}
                className="rounded-md border border-white/[0.08] bg-[#252730] px-2 py-1 font-mono text-[11px] text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={composerDraft}
              onChange={e => onComposerDraftChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Type @, #, or /mention-..."
              className="min-w-0 flex-1 rounded-full border border-white/[0.08] bg-[#2B2D31] px-4 py-2 text-xs text-white placeholder:text-slate-400 focus:border-[#5865F2] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSend}
              aria-label="Send message or run command"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white transition-colors hover:bg-[#4752C4]"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Message / Channel ActionSheet & User Profile Modal */}
        {sheet && (
          <div
            onClick={() => setSheet(null)}
            className="absolute inset-0 z-50 flex flex-col justify-end bg-black/65 backdrop-blur-[1px]"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="rounded-t-2xl border-t border-white/10 bg-[#1E1F24] px-4 pt-3 pb-6"
            >
              <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-white/20" />

              {sheet.kind === 'message' && (() => {
                const msgAuthor = users[sheet.message.authorId]
                const msgChannel =
                  channels.find(c => c.id === sheet.message.channelId) ??
                  activeChannel
                const userBlocked = msgAuthor
                  ? Boolean(storage.blockedUsers[msgAuthor.id])
                  : false
                const chanBlocked = Boolean(
                  storage.blockedChannels[msgChannel.id],
                )

                return (
                  <div>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="text-xs font-medium text-slate-400">
                        Message Context Menu · 2 plugin entries
                      </div>
                      <button
                        type="button"
                        onClick={() => setSheet(null)}
                        className="rounded p-1 text-slate-400 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-[#262830]">
                      {msgAuthor && (
                        <button
                          type="button"
                          onClick={() => {
                            const nowBlocked = onToggleUserBlocked(msgAuthor.id)
                            setSheet(null)
                            showToast(
                              nowBlocked
                                ? `Blocked @${msgAuthor.username} from mentions`
                                : `Restored @${msgAuthor.username} to mentions`,
                            )
                          }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.05]"
                        >
                          <span className="flex items-center gap-3">
                            {userBlocked ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Ban className="h-4 w-4 text-[#7984F6]" />
                            )}
                            <span>
                              {userBlocked
                                ? `Unblock @${msgAuthor.username} from Mentions`
                                : `Block @${msgAuthor.username} from Mentions`}
                            </span>
                          </span>
                          <User className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const nowBlocked = onToggleChannelBlocked(msgChannel.id)
                          setSheet(null)
                          showToast(
                            nowBlocked
                              ? `Blocked #${msgChannel.name} from mentions`
                              : `Restored #${msgChannel.name} to mentions`,
                          )
                        }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.05]"
                      >
                        <span className="flex items-center gap-3">
                          {chanBlocked ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Ban className="h-4 w-4 text-[#7984F6]" />
                          )}
                          <span>
                            {chanBlocked
                              ? `Unblock #${msgChannel.name} from Mentions`
                              : `Block #${msgChannel.name} from Mentions`}
                          </span>
                        </span>
                        <Hash className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                )
              })()}

              {sheet.kind === 'channel' && (() => {
                const chanBlocked = Boolean(
                  storage.blockedChannels[sheet.channel.id],
                )
                return (
                  <div>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-slate-400" />
                        <span className="font-display text-sm font-semibold text-white">
                          {sheet.channel.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSheet(null)}
                        className="rounded p-1 text-slate-400 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#262830]">
                      <button
                        type="button"
                        onClick={() => {
                          const nowBlocked = onToggleChannelBlocked(
                            sheet.channel.id,
                          )
                          setSheet(null)
                          showToast(
                            nowBlocked
                              ? `Blocked #${sheet.channel.name} from mentions`
                              : `Restored #${sheet.channel.name} to mentions`,
                          )
                        }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.05]"
                      >
                        <span className="flex items-center gap-3">
                          {chanBlocked ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Ban className="h-4 w-4 text-[#7984F6]" />
                          )}
                          <span>
                            {chanBlocked
                              ? 'Unblock Channel from Mentions'
                              : 'Block Channel from Mentions'}
                          </span>
                        </span>
                        <span className="text-xs text-slate-400">Valenced</span>
                      </button>
                    </div>
                  </div>
                )
              })()}

              {sheet.kind === 'profile' && (() => {
                const userBlocked = Boolean(
                  storage.blockedUsers[sheet.user.id],
                )
                return (
                  <div>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={sheet.user.avatar}
                          alt={sheet.user.displayName}
                          referrerPolicy="no-referrer"
                          className="h-14 w-14 rounded-full object-cover ring-2 ring-white/10"
                        />
                        <div>
                          <div className="font-display text-base font-semibold text-white">
                            {sheet.user.displayName}
                          </div>
                          <div className="font-mono text-xs text-slate-400">
                            @{sheet.user.username}
                          </div>
                          <div className="mt-1 text-xs text-slate-300">
                            {sheet.user.bio}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSheet(null)}
                        className="rounded p-1 text-slate-400 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-[#262830]">
                      <div className="flex items-center gap-3 px-4 py-2.5 text-xs text-slate-400">
                        <ShieldCheck className="h-4 w-4 text-slate-500" />
                        <span>User Profile Actions</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nowBlocked = onToggleUserBlocked(sheet.user.id)
                          setSheet(null)
                          showToast(
                            nowBlocked
                              ? `Blocked @${sheet.user.username} from mentions`
                              : `Restored @${sheet.user.username} to mentions`,
                          )
                        }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.05]"
                      >
                        <span className="flex items-center gap-3">
                          <AtSign className="h-4 w-4 text-[#7984F6]" />
                          <span>
                            {userBlocked
                              ? 'Unblock User from Mentions'
                              : 'Block User from Mentions'}
                          </span>
                        </span>
                        <span className="text-xs text-slate-400">Valenced</span>
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
