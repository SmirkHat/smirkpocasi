import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/lib/apiBase'
import { pendingSources } from '../utils/consensusCore'
import { distanceMeters } from '../utils/locationPolicy'

const CACHE_KEY = 'smirkpocasi:last-home:v2'
const LEGACY_CACHE_KEY = 'smirkpocasi:last-home:v1'
/** Older data is never shown as current: skeleton until fresh numbers arrive. */
const INSTANT_MAX_AGE_MS = 5 * 60 * 1000
const OFFLINE_MAX_AGE_MS = 12 * 60 * 60 * 1000
const SKIP_REVALIDATE_MS = 60 * 1000
const REFRESH_INTERVAL_MS = 5 * 60 * 1000
const PARTIAL_RETRY_MS = 2500
const MAX_RECENT_BUNDLES = 8
/** GPS refining a position by a few hundred metres is still the same place: no skeleton flash. */
const SAME_PLACE_M = 2000

type HomeState = { key: string | null; bundle: any; loading: boolean; error: string | null }

const IDLE_STATE: HomeState = { key: null, bundle: null, loading: true, error: null }
const recentBundles = new Map<string, any>()

function locationKey(location) {
  if (location?.lat == null || location?.lon == null) return null
  return `${Number(location.lat).toFixed(3)},${Number(location.lon).toFixed(3)}`
}

function bundleAge(bundle) {
  const updatedAt = Date.parse(bundle?.updatedAt)
  return Number.isFinite(updatedAt) ? Date.now() - updatedAt : Infinity
}

function readStoredBundle(key) {
  if (typeof window === 'undefined') return null
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) as string)
    return stored?.consensus && locationKey({ lat: stored.requestLat, lon: stored.requestLon }) === key ? stored : null
  } catch {
    return null
  }
}

function readKnownBundle(key, maxAgeMs) {
  const bundle = recentBundles.get(key) ?? readStoredBundle(key)
  return bundle && bundleAge(bundle) < maxAgeMs ? bundle : null
}

function persistBundle(bundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(bundle))
    localStorage.removeItem(LEGACY_CACHE_KEY)
  } catch {
    localStorage.removeItem(CACHE_KEY)
  }
}

function whenIdle(task: () => void) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(task, { timeout: 2000 })
  else setTimeout(task, 200)
}

function rememberBundle(key, bundle) {
  recentBundles.delete(key)
  recentBundles.set(key, bundle)
  if (recentBundles.size > MAX_RECENT_BUNDLES) recentBundles.delete(recentBundles.keys().next().value as string)
  whenIdle(() => persistBundle(bundle))
}

function needsRevalidation(bundle, key) {
  if (!bundle || bundle.partial) return true
  const sameCell = locationKey({ lat: bundle.requestLat, lon: bundle.requestLon }) === key
  return !sameCell || bundleAge(bundle) >= SKIP_REVALIDATE_MS
}

function isSamePlace(bundle, location) {
  if (bundle?.requestLat == null || bundle?.requestLon == null) return false
  if (location?.lat == null || location?.lon == null) return false
  return distanceMeters({ lat: bundle.requestLat, lon: bundle.requestLon }, location) < SAME_PLACE_M
}

const emptyConsensus = () => ({
  consensus: null,
  sources: pendingSources(),
  divergence: 0,
  confidence: 'low',
  aladin: null,
  forecastSeries: [],
  currentRain: null,
  precipitationGroups: null,
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

/** One-shot: the head script's request is only ever valid for the first load after page start. */
function takePrefetchedResponse(url): Promise<Response> | null {
  const prefetched = window.__homePrefetch
  window.__homePrefetch = null
  return prefetched?.url === url ? prefetched.response : null
}

async function requestHome(url, signal) {
  const prefetched = await takePrefetchedResponse(url)?.catch(() => null)
  return prefetched?.ok ? prefetched : fetch(url, { signal })
}

async function fetchHomeBundle(location, signal) {
  const params = new URLSearchParams({
    lat: Number(location.lat).toFixed(3),
    lon: Number(location.lon).toFixed(3),
  })
  const response = await requestHome(apiUrl(`/api/home?${params}`), signal)
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || 'Home data se nepodařilo načíst.')
  }
  const payload = await response.json()
  return withClientMeta(payload, response)
}

