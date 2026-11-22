import { useState } from 'react'
import {
  ChevronDown,
  ExternalLink,
  FileArchive,
  FileText,
  Hash,
  Pin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type {
  ParsedSearchQuery,
  SimChannel,
  SimSearchMessage,
  SimUser,
} from '../types/simulator'

interface DiscordSimulatorProps {
  query: string
  parsed: ParsedSearchQuery
  results: SimSearchMessage[]
  totalCorpusCount: number
  users: Record<string, SimUser>
  channels: SimChannel[]
  onQueryChange: (next: string) => void
}

const HAS_OPTIONS = [
  { value: 'image', label: 'image' },
  { value: 'embed', label: 'embed' },
  { value: 'attachment', label: 'attachment' },
  { value: 'link', label: 'link' },
  { value: 'video', label: 'video' },
]

export function DiscordSimulator({
  query,
  parsed,
  results,
  totalCorpusCount,
  users,
  channels,
  onQueryChange,
}: DiscordSimulatorProps) {
  const [menuOpen, setMenuOpen] = useState(true)
  const [negateMode, setNegateMode] = useState(true)
  const [pickerSubmenu, setPickerSubmenu] = useState<
    'none' | 'from' | 'in' | 'mentions'
  >('none')

  const appendToken = (token: string) => {
    const trimmed = query.trimEnd()
    const next = trimmed.length > 0 ? `${trimmed} ${token}` : token
    onQueryChange(next)
    setPickerSubmenu('none')
  }

  const removeTokenAt = (rawToken: string, occurrenceIdx: number) => {
    const parts = query.trim().split(/\s+/).filter(Boolean)
    let seen = 0
    const nextParts = parts.filter(part => {
      if (part === rawToken) {
        if (seen === occurrenceIdx) {
          seen += 1
          return false
        }
        seen += 1
      }
      return true
    })
    onQueryChange(nextParts.join(' '))
  }

  // Contextual inline autocomplete when user is mid-typing a filter
  const lastWord = query.split(/\s+/).pop() ?? ''
  const typingNegHas = lastWord.match(/^(-?)has:(.*)$/i)
  const typingNegFrom = lastWord.match(/^(-?)from:(.*)$/i)
  const typingNegIn = lastWord.match(/^(-?)in:(.*)$/i)

  const completeLastWord = (replacement: string) => {
    const idx = query.lastIndexOf(lastWord)
    const before = idx >= 0 ? query.slice(0, idx) : ''
    onQueryChange(`${before}${replacement} `)
  }

  const prefix = negateMode ? '-' : ''
  const allTokens = [...parsed.positiveFilters, ...parsed.negativeFilters]

  return (
    <div className="flex flex-col items-center">
      {/* Mobile Device Bezel */}
      <div className="relative flex h-[760px] w-full max-w-[404px] flex-col overflow-hidden rounded-[34px] border border-white/[0.12] bg-[#1C1D22] shadow-2xl">
        {/* Android Status Strip */}
        <div className="flex items-center justify-between bg-[#141519] px-6 pt-3 pb-2 text-[11px] font-medium text-slate-300 tabular-nums">
          <span>23:02</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span>Valenced</span>
            <span aria-hidden="true">·</span>
            <span>5G</span>
          </div>
        </div>

        {/* Search Input Header */}
        <div className="border-b border-white/[0.06] bg-[#1C1D22] px-3.5 pt-2.5 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#111216] px-3 py-2 focus-within:border-[#5865F2]">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => onQueryChange(e.target.value)}
                placeholder="Search (e.g. has:attachment -has:image)"
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white placeholder:text-slate-500 focus:outline-none"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => onQueryChange('')}
                  aria-label="Clear search query"
                  className="rounded p-0.5 text-slate-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle search filter menu"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                menuOpen
                  ? 'border-[#5865F2] bg-[#5865F2]/20 text-white'
                  : 'border-white/[0.08] bg-[#252730] text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          {/* Inline Filter Token Bar (shows repeatable negative & positive tokens) */}
          {allTokens.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {allTokens.map((tok, idx) => (
                <button
                  key={`${tok.raw}-${idx}`}
                  type="button"
                  onClick={() => {
                    const sameRawBefore = allTokens
                      .slice(0, idx)
                      .filter(t => t.raw === tok.raw).length
                    removeTokenAt(tok.raw, sameRawBefore)
                  }}
                  title="Remove filter token"
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                    tok.negated
                      ? 'border border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                      : 'border border-[#5865F2]/40 bg-[#5865F2]/20 text-indigo-200 hover:bg-[#5865F2]/30'
                  }`}
                >
                  <span>{tok.raw}</span>
                  <X className="h-3 w-3 opacity-75" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Inline Typing Autocomplete Suggestions */}
        {(typingNegHas || typingNegFrom || typingNegIn) && (
          <div className="border-b border-white/[0.08] bg-[#16181F] px-3 py-2">
            <div className="mb-1 text-[11px] text-slate-400">
              Inline Filter Suggestions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {typingNegHas &&
                HAS_OPTIONS.filter(opt =>
                  opt.value.startsWith(typingNegHas[2].toLowerCase()),
                ).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      completeLastWord(`${typingNegHas[1]}has:${opt.value}`)
                    }
                    className="rounded border border-white/[0.08] bg-[#252730] px-2 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
                  >
                    {typingNegHas[1]}has:{opt.value}
                  </button>
                ))}
              {typingNegFrom &&
                Object.values(users)
                  .filter(u =>
                    u.username
                      .toLowerCase()
                      .includes(typingNegFrom[2].toLowerCase()),
                  )
                  .map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() =>
                        completeLastWord(`${typingNegFrom[1]}from:${u.username}`)
                      }
                      className="rounded border border-white/[0.08] bg-[#252730] px-2 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
                    >
                      {typingNegFrom[1]}from:{u.username}
                    </button>
                  ))}
              {typingNegIn &&
                channels
                  .filter(c =>
                    c.name
                      .toLowerCase()
                      .includes(typingNegIn[2].toLowerCase()),
                  )
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        completeLastWord(`${typingNegIn[1]}in:${c.name}`)
                      }
                      className="rounded border border-white/[0.08] bg-[#252730] px-2 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
                    >
                      {typingNegIn[1]}in:{c.name}
                    </button>
                  ))}
            </div>
          </div>
        )}

        {/* Search Filter Menu (Collapsible) */}
        {menuOpen && (
          <div className="border-b border-white/[0.08] bg-[#16181F] px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">
                Search Filter Menu
              </span>
              <button
                type="button"
                onClick={() => setNegateMode(m => !m)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  negateMode
                    ? 'bg-rose-600 text-white'
                    : 'bg-[#252730] text-slate-300 hover:text-white'
                }`}
              >
                Negate (-): {negateMode ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setPickerSubmenu(s => (s === 'from' ? 'none' : 'from'))
                }
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#232630] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
              >
                <span>{prefix}from: user</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setPickerSubmenu(s => (s === 'in' ? 'none' : 'in'))
                }
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#232630] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
              >
                <span>{prefix}in: channel</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setPickerSubmenu(s =>
                    s === 'mentions' ? 'none' : 'mentions',
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#232630] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
              >
                <span>{prefix}mentions: user</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {HAS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => appendToken(`${prefix}has:${opt.value}`)}
                  className="rounded-md border border-white/[0.08] bg-[#232630] px-2.5 py-1 font-mono text-[11px] text-slate-200 transition-colors hover:border-white/20 hover:text-white"
                >
                  {prefix}has:{opt.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => appendToken(`${prefix}pinned:true`)}
                className="rounded-md border border-white/[0.08] bg-[#232630] px-2.5 py-1 font-mono text-[11px] text-slate-200 transition-colors hover:border-white/20 hover:text-white"
              >
                {prefix}pinned:true
              </button>
            </div>

            {/* Submenu value picker for repeatable from: / in: / mentions: */}
            {pickerSubmenu !== 'none' && (
              <div className="mt-2.5 rounded-lg border border-white/[0.08] bg-[#101218] p-2">
                <div className="mb-1.5 text-[11px] text-slate-400">
                  Pick {pickerSubmenu === 'in' ? 'channel' : 'user'} to{' '}
                  {negateMode ? 'exclude' : 'require'} (repeatable)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pickerSubmenu === 'in'
                    ? channels.map(ch => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => appendToken(`${prefix}in:${ch.name}`)}
                          className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#1C202B] px-2 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
                        >
                          <Hash className="h-3 w-3 text-slate-400" />
                          {ch.name}
                        </button>
                      ))
                    : Object.values(users).map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() =>
                            appendToken(`${prefix}${pickerSubmenu}:${u.username}`)
                          }
                          className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#1C202B] px-2 py-1 font-mono text-[11px] text-slate-200 hover:border-white/20"
                        >
                          <img
                            src={u.avatar}
                            alt={u.displayName}
                            referrerPolicy="no-referrer"
                            className="h-4 w-4 rounded-full object-cover"
                          />
                          {u.username}
                        </button>
                      ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Results Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#18191F] px-4 py-2 text-xs text-slate-400">
          <span className="font-mono tabular-nums">
            {results.length} of {totalCorpusCount} Results
          </span>
          {parsed.negativeFilters.length > 0 && (
            <span className="text-[11px] text-rose-300">
              {parsed.negativeFilters.length} negative filter
              {parsed.negativeFilters.length > 1 ? 's' : ''} active
            </span>
          )}
        </div>

        {/* Search Results Stream */}
        <div className="flex-1 space-y-2.5 overflow-y-auto bg-[#1C1D22] px-3 py-3">
          {results.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-[#16181F] px-4 py-8 text-center">
              <div className="text-sm font-medium text-slate-200">
                No matching messages
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Try removing one of the active negative or positive search filters.
              </p>
            </div>
          ) : (
            results.map(msg => {
              const author = users[msg.authorId]
              const channel = channels.find(c => c.id === msg.channelId)
              if (!author || !channel) return null

              return (
                <div
                  key={msg.id}
                  className="rounded-xl border border-white/[0.06] bg-[#22242B] p-3"
                >
                  {/* Result Channel + Pinned Context */}
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-300">
                      <Hash className="h-3 w-3 text-slate-400" />
                      {channel.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {msg.pinned && (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Pin className="h-3 w-3" />
                          Pinned
                        </span>
                      )}
                      <span className="font-mono tabular-nums">{msg.date}</span>
                    </div>
                  </div>

                  {/* Message Header & Content */}
                  <div className="flex items-start gap-2.5">
                    <img
                      src={author.avatar}
                      alt={author.displayName}
                      referrerPolicy="no-referrer"
                      className="mt-0.5 h-8 w-8 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-semibold"
                          style={{ color: author.roleColor }}
                        >
                          {author.displayName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          @{author.username}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {msg.timestamp}
                        </span>
                      </div>

                      <p className="mt-1 text-[13px] leading-5 text-[#DBDEE1]">
                        {msg.content}
                      </p>

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {msg.attachments.map(att =>
                            att.content_type.startsWith('image/') && att.url ? (
                              <div
                                key={att.id}
                                className="overflow-hidden rounded-lg border border-white/[0.06]"
                              >
                                <img
                                  src={att.url}
                                  alt={att.filename}
                                  referrerPolicy="no-referrer"
                                  className="h-28 w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div
                                key={att.id}
                                className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#181A20] px-3 py-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {att.filename.endsWith('.zip') ? (
                                    <FileArchive className="h-4 w-4 text-[#7984F6] shrink-0" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                                  )}
                                  <span className="truncate font-mono text-xs text-slate-200">
                                    {att.filename}
                                  </span>
                                </div>
                                <span className="ml-2 font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                                  {att.sizeLabel}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      )}

                      {/* Embeds */}
                      {msg.embeds && msg.embeds.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {msg.embeds.map((embed, i) => (
                            <div
                              key={i}
                              className="rounded-lg border border-white/[0.08] bg-[#181A20] px-3 py-2"
                            >
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>{embed.domain}</span>
                                <ExternalLink className="h-3 w-3" />
                              </div>
                              <div className="mt-0.5 text-xs font-semibold text-[#93A3FF]">
                                {embed.title}
                              </div>
                              <div className="mt-0.5 text-[11px] leading-4 text-slate-300">
                                {embed.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
