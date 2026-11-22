import { useState } from 'react'
import { Download } from 'lucide-react'
import { DiscordSimulator } from './components/DiscordSimulator'
import { SettingsPanel } from './components/SettingsPanel'
import { SourceExplorer } from './components/SourceExplorer'
import { PLUGIN_SOURCE_FILES } from './data/pluginFiles'
import { evaluateSearchCorpus } from './utils/searchParser'
import { buildZipBlob } from './utils/zipBuilder'
import type {
  SimChannel,
  SimSearchMessage,
  SimUser,
} from './types/simulator'

const USERS: Record<string, SimUser> = {
  '948271640192843776': {
    id: '948271640192843776',
    username: 'maya.k',
    displayName: 'Maya',
    roleColor: '#8EA1E1',
    avatar: '/src/assets/images/avatar_user_maya_1795329072457.jpg',
  },
  '712904831249012736': {
    id: '712904831249012736',
    username: 'kaito_dev',
    displayName: 'Kaito',
    roleColor: '#6EE7B7',
    avatar: '/src/assets/images/avatar_user_kaito_1795329072613.jpg',
  },
  '551029384756102938': {
    id: '551029384756102938',
    username: 'sora_film',
    displayName: 'Sora',
    roleColor: '#FDBA74',
    avatar: '/src/assets/images/chat_artwork_courtyard_1795329073205.jpg',
  },
}

const CHANNELS: SimChannel[] = [
  { id: 'ch-general', name: 'general' },
  { id: 'ch-dev', name: 'dev-chat' },
  { id: 'ch-assets', name: 'assets' },
]

const SEARCH_CORPUS: SimSearchMessage[] = [
  {
    id: 's-1',
    channelId: 'ch-dev',
    authorId: '712904831249012736',
    timestamp: '19:12',
    date: '2026-11-21',
    pinned: true,
    content: 'Attached the Valenced plugin build archive without any image previews.',
    attachments: [
      {
        id: 'att-1',
        filename: 'negative-search-filters-v1.0.0.zip',
        content_type: 'application/zip',
        sizeLabel: '14.2 KB',
      },
    ],
  },
  {
    id: 's-2',
    channelId: 'ch-assets',
    authorId: '948271640192843776',
    timestamp: '20:04',
    date: '2026-11-21',
    content: 'Blue hour test frame from the ridge — high-res JPG attachment.',
    attachments: [
      {
        id: 'att-2',
        filename: 'alpine_blue_hour.jpg',
        content_type: 'image/jpeg',
        sizeLabel: '2.4 MB',
        url: '/src/assets/images/chat_photo_alpine_1795329072329.jpg',
      },
    ],
  },
  {
    id: 's-3',
    channelId: 'ch-general',
    authorId: '551029384756102938',
    timestamp: '20:41',
    date: '2026-11-20',
    content: 'Here is the Metro patch specification PDF for review.',
    attachments: [
      {
        id: 'att-3',
        filename: 'valenced-search-spec.pdf',
        content_type: 'application/pdf',
        sizeLabel: '418 KB',
      },
    ],
  },
  {
    id: 's-4',
    channelId: 'ch-dev',
    authorId: '948271640192843776',
    timestamp: '21:15',
    date: '2026-11-20',
    mentions: ['712904831249012736'],
    content: 'Check the Valenced plugin template docs: https://github.com/Valenced/valenced-plugin-template',
    embeds: [
      {
        title: 'Valenced/valenced-plugin-template',
        domain: 'github.com',
        url: 'https://github.com/Valenced/valenced-plugin-template',
        description: 'Starter monorepo template for external Valenced plugins and themes.',
      },
    ],
  },
  {
    id: 's-5',
    channelId: 'ch-assets',
    authorId: '551029384756102938',
    timestamp: '22:08',
    date: '2026-11-19',
    content: 'Night courtyard shot on 35mm film.',
    attachments: [
      {
        id: 'att-4',
        filename: 'courtyard_800t.jpg',
        content_type: 'image/jpeg',
        sizeLabel: '1.9 MB',
        url: '/src/assets/images/chat_artwork_courtyard_1795329073205.jpg',
      },
    ],
  },
  {
    id: 's-6',
    channelId: 'ch-general',
    authorId: '712904831249012736',
    timestamp: '22:30',
    date: '2026-11-21',
    content: 'Quick status note with no attachments or embeds at all.',
  },
]

const DEFAULT_QUERY = 'has:attachment -has:image'

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'source'>('simulator')
  const [query, setQuery] = useState(DEFAULT_QUERY)

  const { parsed, serverMatches, finalMatches } = evaluateSearchCorpus(
    query,
    SEARCH_CORPUS,
    USERS,
    CHANNELS,
  )

  const handleDownloadZip = () => {
    const blob = buildZipBlob(
      PLUGIN_SOURCE_FILES.map(file => ({
        path: `valenced-negative-search-filters/${file.path}`,
        content: file.content,
      })),
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'valenced-negative-search-filters.zip'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[#0F1117] text-slate-100">
      {/* Top Bar Contract: 1 row, 3 zones */}
      <header className="border-b border-white/[0.08] bg-[#12151D]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-8 px-6 py-4">
          <span className="font-display text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
            Valenced · Negative Search Filters
          </span>

          <nav className="flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className={`border-b-2 pb-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'simulator'
                  ? 'border-[#5865F2] text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Interactive Simulator
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('source')}
              className={`border-b-2 pb-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'source'
                  ? 'border-[#5865F2] text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Plugin Source
            </button>
          </nav>

          <button
            type="button"
            onClick={handleDownloadZip}
            className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4752C4] whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download Plugin .zip</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-6 py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-white/[0.06] pb-6 md:flex-row md:items-end">
          <div>
            <div className="text-xs text-slate-400">
              <span>com.valenced.negative-search-filters</span>
              <span aria-hidden="true" className="mx-2">·</span>
              <span>by horndogcop</span>
              <span aria-hidden="true" className="mx-2">·</span>
              <span className="font-mono">v1.0.0</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white [text-wrap:balance]">
              Client-Side Negative Search Filters for Valenced
            </h1>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-slate-400">
            Repeatable inline search negations (<code className="text-slate-200">-from:</code>, <code className="text-slate-200">-in:</code>, <code className="text-slate-200">-has:image</code>, <code className="text-slate-200">-has:embed</code>) added via typing or the search filter menu.
          </p>
        </div>

        {activeTab === 'simulator' ? (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[420px_1fr]">
            <DiscordSimulator
              query={query}
              parsed={parsed}
              results={finalMatches}
              totalCorpusCount={SEARCH_CORPUS.length}
              users={USERS}
              channels={CHANNELS}
              onQueryChange={setQuery}
            />

            <SettingsPanel
              query={query}
              parsed={parsed}
              serverCount={serverMatches.length}
              finalCount={finalMatches.length}
              onApplyPreset={setQuery}
              onReset={() => setQuery(DEFAULT_QUERY)}
            />
          </div>
        ) : (
          <SourceExplorer />
        )}
      </main>
    </div>
  )
}
