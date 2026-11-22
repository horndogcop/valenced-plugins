import { Filter, RotateCcw, Terminal } from 'lucide-react'
import type { ParsedSearchQuery } from '../types/simulator'

interface SettingsPanelProps {
  query: string
  parsed: ParsedSearchQuery
  serverCount: number
  finalCount: number
  onApplyPreset: (presetQuery: string) => void
  onReset: () => void
}

const PRESETS = [
  {
    label: 'Files that are not images',
    query: 'has:attachment -has:image',
    note: 'Keeps PDFs and archives while excluding PNG/JPG attachments.',
  },
  {
    label: 'Messages without embeds',
    query: '-has:embed',
    note: 'Strips -has:embed from server request and hides embedded cards locally.',
  },
  {
    label: 'Exclude multiple users',
    query: '-from:maya.k -from:kaito_dev',
    note: 'Demonstrates repeatable -from: filters stacked together.',
  },
  {
    label: 'Exclude channel and links',
    query: '-in:dev-chat -has:link',
    note: 'Hides results from #dev-chat and any message containing URLs.',
  },
]

export function SettingsPanel({
  query,
  parsed,
  serverCount,
  finalCount,
  onApplyPreset,
  onReset,
}: SettingsPanelProps) {
  return (
    <aside className="flex flex-col gap-6">
      {/* Client-Side Search Pipeline Breakdown (No Plugin Settings Page) */}
      <div className="rounded-xl border border-white/[0.08] bg-[#161922] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Search Query Pipeline
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              No settings page is registered (<code className="text-slate-200">SettingsComponent</code> omitted). Filters are typed inline or picked from the search menu.
            </p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1C202B] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div className="rounded-lg border border-white/[0.06] bg-[#101218] p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Raw Search Input</span>
              <span className="font-mono tabular-nums text-slate-300">
                {finalCount} shown
              </span>
            </div>
            <div className="mt-1.5 font-mono text-xs text-white break-all">
              {query.trim() || '(empty — showing all messages)'}
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#101218] p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>1. Outgoing Server Query (negations stripped)</span>
              <span className="font-mono tabular-nums text-slate-300">
                {serverCount} fetched
              </span>
            </div>
            <div className="mt-1.5 font-mono text-xs text-[#93A3FF] break-all">
              {parsed.serverQuery || '(broad server fetch without -tokens)'}
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#101218] p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>2. Client-Side Negative Predicates</span>
              <span className="font-mono tabular-nums text-slate-300">
                {parsed.negativeFilters.length} active
              </span>
            </div>
            {parsed.negativeFilters.length === 0 ? (
              <div className="mt-1.5 text-xs text-slate-500">
                No negative filters applied.
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parsed.negativeFilters.map((f, idx) => (
                  <span
                    key={`${f.raw}-${idx}`}
                    className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] text-rose-300"
                  >
                    {f.raw}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preset Test Queries */}
      <div className="rounded-xl border border-white/[0.08] bg-[#161922] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[#7984F6]" />
          <h3 className="font-display text-sm font-semibold text-white">
            Query Presets
          </h3>
        </div>

        <div className="space-y-2">
          {PRESETS.map(preset => (
            <div
              key={preset.label}
              className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#101218] px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200">
                  {preset.label}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-[#93A3FF]">
                  {preset.query}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {preset.note}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onApplyPreset(preset.query)}
                className="rounded border border-white/[0.08] bg-[#1C202B] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
              >
                Apply
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3.5 text-xs text-slate-400">
          <Filter className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <span>
            Supports repeatable <code className="text-slate-300">-from:</code>, <code className="text-slate-300">-in:</code>, <code className="text-slate-300">-mentions:</code>, <code className="text-slate-300">-has:</code>, <code className="text-slate-300">-pinned:</code>, <code className="text-slate-300">-before:</code>, <code className="text-slate-300">-after:</code>, and <code className="text-slate-300">-during:</code>.
          </span>
        </div>
      </div>
    </aside>
  )
}
