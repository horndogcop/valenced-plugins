import { patchSearchFilter } from './patches/searchFilter'
import { patchSearchMenu } from './patches/searchMenu'

// Intentionally no SettingsComponent: filters are entered inline or via the search menu.
export default plugin({
  start(api) {
    api.cleanup(patchSearchFilter(), patchSearchMenu())
  },
})
