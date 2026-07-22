import { useEffect } from 'react'
import { resolveLocationCascade } from '@/hooks/useLocation'
import {
  LOCATION_BOOTSTRAP_KEY,
  LOCATION_KEY,
  useWeatherStore,
} from '@/store/weatherStore'

/**
 * Hydrate Zustand from localStorage after mount (SSR-safe).
 * On the very first visit, ask for GPS immediately, then IP/header, else Praha —
 * before marking the store hydrated so weather waits for the real place.
 */
export function StoreHydration() {
  const hydrateFromStorage = useWeatherStore((s) => s.hydrateFromStorage)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const alreadyBootstrapped = Boolean(localStorage.getItem(LOCATION_BOOTSTRAP_KEY))
        const hasSavedLocation = Boolean(localStorage.getItem(LOCATION_KEY))

        if (!alreadyBootstrapped && !hasSavedLocation) {
          // First launch: prompt for location ASAP, then apply cascade result.
          const { location, source } = await resolveLocationCascade()
          if (cancelled) return
          const store = useWeatherStore.getState()
          store.setLocation(location)
          if (source === 'gps') store.addFavorite(location)
          localStorage.setItem(LOCATION_BOOTSTRAP_KEY, '1')
        } else if (!alreadyBootstrapped) {
          // Returning user from before this flag existed — don't re-prompt.
          localStorage.setItem(LOCATION_BOOTSTRAP_KEY, '1')
        }
      } catch {
        // Storage / cascade failures must not block the app.
        try {
          localStorage.setItem(LOCATION_BOOTSTRAP_KEY, '1')
        } catch {
          // ignore
        }
      }

      if (!cancelled) hydrateFromStorage()
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [hydrateFromStorage])

  return null
}
