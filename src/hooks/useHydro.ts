import { useEffect, useRef, useState } from 'react'
import { CHMI_MAX_STATION_KM, locationInHydroCoverage } from '../utils/geo'
import { apiUrl } from '@/lib/apiBase'

const CACHE_KEY = 'smirkpocasi:last-hydro-v7'

function readCache() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY))
  } catch {
    return null
  }
}

export function useHydro(limit = 20, location = null, query = '') {
  const lat = location?.lat
  const lon = location?.lon
  const inCoverage = locationInHydroCoverage({ lat, lon })
  // Always start empty so SSR and the first client paint match.
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(inCoverage))
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!locationInHydroCoverage({ lat, lon })) {
      setData(null)
      setLoading(false)
      setError(null)
      return undefined
    }

    const cached = !query ? readCache() : null
    if (cached) {
      setData(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    const controller = new AbortController()

    const fetchData = () => {
      setLoading(true)
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
          if (!query) localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
          setData(payload)
          setError(null)
        })
        .catch((fetchError) => {
          if (fetchError.name !== 'AbortError') setError(fetchError.message)
        })
        .finally(() => setLoading(false))
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(fetchData, query ? 300 : 0)

    return () => {
      controller.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [limit, query, lat, lon])

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
    available: inCoverage,
  }
}
