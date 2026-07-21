import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/apiBase'

const CACHE_KEY = 'smirkpocasi:last-marine-v2'

function readCache() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY))
  } catch {
    return null
  }
}

export function useMarine(location = null, limit = 16) {
  const lat = location?.lat
  const lon = location?.lon
  // Always start empty so SSR and the first client paint match.
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const cached = readCache()
    if (cached) {
      setData(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    const params = new URLSearchParams({ limit: String(limit) })
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
      params.set('lat', String(lat))
      params.set('lon', String(lon))
    }

    fetch(apiUrl(`/api/marine?${params}`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Teplotu moře se nepodařilo načíst.')
        return response.json()
      })
      .then((payload) => {
        const next = { ...payload, updatedAt: new Date().toISOString() }
        localStorage.setItem(CACHE_KEY, JSON.stringify(next))
        setData(next)
        setError(null)
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [lat, lon, limit])

  return { data, loading, error, offline: Boolean(error && data) }
}
