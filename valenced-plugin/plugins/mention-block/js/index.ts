import { patchAutocomplete } from './patches/autocomplete'
import { patchCommands } from './patches/commands'
import { patchContextMenus } from './patches/contextMenus'
import { bindStorage, DEFAULT_STORAGE, setInterceptionBypass } from './storage'
import type { MentionBlockStorage } from './types'

// Intentionally no SettingsComponent: managed strictly via context menus and commands.
export default plugin<{ jsonStorage: MentionBlockStorage }>({
  jsonStorage: {
    load: true,
    default: DEFAULT_STORAGE,
  },

  async start(api) {
    bindStorage(api.jsonStorage)
    await api.jsonStorage.get()

    api.cleanup(
      patchAutocomplete(),
      patchContextMenus(),
      patchCommands(),
      () => setInterceptionBypass(false),
    )
  },

  stop() {
    setInterceptionBypass(false)
  },
})
