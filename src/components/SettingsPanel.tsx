import { Hash, RotateCcw, Slash, Terminal, User } from 'lucide-react'
import type {
  MentionBlockStorage,
  SimChannel,
  SimGuild,
  SimUser,
} from '../types/simulator'

interface SettingsPanelProps {
  storage: MentionBlockStorage
  users: Record<string, SimUser>
  channels: SimChannel[]
  guilds: SimGuild[]
  activeGuildId: string
  onResetStorage: () => void
  onQuickCommand: (draft: string) => void
}

export function SettingsPanel({
  storage,
  users,
  channels,
  guilds,
  activeGuildId,
  onResetStorage,
  onQuickCommand,
}: SettingsPanelProps) {
  const blockedUserIds = Object.keys(storage.blockedUsers).filter(
    id => storage.blockedUsers[id],
  )
  const blockedChannelIds = Object.keys(storage.blockedChannels).filter(
    id => storage.blockedChannels[id],
  )

  const getGuildName = (guildId: string) =>
    guilds.find(g => g.id === guildId)?.name ?? guildId

  return (
    <aside className="flex flex-col gap-6">
      {/* Stored Plugin State (No Settings Page) */}
      <div className="rounded-xl border border-white/[0.08] bg-[#161922] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Stored Blocklists
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              No settings page is registered (<code className="text-slate-200">SettingsComponent</code> omitted). Manage entries via context menus or commands.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetStorage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1C202B] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        {/* Blocked Users */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400" />
              Blocked Users
            </span>
            <span className="font-mono text-slate-400 tabular-nums">
              {blockedUserIds.length}
            </span>
          </div>
          <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-[#101218]">
            {blockedUserIds.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-slate-500">
                No users blocked from @mention autocomplete.
              </div>
            ) : (
              blockedUserIds.map(id => {
                const user = users[id]
                if (!user) return null
                const inCurrentGuild = user.guildIds.includes(activeGuildId)
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={user.avatar}
                        alt={user.displayName}
                        referrerPolicy="no-referrer"
                        className="h-7 w-7 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-200">
                          {user.displayName}
                        </div>
                        <div className="truncate font-mono text-[11px] text-slate-500">
                          @{user.username} · {inCurrentGuild ? 'In current server' : 'Other server'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Blocked Channels */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-slate-400" />
              Blocked Channels
            </span>
            <span className="font-mono text-slate-400 tabular-nums">
              {blockedChannelIds.length}
            </span>
          </div>
          <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-[#101218]">
            {blockedChannelIds.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-slate-500">
                No channels blocked from #mention autocomplete.
              </div>
            ) : (
              blockedChannelIds.map(id => {
                const ch = channels.find(c => c.id === id)
                if (!ch) return null
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-200">
                        #{ch.name}
                      </div>
                      <div className="truncate font-mono text-[11px] text-slate-500">
                        {getGuildName(ch.guildId)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Test Surfaces & Slash Commands */}
      <div className="rounded-xl border border-white/[0.08] bg-[#161922] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[#7984F6]" />
          <h3 className="font-display text-sm font-semibold text-white">
            Commands &amp; Context Menus
          </h3>
        </div>

        <div className="space-y-2 text-xs leading-relaxed text-slate-400">
          <div className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#101218] px-3 py-2.5">
            <div>
              <div className="font-mono text-slate-200">
                /mention-add user | channel
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Adds user or channel to blocklist; accepts intercepted mentions.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onQuickCommand('/mention-add user ')}
              className="rounded border border-white/[0.08] bg-[#1C202B] px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-white/20 whitespace-nowrap shrink-0"
            >
              Try
            </button>
          </div>

          <div className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#101218] px-3 py-2.5">
            <div>
              <div className="font-mono text-slate-200">
                /mention-remove user | channel
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Bypasses interception so blocked suggestions reappear to restore.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onQuickCommand('/mention-remove user ')}
              className="rounded border border-white/[0.08] bg-[#1C202B] px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-white/20 whitespace-nowrap shrink-0"
            >
              Try
            </button>
          </div>

          <div className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#101218] px-3 py-2.5">
            <div>
              <div className="font-mono text-slate-200">/mention-list</div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Ephemeral list of blocked channels &amp; members in current server.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onQuickCommand('/mention-list')}
              className="rounded border border-white/[0.08] bg-[#1C202B] px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-white/20 whitespace-nowrap shrink-0"
            >
              Run
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3.5 text-xs text-slate-400">
          <Slash className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <span>
            Also tap message <code className="text-slate-300">⋯</code> (2 entries), channel header menu, or any user avatar for Profile actions.
          </span>
        </div>
      </div>
    </aside>
  )
}
