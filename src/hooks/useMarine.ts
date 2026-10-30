import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/apiBase'

const CACHE_KEY = 'smirkpocasi:last-marine-v3'
const FRESH_MS = 10 * 60 * 1000
const OFFLINE_MAX_AGE_MS = 12 * 60 * 60 * 1000

type MarineState = { key: string | null; data: any; loading: boolean; error: string | null }

function requestKey(limit, lat, lon) {
  return `${limit}|${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`
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

export function useMarine(location: any = null, limit = 16) {
  const lat = location?.lat
  const lon = location?.lon
  const key = Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && lat != null && lon != null
    ? requestKey(limit, lat, lon)
    : null
  // Always start empty so SSR and the first client paint match.
  const [state, setState] = useState<MarineState>({ key: null, data: null, loading: true, error: null })

  useEffect(() => {
    if (!key) return undefined

    const controller = new AbortController()
    const cached = readCache(key, FRESH_MS)
    setState({ key, data: cached, loading: !cached, error: null })

    const params = new URLSearchParams({ limit: String(limit), lat: String(lat), lon: String(lon) })

    fetch(apiUrl(`/api/marine?${params}`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Teplotu moře se nepodařilo načíst.')
        return response.json()
      })
      .then((payload) => {
        const next = { ...payload, updatedAt: new Date().toISOString() }
        writeCache(key, next)
        setState({ key, data: next, loading: false, error: null })
      })
      .catch((fetchError) => {
        if (fetchError.name === 'AbortError') return
        setState({ key, data: readCache(key, OFFLINE_MAX_AGE_MS), loading: false, error: fetchError.message })
      })

    return () => controller.abort()
  }, [key, lat, lon, limit])

  // Spots from the previous place are dropped while rendering, before the effect above runs.
  const { data, loading, error } = state.key === key ? state : { data: null, loading: true, error: null }

  return { data, loading, error, offline: Boolean(error && data) }
}
