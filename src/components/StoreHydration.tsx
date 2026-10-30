import { useEffect } from 'react'
import {
  isDetectingLocation,
  startLocationDetection,
  stopLocationDetection,
} from '@/hooks/useLocation'
import { hasSavedLocation, useWeatherStore } from '@/store/weatherStore'
import { isAutoLocation } from '@/utils/locationPolicy'

const REDETECT_AFTER_MS = 30 * 60 * 1000

function detectSilently() {
  if (isAutoLocation(useWeatherStore.getState().location)) void startLocationDetection()
}

/**
 * Hydrate Zustand from localStorage after mount (SSR-safe).
 * A saved place loads immediately and is only re-checked in the background.
 * The first visit asks for GPS, but shows weather as soon as any estimate exists.
 */
export function StoreHydration() {
  useEffect(() => {
    const { hydrateFromStorage } = useWeatherStore.getState()
    let lastDetectionAt = Date.now()

    if (hasSavedLocation()) {
      hydrateFromStorage()
      detectSilently()
    } else {
      void startLocationDetection({
        prompt: true,
        addToFavorites: true,
        onFirstPublish: hydrateFromStorage,
      })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || isDetectingLocation()) return
      if (Date.now() - lastDetectionAt < REDETECT_AFTER_MS) return
      lastDetectionAt = Date.now()
      detectSilently()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stopLocationDetection()
    }
  }, [])

  return null
}
