import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '@/lib/apiBase'
import { pendingSources } from '../utils/consensusCore'

const CACHE_KEY = 'smirkpocasi:last-home:v1'

function readCache() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY))
  } catch {
    return null
  }
}

function cacheMatches(cached, location) {
  if (!cached?.consensus || !location?.lat || !location?.lon) return false
  if (cached.requestLat == null || cached.requestLon == null) return false
  return cached.requestLat === location.lat && cached.requestLon === location.lon
}

const emptyConsensus = () => ({
  consensus: null,
  sources: pendingSources(),
  divergence: 0,
  confidence: 'low',
  aladin: null,
  yr: null,
  forecastSeries: [],
})

function withClientMeta(payload, response) {
  const receivedAt = new Date().toISOString()
  const serverHttpDate = response?.headers?.get?.('Date') || null
  return {
    ...payload,
    clientMeta: {
      receivedAt,
      serverHttpDate,
      serverUpdatedAt: payload?.updatedAt || serverHttpDate || receivedAt,
    },
  }
}

async function fetchHomeBundle(location, signal) {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lon),
  })
  const response = await fetch(apiUrl(`/api/home?${params}`), { signal })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || 'Home data se nepodařilo načíst.')
  }
  const payload = await response.json()
  return withClientMeta(payload, response)
}

function persistBundle(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    localStorage.removeItem(CACHE_KEY)
  }
}

/**
 * Single home request: weather + warnings + AQI + full consensus.
 * Server fans out upstreams in-process and caches aggressively.
 *
 * localStorage is only read after mount so SSR HTML matches the first client paint.
 */
export function useHomeBundle(location) {
  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const locationRef = useRef(location)
  locationRef.current = location

  useEffect(() => {
    if (!location?.lat || !location?.lon) return undefined

    const controller = new AbortController()
    const cached = readCache()
    if (cacheMatches(cached, location)) {
      setBundle(cached)
      setLoading(false)
    } else {
      setBundle(null)
      setLoading(true)
    }
    setError(null)

    fetchHomeBundle(location, controller.signal)
      .then((payload) => {
        persistBundle(payload)
        setBundle(payload)
        setLoading(false)
      })
      .catch((fetchError) => {
        if (fetchError.name === 'AbortError') return
        setError(fetchError.message)
        if (cacheMatches(cached, location)) setBundle(cached)
        setLoading(false)
      })

    return () => controller.abort()
  }, [location?.lat, location?.lon])

  const refresh = useCallback(async () => {
    const current = locationRef.current
    if (!current?.lat || !current?.lon) return
    setError(null)
    try {
      const payload = await fetchHomeBundle(current)
      persistBundle(payload)
      setBundle(payload)
      setLoading(false)
    } catch (fetchError) {
      setError(fetchError.message)
    }
  }, [])

  const consensus = bundle?.consensus || emptyConsensus()
  const clientMeta = bundle?.clientMeta ?? null

  return {
    loading,
    error,
    offline: Boolean(error && bundle),
    weather: bundle?.weather ?? null,
    weatherUpdatedAt: bundle?.updatedAt ?? null,
    warnings: bundle?.warnings ?? [],
    warningsAttribution: bundle?.warningsAttribution ?? null,
    aqi: bundle?.aqi ?? null,
    consensus: {
      ...consensus,
      loading,
      error,
    },
    updatedAt: bundle?.updatedAt ?? null,
    clientMeta,
    refresh,
  }
}
