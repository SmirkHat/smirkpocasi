import { useState } from 'react'
import { apiUrl } from '@/lib/apiBase'
import { DEFAULT_LOCATION, useWeatherStore, type WeatherLocation } from '../store/weatherStore'

type DetectedLocation = WeatherLocation & {
  country?: string
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
 * GPS (may prompt) → edge/IP geo → Praha.
 * Always resolves to a usable location.
 */
export async function resolveLocationCascade(): Promise<{
  location: DetectedLocation
  source: string
}> {
  const permission = await queryGeolocationPermission()

  if (permission !== 'denied' && typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      let position: GeolocationPosition
      try {
        position = await readGeolocation()
      } catch (firstError) {
        if (permissionDenied(firstError as GeolocationPositionError)) throw firstError
        position = await readGeolocationPrecise()
      }

      return {
        location: {
          name: 'Moje poloha',
          lat: Number(position.coords.latitude.toFixed(5)),
          lon: Number(position.coords.longitude.toFixed(5)),
          source: 'gps',
          accuracy: 'gps',
        },
        source: 'gps',
      }
    } catch {
      // Denied or unavailable — fall through to IP.
    }
  }

  try {
    const ipLocation = await fetchIpLocation()
    return {
      location: {
        name: ipLocation.name,
        lat: ipLocation.lat,
        lon: ipLocation.lon,
        ...(ipLocation.label ? { label: ipLocation.label } : {}),
        ...(ipLocation.source ? { source: ipLocation.source } : { source: 'ip' }),
      },
      source: ipLocation.source || 'ip',
    }
  } catch {
    return {
      location: { ...DEFAULT_LOCATION },
      source: 'default',
    }
  }
}

/**
 * Resolve current place: browser GPS (asks for permission) → edge/IP geo → Praha.
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
    const result = await resolveLocationCascade()

    setLocation(result.location)
    if (result.source === 'gps') addFavorite(result.location)
    setGpsSource(result.source)

    if (result.source === 'default') {
      setGpsError(
        permission === 'denied'
          ? 'Přístup k poloze byl odepřen a odhad z IP taky selhal — zůstává Praha. Povol polohu, nebo vyber město ručně.'
          : 'Polohu se nepodařilo zjistit — zůstává Praha. Vyber město ručně, nebo zkus znovu.',
      )
    } else if (result.source !== 'gps') {
      setGpsNotice(
        permission === 'denied'
          ? 'GPS byla odepřena — použita přibližná poloha podle sítě (IP).'
          : 'GPS není dostupná — použita přibližná poloha podle sítě (IP).',
      )
    }

    setLoadingGps(false)
    onSuccess?.()
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
