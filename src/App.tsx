import { useState } from 'react'
import { Download } from 'lucide-react'
import { DiscordSimulator } from './components/DiscordSimulator'
import { SettingsPanel } from './components/SettingsPanel'
import { SourceExplorer } from './components/SourceExplorer'
import { PLUGIN_SOURCE_FILES } from './data/pluginFiles'
import { buildZipBlob } from './utils/zipBuilder'
import type {
  MentionBlockStorage,
  SimChannel,
  SimGuild,
  SimMessage,
  SimUser,
} from './types/simulator'

const GUILDS: SimGuild[] = [
  { id: 'g-1', name: 'Valenced Lab', shortName: 'Valenced Lab' },
  { id: 'g-2', name: 'Photo Archive', shortName: 'Photo Archive' },
]

const CHANNELS: SimChannel[] = [
  {
    id: 'ch-101',
    guildId: 'g-1',
    name: 'general',
    topic: 'General chat · test @user and #channel autocomplete here',
  },
  {
    id: 'ch-102',
    guildId: 'g-1',
    name: 'dev-chat',
    topic: 'Plugin development & Valenced Metro hooks',
  },
  {
    id: 'ch-201',
    guildId: 'g-2',
    name: 'lounge',
    topic: 'Archive server · compare /mention-list scoping per server',
  },
  {
    id: 'ch-202',
    guildId: 'g-2',
    name: 'raw-shots',
    topic: 'Uncompressed film scans & camera roll',
  },
]

const USERS: Record<string, SimUser> = {
  '948271640192843776': {
    id: '948271640192843776',
    username: 'maya.k',
    displayName: 'Maya',
    roleColor: '#8EA1E1',
    avatar: '/src/assets/images/avatar_user_maya_1795329072457.jpg',
    bio: 'Member of Valenced Lab only',
    guildIds: ['g-1'],
  },
  '712904831249012736': {
    id: '712904831249012736',
    username: 'kaito_dev',
    displayName: 'Kaito',
    roleColor: '#6EE7B7',
    avatar: '/src/assets/images/avatar_user_kaito_1795329072613.jpg',
    bio: 'Member of both Valenced Lab and Photo Archive',
    guildIds: ['g-1', 'g-2'],
  },
  '551029384756102938': {
    id: '551029384756102938',
    username: 'sora_film',
    displayName: 'Sora',
    roleColor: '#FDBA74',
    avatar: '/src/assets/images/chat_photo_alpine_1795329072329.jpg',
    bio: 'Member of Photo Archive only',
    guildIds: ['g-2'],
  },
}

const INITIAL_MESSAGES: SimMessage[] = [
  {
    id: 'msg-1',
    channelId: 'ch-101',
    authorId: '948271640192843776',
    timestamp: '22:48',
    content:
      'Type @ or # below to test mention autocomplete. Right now I am blocked from suggestions.',
  },
  {
    id: 'msg-2',
    channelId: 'ch-101',
    authorId: '712904831249012736',
    timestamp: '22:51',
    content:
      'Tap ⋯ on any message for BOTH user and channel entries, or tap my avatar for my User Profile.',
  },
  {
    id: 'msg-3',
    channelId: 'ch-102',
    authorId: '712904831249012736',
    timestamp: '22:52',
    content: 'This channel (#dev-chat) is blocked from #channel autocomplete by default.',
  },
  {
    id: 'msg-4',
    channelId: 'ch-201',
    authorId: '551029384756102938',
    timestamp: '22:49',
    content:
      'Welcome to Photo Archive. Run /mention-list to verify it only lists blocked users and channels from this server.',
  },
  {
    id: 'msg-5',
    channelId: 'ch-202',
    authorId: '712904831249012736',
    timestamp: '22:53',
    content: 'This is #raw-shots in Photo Archive.',
  },
]