/**
 * Single home request: weather + warnings + AQI + full consensus.
 * Requests are strictly latest-wins, and what is on screen always belongs to the current place.
 *
 * localStorage is only read after hydration so SSR HTML matches the first client paint.
 */
export function useHomeBundle(location) {
  const key = locationKey(location)
  const [state, setState] = useState<HomeState>(IDLE_STATE)
  const locationRef = useRef(location)
  locationRef.current = location
  const requestRef = useRef<AbortController | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const instant = useMemo(() => (key ? readKnownBundle(key, INSTANT_MAX_AGE_MS) : null), [key])

  // Derived while rendering, not in an effect: a bundle for another place must not survive one frame.
  const visible: HomeState =
    state.key === key || (state.bundle && isSamePlace(state.bundle, location))
      ? state
      : { key, bundle: instant, loading: !instant, error: null }
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const load = useCallback((target, { retryIfPartial = true } = {}) => {
    const targetKey = locationKey(target)
    if (!targetKey) return Promise.resolve()

    requestRef.current?.abort()
    clearTimeout(retryRef.current)
    const controller = new AbortController()
    requestRef.current = controller

    return fetchHomeBundle(target, controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return
        rememberBundle(targetKey, payload)
        setState({ key: targetKey, bundle: payload, loading: false, error: null })
        if (payload.partial && retryIfPartial) {
          retryRef.current = setTimeout(() => load(locationRef.current, { retryIfPartial: false }), PARTIAL_RETRY_MS)
        }
      })
      .catch((fetchError) => {
        if (controller.signal.aborted || fetchError.name === 'AbortError') return
        setState({
          key: targetKey,
          bundle: readKnownBundle(targetKey, OFFLINE_MAX_AGE_MS),
          loading: false,
          error: fetchError.message,
        })
      })
  }, [])

  useEffect(() => {
    if (!key) return undefined
    setState({ ...visibleRef.current, key })
    if (needsRevalidation(visibleRef.current.bundle, key)) void load(locationRef.current)
    return () => {
      requestRef.current?.abort()
      clearTimeout(retryRef.current)
    }
  }, [key, load])

  useEffect(() => {
    if (!key) return undefined

    const refreshInBackground = () => {
      if (document.visibilityState === 'visible') void load(locationRef.current)
    }
    const interval = setInterval(refreshInBackground, REFRESH_INTERVAL_MS)

    // A phone waking the PWA up hours later must not present yesterday's numbers as "now".
    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      const { bundle, error } = visibleRef.current
      const stale = bundleAge(bundle) >= REFRESH_INTERVAL_MS
      if (!stale && !error) return
      if (stale) setState({ key, bundle: null, loading: true, error: null })
      void load(locationRef.current)
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('online', onResume)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('online', onResume)
    }
  }, [key, load])

  const refresh = useCallback(() => load(locationRef.current), [load])

  const { bundle, loading, error } = visible
  const consensus = useMemo(
    () => ({
      ...(bundle?.consensus || emptyConsensus()),
      currentRain: bundle?.consensus?.currentRain ?? null,
      loading,
      error,
    }),
    [bundle, loading, error],
  )

  return {
    loading,
    error,
    offline: Boolean(error && bundle),
    weather: bundle?.weather ?? null,
    weatherUpdatedAt: bundle?.updatedAt ?? null,
    warnings: bundle?.warnings ?? [],
    warningsAttribution: bundle?.warningsAttribution ?? null,
    aqi: bundle?.aqi ?? null,
    consensus,
    updatedAt: bundle?.updatedAt ?? null,
    clientMeta: bundle?.clientMeta ?? null,
    refresh,
  }
}
