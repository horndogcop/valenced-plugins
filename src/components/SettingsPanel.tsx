import { Eye, EyeOff, RotateCcw } from 'lucide-react'
import type { ImageDisplayMode, PluginSettings, SimUser } from '../types/simulator'

interface SettingsPanelProps {
  settings: PluginSettings
  users: Record<string, SimUser>
  onUpdateSettings: (patch: Partial<PluginSettings>) => void
  onToggleUserHidden: (userId: string) => void
  onResetTransient: () => void
}

export function SettingsPanel({
  settings,
  users,
  onUpdateSettings,
  onToggleUserHidden,
  onResetTransient,
}: SettingsPanelProps) {
  const hiddenUserIds = Object.keys(settings.hiddenUsers).filter(
    id => settings.hiddenUsers[id],
  )

  return (
    <aside className="flex flex-col gap-6">
      <div className="rounded-xl border border-white/[0.08] bg-[#161922] p-5">
        <div className="mb-5">
          <h2 className="font-display text-base font-semibold text-white">
            Plugin Settings
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
            Exact options exposed in Valenced&apos;s <code className="text-slate-200">SettingsComponent</code>.
          </p>
        </div>

        {/* Option 1: Image Display Mode (Hidden vs Blurred) */}
        <div className="space-y-2.5">
          <div className="text-xs font-medium text-slate-300">
            1. Image Behavior
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-[#101218] p-1">
            {(['hidden', 'blurred'] as ImageDisplayMode[]).map(mode => {
              const active = settings.imageMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdateSettings({ imageMode: mode })}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#5865F2] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode === 'hidden' ? (
                    <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="capitalize">{mode}</span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">
            {settings.imageMode === 'hidden'
              ? 'Images are removed until toggled via the post-timestamp indicator.'
              : 'Images remain in place behind a blur until toggled via the indicator.'}
          </p>
        </div>

        <div className="my-5 h-px bg-white/[0.06]" />

        {/* Option 2: Only in NSFW channels */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-200">
              2. Only in NSFW channels
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
              Restrict hiding to channels marked as age-restricted.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.nsfwOnly}
            aria-label="Only in NSFW channels"
            onClick={() => onUpdateSettings({ nsfwOnly: !settings.nsfwOnly })}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] ${
              settings.nsfwOnly
                ? 'border-[#5865F2] bg-[#5865F2]'
                : 'border-white/10 bg-[#252834]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.nsfwOnly ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="my-5 h-px bg-white/[0.06]" />

        {/* Option 3: Only images vs Images and text */}
        <div className="space-y-2.5">
          <div className="text-xs font-medium text-slate-300">
            3. Content to Hide
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-[#101218] p-1">
            {[
              { value: false, label: 'Only images' },
              { value: true, label: 'Images & text' },
            ].map(opt => {
              const active = settings.hideText === opt.value
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => onUpdateSettings({ hideText: opt.value })}
                  className={`flex items-center justify-center rounded-md px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#5865F2] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">
            {settings.hideText
              ? 'Wraps the full message block in a spoiler overlay; tap whitespace to re-cover.'
              : 'Keeps message text visible while hiding or blurring image attachments.'}
          </p>
        </div>
      </div>

      {/* Hidden Users Managed via Context Menu */}
      <div className="rounded-xl border border-white/[0.08] bg-[#161922] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-white">
              Hidden Users
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Toggled from any user&apos;s context menu in the simulator.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetTransient}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1C202B] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset reveals
          </button>
        </div>

        <div className="mt-4 divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-[#101218]">
          {hiddenUserIds.length === 0 ? (
            <div className="px-3.5 py-4 text-xs text-slate-500">
              No users currently hidden. Tap a user in chat to open their context menu.
            </div>
          ) : (
            hiddenUserIds.map(id => {
              const user = users[id]
              if (!user) return null
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
                        @{user.username}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleUserHidden(id)}
                    className="rounded-md border border-white/[0.08] bg-[#1C202B] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
                  >
                    Unhide
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 text-xs text-slate-400">
          <div className="font-medium text-slate-300">Interaction checks</div>
          <ul className="space-y-1.5 leading-relaxed text-slate-400">
            <li>Tap any author name or avatar to open the User ActionSheet.</li>
            <li>Tap the eye icon after the timestamp to toggle image display.</li>
            <li>In Images &amp; text mode, tap the block to reveal, tap spoilers/images freely, then tap whitespace to restore the overlay.</li>
          </ul>
        </div>
      </div>
    </aside>
  )
}