const INITIAL_STORAGE: MentionBlockStorage = {
  blockedUsers: {
    '948271640192843776': true,
  },
  blockedChannels: {
    'ch-102': true,
  },
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'source'>('simulator')
  const [activeGuildId, setActiveGuildId] = useState('g-1')
  const [activeChannelId, setActiveChannelId] = useState('ch-101')
  const [storage, setStorage] = useState<MentionBlockStorage>(INITIAL_STORAGE)
  const [messages, setMessages] = useState<SimMessage[]>(INITIAL_MESSAGES)
  const [composerDraft, setComposerDraft] = useState('')

  const handleSelectGuild = (guildId: string) => {
    setActiveGuildId(guildId)
    const firstChannel = CHANNELS.find(c => c.guildId === guildId)
    if (firstChannel) setActiveChannelId(firstChannel.id)
  }

  const handleToggleUserBlocked = (userId: string): boolean => {
    const nextVal = !storage.blockedUsers[userId]
    setStorage(prev => {
      const nextUsers = { ...prev.blockedUsers }
      if (nextVal) nextUsers[userId] = true
      else delete nextUsers[userId]
      return { ...prev, blockedUsers: nextUsers }
    })
    return nextVal
  }

  const handleToggleChannelBlocked = (channelId: string): boolean => {
    const nextVal = !storage.blockedChannels[channelId]
    setStorage(prev => {
      const nextChannels = { ...prev.blockedChannels }
      if (nextVal) nextChannels[channelId] = true
      else delete nextChannels[channelId]
      return { ...prev, blockedChannels: nextChannels }
    })
    return nextVal
  }

  const handleSetUserBlocked = (userId: string, blocked: boolean) => {
    setStorage(prev => {
      const nextUsers = { ...prev.blockedUsers }
      if (blocked) nextUsers[userId] = true
      else delete nextUsers[userId]
      return { ...prev, blockedUsers: nextUsers }
    })
  }

  const handleSetChannelBlocked = (channelId: string, blocked: boolean) => {
    setStorage(prev => {
      const nextChannels = { ...prev.blockedChannels }
      if (blocked) nextChannels[channelId] = true
      else delete nextChannels[channelId]
      return { ...prev, blockedChannels: nextChannels }
    })
  }

  const handleDownloadZip = () => {
    const blob = buildZipBlob(
      PLUGIN_SOURCE_FILES.map(file => ({
        path: `valenced-mention-block/${file.path}`,
        content: file.content,
      })),
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'valenced-mention-block.zip'
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
            Valenced · Mention Block
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
              <span>com.valenced.mention-block</span>
              <span aria-hidden="true" className="mx-2">·</span>
              <span>by horndogcop</span>
              <span aria-hidden="true" className="mx-2">·</span>
              <span className="font-mono">v1.0.0</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white [text-wrap:balance]">
              Mention Autocomplete Blocker for Valenced
            </h1>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-slate-400">
            Intercepts @user and #channel autocomplete suggestions, managed strictly via message, channel, and profile context menus plus slash commands.
          </p>
        </div>

        {activeTab === 'simulator' ? (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[420px_1fr]">
            <DiscordSimulator
              storage={storage}
              guilds={GUILDS}
              channels={CHANNELS}
              users={USERS}
              messages={messages}
              activeGuildId={activeGuildId}
              activeChannelId={activeChannelId}
              composerDraft={composerDraft}
              onComposerDraftChange={setComposerDraft}
              onSelectGuild={handleSelectGuild}
              onSelectChannel={setActiveChannelId}
              onToggleUserBlocked={handleToggleUserBlocked}
              onToggleChannelBlocked={handleToggleChannelBlocked}
              onSetUserBlocked={handleSetUserBlocked}
              onSetChannelBlocked={handleSetChannelBlocked}
              onAppendMessage={msg => setMessages(prev => [...prev, msg])}
            />

            <SettingsPanel
              storage={storage}
              users={USERS}
              channels={CHANNELS}
              guilds={GUILDS}
              activeGuildId={activeGuildId}
              onResetStorage={() => {
                setStorage(INITIAL_STORAGE)
                setMessages(INITIAL_MESSAGES)
                setComposerDraft('')
              }}
              onQuickCommand={draft => {
                setComposerDraft(draft)
              }}
            />
          </div>
        ) : (
          <SourceExplorer />
        )}
      </main>
    </div>
  )
}
