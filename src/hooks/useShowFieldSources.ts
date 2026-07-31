import { useCallback, useSyncExternalStore } from 'react'

export const SHOW_FIELD_SOURCES_KEY = 'smirkpocasi:show-field-sources'
const CHANGE_EVENT = 'smirkpocasi:show-field-sources-change'

function readEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(SHOW_FIELD_SOURCES_KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}

  const onStorage = (event: StorageEvent) => {
    if (event.key === SHOW_FIELD_SOURCES_KEY || event.key === null) onStoreChange()
  }

  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onStoreChange)
  }
}

/** Nerd-zone preference: show which providers fed each consensus value. */
export function useShowFieldSources() {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false)

  const setEnabled = useCallback((next: boolean) => {
    try {
      localStorage.setItem(SHOW_FIELD_SOURCES_KEY, next ? '1' : '0')
    } catch {
      // Ignore quota / private mode failures; UI still updates via event below if set failed mid-way.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return { enabled, setEnabled }
}
