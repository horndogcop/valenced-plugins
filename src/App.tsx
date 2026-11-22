import { useState } from 'react'
import { Download } from 'lucide-react'
import { DiscordSimulator } from './components/DiscordSimulator'
import { SettingsPanel } from './components/SettingsPanel'
import { SourceExplorer } from './components/SourceExplorer'
import { PLUGIN_SOURCE_FILES } from './data/pluginFiles'
import { buildZipBlob } from './utils/zipBuilder'
import type {
  PluginSettings,
  SimChannel,
  SimMessage,
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
}

const CHANNELS: SimChannel[] = [
  {
    id: 'ch-general',
    name: 'general',
    nsfw: false,
    topic: 'Standard channel · casual photography & Valenced dev talk',
  },
  {
    id: 'ch-nsfw',
    name: 'after-hours-art',
    nsfw: true,
    topic: 'NSFW channel · age-restricted media and late-night photography',
  },
]

const MESSAGES: SimMessage[] = [
  {
    id: 'msg-1',
    channelId: 'ch-general',
    authorId: '712904831249012736',
    timestamp: '22:14',
    isSilent: true,
    segments: [
      {
        type: 'text',
        value:
          'Sent this one with @silent so nobody gets pinged. Notice the muted bell right after the timestamp.',
      },
    ],
  },
  {
    id: 'msg-2',
    channelId: 'ch-general',
    authorId: '948271640192843776',
    timestamp: '22:18',
    segments: [
      {
        type: 'text',
        value: 'Reached the upper ridge right before blue hour — ',
      },
      {
        type: 'spoiler',
        value: 'trail coordinates: 46.5472° N',
      },
      {
        type: 'text',
        value: '. Look at how still the water stayed.',
      },
    ],
    image: {
      url: '/src/assets/images/chat_photo_alpine_1795329072329.jpg',
      alt: 'Alpine mountain lake at twilight',
      filename: 'alpine_blue_hour.jpg',
      dimensions: '1440 × 1080',
    },
  },
  {
    id: 'msg-3',
    channelId: 'ch-general',
    authorId: '712904831249012736',
    timestamp: '22:21',
    segments: [
      {
        type: 'text',
        value:
          'Tap any username or avatar to toggle Hide User Content from their context menu.',
      },
    ],
  },
  {
    id: 'msg-4',
    channelId: 'ch-nsfw',
    authorId: '948271640192843776',
    timestamp: '22:24',
    segments: [
      {
        type: 'text',
        value: 'Night walk through the concrete courtyard — ',
      },
      {
        type: 'spoiler',
        value: 'shot on 35mm Cinestill 800T',
      },
      {
        type: 'text',
        value: ' after the rain cleared.',
      },
    ],
    image: {
      url: '/src/assets/images/chat_artwork_courtyard_1795329073205.jpg',
      alt: 'Rainy brutalist concrete courtyard at night',
      filename: 'courtyard_800t.jpg',
      dimensions: '1440 × 1080',
    },
  },
  {
    id: 'msg-5',
    channelId: 'ch-nsfw',
    authorId: '712904831249012736',
    timestamp: '22:26',
    isSilent: true,
    segments: [
      {
        type: 'text',
        value:
          'Channel is marked NSFW — toggle "Only in NSFW channels" to compare with #general.',
      },
    ],
  },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'source'>('simulator')
  const [activeChannelId, setActiveChannelId] = useState('ch-general')
  const [settings, setSettings] = useState<PluginSettings>({
    imageMode: 'hidden',
    nsfwOnly: false,
    hideText: false,
    hiddenUsers: {
      '948271640192843776': true,
    },
  })
  const [revealedBlocks, setRevealedBlocks] = useState<Record<string, boolean>>({})
  const [displayedImages, setDisplayedImages] = useState<Record<string, boolean>>({})
  const [revealedInlineSpoilers, setRevealedInlineSpoilers] = useState<
    Record<string, boolean>
  >({})

  const handleUpdateSettings = (patch: Partial<PluginSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
  }

  const handleToggleUserHidden = (userId: string) => {
    setSettings(prev => {
      const nextUsers = { ...prev.hiddenUsers }
      if (nextUsers[userId]) {
        delete nextUsers[userId]
      } else {
        nextUsers[userId] = true
      }
      return { ...prev, hiddenUsers: nextUsers }
    })
  }

  const handleToggleImageIndicator = (messageId: string) => {
    setDisplayedImages(prev => {
      const nextVal = !prev[messageId]
      if (nextVal && settings.hideText) {
        setRevealedBlocks(rb => ({ ...rb, [messageId]: true }))
      }
      return { ...prev, [messageId]: nextVal }
    })
  }

  const handleResetTransient = () => {
    setRevealedBlocks({})
    setDisplayedImages({})
    setRevealedInlineSpoilers({})
  }

  const handleDownloadZip = () => {
    const blob = buildZipBlob(
      PLUGIN_SOURCE_FILES.map(file => ({
        path: `valenced-hide-user-content/${file.path}`,
        content: file.content,
      })),
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'valenced-hide-user-content.zip'
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
            Valenced · Hide User Content
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
              <span>com.valenced.hide-user-content</span>
              <span aria-hidden="true" className="mx-2">·</span>
              <span>valenced-plugin-template</span>
              <span aria-hidden="true" className="mx-2">·</span>
              <span className="font-mono">v1.0.0</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white [text-wrap:balance]">
              User Content Hiding Plugin for Valenced
            </h1>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-slate-400">
            Adds a user context menu toggle, strict 3-option settings, a post-timestamp media indicator, and full-block spoilers with whitespace collapse.
          </p>
        </div>

        {activeTab === 'simulator' ? (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[420px_1fr]">
            <DiscordSimulator
              settings={settings}
              users={USERS}
              channels={CHANNELS}
              messages={MESSAGES}
              activeChannelId={activeChannelId}
              revealedBlocks={revealedBlocks}
              displayedImages={displayedImages}
              revealedInlineSpoilers={revealedInlineSpoilers}
              onSelectChannel={setActiveChannelId}
              onToggleUserHidden={handleToggleUserHidden}
              onRevealBlock={messageId =>
                setRevealedBlocks(prev => ({ ...prev, [messageId]: true }))
              }
              onCollapseBlock={messageId =>
                setRevealedBlocks(prev => ({ ...prev, [messageId]: false }))
              }
              onToggleImageIndicator={handleToggleImageIndicator}
              onToggleInlineSpoiler={spoilerKey =>
                setRevealedInlineSpoilers(prev => ({
                  ...prev,
                  [spoilerKey]: !prev[spoilerKey],
                }))
              }
            />

            <SettingsPanel
              settings={settings}
              users={USERS}
              onUpdateSettings={handleUpdateSettings}
              onToggleUserHidden={handleToggleUserHidden}
              onResetTransient={handleResetTransient}
            />
          </div>
        ) : (
          <SourceExplorer />
        )}
      </main>
    </div>
  )
}
