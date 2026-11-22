import { useState } from 'react'
import { Check, Copy, FileCode2, FileJson, FileText } from 'lucide-react'
import { PLUGIN_SOURCE_FILES } from '../data/pluginFiles'

export function SourceExplorer() {
  const [activePath, setActivePath] = useState(PLUGIN_SOURCE_FILES[2].path)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const activeFile =
    PLUGIN_SOURCE_FILES.find(file => file.path === activePath) ??
    PLUGIN_SOURCE_FILES[0]

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content)
      setCopiedPath(activeFile.path)
      setTimeout(() => {
        setCopiedPath(prev => (prev === activeFile.path ? null : prev))
      }, 1800)
    } catch {
      // Clipboard fallback ignored if blocked
    }
  }

  const getIcon = (lang: string) => {
    if (lang === 'json') return <FileJson className="h-3.5 w-3.5 text-amber-400/80 shrink-0" />
    if (lang === 'markdown') return <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    return <FileCode2 className="h-3.5 w-3.5 text-[#7984F6] shrink-0" />
  }

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-white/[0.08] bg-[#161922] lg:grid-cols-[290px_1fr]">
      {/* File Tree Sidebar */}
      <div className="border-b border-white/[0.08] bg-[#12151D] p-3 lg:border-b-0 lg:border-r">
        <div className="px-2.5 pb-2.5 text-xs font-medium text-slate-400">
          valenced-plugin-template layout
        </div>
        <div className="space-y-0.5">
          {PLUGIN_SOURCE_FILES.map(file => {
            const active = file.path === activeFile.path
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setActivePath(file.path)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors ${
                  active
                    ? 'bg-[#5865F2]/20 text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                {getIcon(file.language)}
                <span className="truncate">{file.path}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Code Viewer */}
      <div className="flex min-w-0 flex-col bg-[#0F1117]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#161922] px-5 py-3.5">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs font-medium text-white">
              {activeFile.path}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {activeFile.summary}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1C202B] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/20 hover:bg-[#232837] whitespace-nowrap shrink-0"
          >
            {copiedPath === activeFile.path ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span>Copy File</span>
              </>
            )}
          </button>
        </div>

        <div className="max-h-[640px] overflow-auto p-5">
          <pre className="font-mono text-[12.5px] leading-6 text-slate-200">
            <code>{activeFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}
