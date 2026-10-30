import { useEffect, useRef, useState } from 'react'
import { CHMI_MAX_STATION_KM, locationInHydroCoverage } from '../utils/geo'
import { apiUrl } from '@/lib/apiBase'

const CACHE_KEY = 'smirkpocasi:last-hydro-v8'
const FRESH_MS = 10 * 60 * 1000
const OFFLINE_MAX_AGE_MS = 12 * 60 * 60 * 1000

type HydroState = { key: string | null; data: any; loading: boolean; error: string | null }

const EMPTY_STATE: HydroState = { key: null, data: null, loading: false, error: null }

function requestKey(limit, lat, lon, query) {
  return `${limit}|${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}|${query}`
}

function readCache(key, maxAgeMs) {
  if (typeof window === 'undefined') return null
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) as string)
    if (cached?.key !== key) return null
    return Date.now() - Date.parse(cached.payload?.updatedAt) < maxAgeMs ? cached.payload : null
  } catch {
    return null
  }
}

function writeCache(key, payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, payload }))
  } catch {
    localStorage.removeItem(CACHE_KEY)
  }
}

export function useHydro(limit = 20, location: any = null, query = '') {
  const lat = location?.lat
  const lon = location?.lon
  const inCoverage = locationInHydroCoverage({ lat, lon })
  const key = inCoverage ? requestKey(limit, lat, lon, query) : null
  // Always start empty so SSR and the first client paint match.
  const [state, setState] = useState<HydroState>(EMPTY_STATE)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!key) return undefined

    const cached = !query ? readCache(key, FRESH_MS) : null
    setState({ key, data: cached, loading: true, error: null })

    const controller = new AbortController()

    const fetchData = () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (query) params.set('q', query)
      if (lat !== undefined && lon !== undefined) {
        params.set('lat', String(lat))
        params.set('lon', String(lon))
      }

      fetch(apiUrl(`/api/hydro?${params}`), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error('Hydrologická data se nepodařilo načíst.')
          return response.json()
        })
        .then((hydro) => {
          const payload = { ...hydro, updatedAt: new Date().toISOString() }
          if (!query) writeCache(key, payload)
          setState({ key, data: payload, loading: false, error: null })
        })
        .catch((fetchError) => {
          if (fetchError.name === 'AbortError') return
          setState({
            key,
            data: !query ? readCache(key, OFFLINE_MAX_AGE_MS) : null,
            loading: false,
            error: fetchError.message,
          })
        })
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(fetchData, query ? 300 : 0)

    return () => {
      controller.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [key, limit, query, lat, lon])

  // Stations from the previous place are dropped while rendering, before the effect above runs.
  const { data, loading, error } =
    state.key === key ? state : { ...EMPTY_STATE, loading: key != null || location == null }

  const sortedProfiles = (data?.profiles || [])
    .map((p) => ({
      ...p,
      distance: p._dist !== undefined && p._dist !== Infinity ? Math.round(p._dist) : undefined,
    }))
    .filter((p) => p.distance == null || p.distance <= CHMI_MAX_STATION_KM)

  return {
    data: data
      ? {
          ...data,
          profiles: sortedProfiles,
          total: sortedProfiles.length,
          mapStations: Array.isArray(data.mapStations) ? data.mapStations : [],
        }
      : data,
    loading,
    error,
    offline: Boolean(error && data),
    // Until the place is known, assume rivers rather than flashing the seaside layout.
    available: inCoverage || location == null,
  }
}
