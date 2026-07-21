import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/apiBase'
import { pendingSources } from '../utils/consensusCore'

const CACHE_KEY = 'smirkpocasi:last-home:v1'

function readCache() {
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

/**
 * Single home request: weather + warnings + AQI + full consensus.
 * Server fans out upstreams in-process and caches aggressively.
 */
export function useHomeBundle(location) {
  const initial = readCache()
  const relevant = cacheMatches(initial, location)
  const [bundle, setBundle] = useState(() => (relevant ? initial : null))
  const [loading, setLoading] = useState(() => !relevant)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!location?.lat || !location?.lon) return undefined

    const controller = new AbortController()
    const cached = readCache()
    if (!cacheMatches(cached, location)) {
      setBundle(null)
      setLoading(true)
    }
    setError(null)

    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
    })

    fetch(apiUrl(`/api/home?${params}`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || 'Home data se nepodařilo načíst.')
        }
        return response.json()
      })
      .then((payload) => {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
        } catch {
          localStorage.removeItem(CACHE_KEY)
        }
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

  const consensus = bundle?.consensus || emptyConsensus()

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
  }
}
