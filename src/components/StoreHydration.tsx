import { useEffect } from 'react'
import { useWeatherStore } from '@/store/weatherStore'

/** Hydrate Zustand from localStorage after mount (SSR-safe). */
export function StoreHydration() {
  const hydrateFromStorage = useWeatherStore((s) => s.hydrateFromStorage)

  useEffect(() => {
    hydrateFromStorage()
  }, [hydrateFromStorage])

  return null
}
