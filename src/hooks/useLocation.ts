import { useState } from 'react'
import { apiUrl } from '@/lib/apiBase'
import { useWeatherStore } from '../store/weatherStore'

type DetectedLocation = {
  name: string
  lat: number
  lon: number
  label?: string
  country?: string
  source?: string
  accuracy?: string
}

function permissionDenied(error: GeolocationPositionError | null | undefined) {
  return error?.code === error?.PERMISSION_DENIED || error?.code === 1
}

function readGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Geolocation unavailable'), { code: 0 }))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 5 * 60 * 1000,
    })
  })
}

function readGeolocationPrecise(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60 * 1000,
    })
  })
}

async function queryGeolocationPermission() {
  try {
    if (!navigator.permissions?.query) return null
    // Some browsers reject this name; ignore and continue.
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return null
  }
}

async function fetchIpLocation(signal?: AbortSignal): Promise<DetectedLocation> {
  const response = await fetch(apiUrl('/api/geo'), { signal })
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(
      response.ok
        ? 'Geo endpoint nevrátil JSON.'
        : `Geo endpoint není dostupný (${response.status}).`,
    )
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || 'Polohu z IP se nepodařilo zjistit.')
  }
  if (payload?.lat == null || payload?.lon == null) {
    throw new Error('Polohu z IP se nepodařilo zjistit.')
  }
  return payload
}

/**
 * Resolve current place: browser GPS (asks for permission) → edge/IP geo fallback.
 */
export function useLocation() {
  const location = useWeatherStore((state) => state.location)
  const setLocation = useWeatherStore((state) => state.setLocation)
  const addFavorite = useWeatherStore((state) => state.addFavorite)
  const [loadingGps, setLoadingGps] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsNotice, setGpsNotice] = useState<string | null>(null)
  const [gpsSource, setGpsSource] = useState<string | null>(null)

  async function detectLocation(onSuccess?: () => void) {
    setLoadingGps(true)
    setGpsError(null)
    setGpsNotice(null)
    setGpsSource(null)

    const permission = await queryGeolocationPermission()

    if (permission !== 'denied' && navigator.geolocation) {
      try {
        let position: GeolocationPosition
        try {
          position = await readGeolocation()
        } catch (firstError) {
          if (permissionDenied(firstError as GeolocationPositionError)) throw firstError
          // Coarse failed (timeout / unavailable) — try precise GPS once.
          position = await readGeolocationPrecise()
        }

        const gpsLocation: DetectedLocation = {
          name: 'Moje poloha',
          lat: Number(position.coords.latitude.toFixed(5)),
          lon: Number(position.coords.longitude.toFixed(5)),
          source: 'gps',
          accuracy: 'gps',
        }
        setLocation(gpsLocation)
        addFavorite(gpsLocation)
        setGpsSource('gps')
        setLoadingGps(false)
        onSuccess?.()
        return
      } catch (error) {
        const geoError = error as GeolocationPositionError
        if (permissionDenied(geoError)) {
          // Fall through to IP — user denied GPS; still try approximate location.
        }
        // Otherwise fall through to IP as well.
      }
    }

    try {
      const ipLocation = await fetchIpLocation()
      setLocation({
        name: ipLocation.name,
        lat: ipLocation.lat,
        lon: ipLocation.lon,
        ...(ipLocation.label ? { label: ipLocation.label } : {}),
        ...(ipLocation.source ? { source: ipLocation.source } : {}),
      })
      setGpsSource(ipLocation.source || 'ip')
      setGpsNotice(
        permission === 'denied'
          ? 'GPS byla odepřena — použita přibližná poloha podle sítě (IP).'
          : 'GPS není dostupná — použita přibližná poloha podle sítě (IP).',
      )
      setLoadingGps(false)
      onSuccess?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Poloha se nepodařila zjistit.'
      if (permission === 'denied') {
        setGpsError(
          'Přístup k poloze byl odepřen a odhad z IP taky selhal. Povol polohu v prohlížeči, nebo vyber město ručně.',
        )
      } else {
        setGpsError(message)
      }
      setLoadingGps(false)
    }
  }

  /** @deprecated Prefer detectLocation — kept for existing call sites. */
  function useGps(onSuccess?: () => void) {
    void detectLocation(onSuccess)
  }

  return {
    location,
    setLocation,
    useGps,
    detectLocation,
    loadingGps,
    gpsError,
    gpsNotice,
    gpsSource,
  }
}
