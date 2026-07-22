/* SmirkPočasí static service worker.
 * Always present at /sw.js so installability crawlers (PWABuilder) can find it.
 * Production builds overwrite this file with a Workbox SW that adds asset precaching
 * (see scripts/finalize-pwa.mjs) — same URL, same registration. */

const API_CACHE = 'smirkpocasi-api'
const TILE_CACHE = 'smirkpocasi-map-tiles'
const API_MAX_ENTRIES = 60
const API_MAX_AGE_MS = 1000 * 60 * 60 * 12
const TILE_MAX_ENTRIES = 400
const TILE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7
const NETWORK_TIMEOUT_MS = 6000

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (url.pathname === '/api/geo') {
    return
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE, API_MAX_ENTRIES, API_MAX_AGE_MS))
    return
  }

  if (
    url.hostname === 'tile.openstreetmap.org' ||
    url.hostname === 'tilecache.rainviewer.com'
  ) {
    event.respondWith(cacheFirst(request, TILE_CACHE, TILE_MAX_ENTRIES, TILE_MAX_AGE_MS))
  }
})

async function networkFirst(request, cacheName, maxEntries, maxAgeMs) {
  const cache = await caches.open(cacheName)
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)
      }),
    ])
    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone())
      await trimCache(cache, maxEntries, maxAgeMs)
    }
    return fresh
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    throw new Error('offline')
  }
}

async function cacheFirst(request, cacheName, maxEntries, maxAgeMs) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const fresh = await fetch(request)
  if (fresh.ok) {
    await cache.put(request, fresh.clone())
    await trimCache(cache, maxEntries, maxAgeMs)
  }
  return fresh
}

async function trimCache(cache, maxEntries, maxAgeMs) {
  const keys = await cache.keys()
  const now = Date.now()

  for (const key of keys) {
    const response = await cache.match(key)
    if (!response) continue
    const dateHeader = response.headers.get('date')
    const storedAt = dateHeader ? Date.parse(dateHeader) : NaN
    if (Number.isFinite(storedAt) && now - storedAt > maxAgeMs) {
      await cache.delete(key)
    }
  }

  const remaining = await cache.keys()
  const overflow = remaining.length - maxEntries
  for (let i = 0; i < overflow; i += 1) {
    await cache.delete(remaining[i])
  }
}
