import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/apiBase'

const IMAGE_LOOKUP_VERSION = 'v21';
const CACHE_KEY = `smirkpocasi:place-image:${IMAGE_LOOKUP_VERSION}`;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function cacheKey(location) {
  if (location?.lat == null || location?.lon == null) return null;
  const title = String(location.name || '')
    .split(',')[0]
    .trim()
    .toLocaleLowerCase('cs-CZ');
  return `${Number(location.lat).toFixed(3)},${Number(location.lon).toFixed(3)}:${title}`;
}

function readCache(key) {
  if (typeof window === 'undefined') return undefined
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    const item = cached?.[key]
    if (!item || Date.now() - item.updatedAt > CACHE_TTL) return undefined
    return item.data
  } catch {
    return undefined
  }
}

function writeCache(key, data) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cached, [key]: { data, updatedAt: Date.now() } }));
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

function cleanupOldImageCaches() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('smirkpocasi:place-image:') && key !== CACHE_KEY)
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Cache cleanup is best-effort; a blocked storage should not break weather data.
  }
}

export function usePlaceImage(location) {
  const key = cacheKey(location)
  // Always start empty so SSR and the first client paint match.
  const [data, setData] = useState(null)

  useEffect(() => {
    cleanupOldImageCaches()

    if (!key || location?.lat == null || location?.lon == null) {
      setData(null)
      return undefined
    }

    const cached = readCache(key)
    if (cached !== undefined) {
      setData(cached)
      return undefined
    }

    const controller = new AbortController()
    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      name: location.fullName || location.name || '',
      version: IMAGE_LOOKUP_VERSION,
    })

    fetch(apiUrl(`/api/place-image?${params}`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Obrázek místa se nepodařilo načíst.')
        return response.json()
      })
      .then((image) => {
        const next = image?.imageUrl ? image : null
        writeCache(key, next)
        setData(next)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setData(null)
      })

    return () => controller.abort()
  }, [key, location?.lat, location?.lon, location?.fullName, location?.name])

  return data
}
