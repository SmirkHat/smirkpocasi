import { useState } from 'react'
import { apiUrl } from '@/lib/apiBase'
import { useWeatherStore, type WeatherLocation } from '../store/weatherStore'
import {
  GPS_PLACEHOLDER_NAME,
  canKeepPlaceName,
  decidePublish,
  guessWeakLocation,
  isPreciseLocation,
  locationRank,
} from '../utils/locationPolicy'

const FAST_FIX: PositionOptions = { enableHighAccuracy: false, timeout: 4000, maximumAge: 10 * 60 * 1000 }
const PRECISE_FIX: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
const PRECISE_WATCH_MS = 15000
const GOOD_ACCURACY_M = 50
const GPS_HEAD_START_MS = 1200
const IP_TIMEOUT_MS = 2500
const REVERSE_TIMEOUT_MS = 2500
const PERMISSION_DENIED = 1

type DetectionOptions = {
  /** May show the browser's permission prompt. */
  prompt?: boolean
  /** The user asked for it: the first result replaces even a place picked by hand. */
  force?: boolean
  addToFavorites?: boolean
  onFirstPublish?: () => void
}

type Detection = {
  options: DetectionOptions
  stopped: boolean
  forceNext: boolean
  announced: boolean
  /** Coordinates this run last saw; anything else in the store means the user picked a place. */
  coords: { lat: number; lon: number }
  cleanups: Array<() => void>
}

export type DetectionOutcome = {
  source: string
  permission: PermissionState | null
}

let activeDetection: Detection | null = null

function store() {
  return useWeatherStore.getState()
}

// AbortSignal.timeout is missing on the older iOS versions this PWA still runs on.
function timeoutSignal(ms: number) {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
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

function readFastPosition(): Promise<GeolocationPosition | GeolocationPositionError> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, resolve, FAST_FIX)
  })
}

function locationFromGeoPayload(payload: {
  name?: string
  lat?: number
  lon?: number
  label?: string
  source?: string
}): WeatherLocation {
  if (payload?.lat == null || payload?.lon == null) throw new Error('Geo payload bez souřadnic')
  return {
    name: payload.name || 'Přibližná poloha',
    lat: payload.lat,
    lon: payload.lon,
    ...(payload.label ? { label: payload.label } : {}),
    source: payload.source || 'ip',
  }
}

/** Browser → geojs sees the visitor IP. The API host must not call the bare geojs URL (that is Frankfurt). */
async function fetchBrowserGeoJs(): Promise<WeatherLocation> {
  const response = await fetch('https://get.geojs.io/v1/ip/geo.json', {
    headers: { Accept: 'application/json' },
    signal: timeoutSignal(IP_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`geojs ${response.status}`)
  const data = await response.json()
  const lat = Number(data.latitude)
  const lon = Number(data.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('geojs bez souřadnic')
  const city = String(data.city || '').trim()
  const region = String(data.region || '').trim()
  const country = String(data.country || data.country_code || '').trim()
  const label = [region, country].filter(Boolean).join(' · ')
  return {
    name: city || 'Přibližná poloha',
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    ...(label ? { label } : {}),
    source: 'geojs',
  }
}

async function fetchIpLocation(): Promise<WeatherLocation> {
  let weak: WeatherLocation | null = null

  try {
    const response = await fetch(apiUrl('/api/geo'), { signal: timeoutSignal(IP_TIMEOUT_MS) })
    if (response.ok) {
      const payload = await response.json()
      const location = locationFromGeoPayload(payload)
      // City from the visitor IP (or edge) is done. Country-capital is only a last resort.
      if (payload.accuracy === 'ip') return location
      weak = location
    }
  } catch {
    // Try the browser next.
  }

  try {
    return await fetchBrowserGeoJs()
  } catch {
    if (weak) return weak
    throw new Error('Geo endpoint nedostupný')
  }
}

async function fetchPlaceName(lat: number, lon: number): Promise<{ name: string; label?: string } | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  const response = await fetch(apiUrl(`/api/geocode?${params}`), { signal: timeoutSignal(REVERSE_TIMEOUT_MS) })
  if (!response.ok) return null
  const place = await response.json()
  return place?.name ? place : null
}

async function nameCurrentLocation(addToFavorites: boolean | undefined) {
  const { lat, lon } = store().location
  const place = await fetchPlaceName(lat, lon).catch(() => null)
  const { location, setLocation, addFavorite } = store()
  if (location.lat !== lat || location.lon !== lon) return

  const named: WeatherLocation = {
    ...location,
    ...(place ? { name: place.name, label: place.label } : {}),
    pendingName: false,
  }
  setLocation(named)
  if (addToFavorites) addFavorite(named)
}

function announceFirstPublish(detection: Detection) {
  if (detection.announced) return
  detection.announced = true
  detection.options.onFirstPublish?.()
}

export function stopLocationDetection() {
  if (!activeDetection) return
  activeDetection.stopped = true
  activeDetection.cleanups.forEach((cleanup) => cleanup())
  activeDetection = null
  store().setLocating(false)
}

function finishDetection(detection: Detection) {
  if (activeDetection === detection) stopLocationDetection()
}

function userPickedPlace(detection: Detection) {
  const { lat, lon } = store().location
  return lat !== detection.coords.lat || lon !== detection.coords.lon
}

/** Returns true when the store's coordinates changed. */
function publishFix(detection: Detection, fix: WeatherLocation) {
  if (detection.stopped) return false
  if (userPickedPlace(detection)) {
    announceFirstPublish(detection)
    finishDetection(detection)
    return false
  }

  const { location, setLocation } = store()
  const decision = detection.forceNext ? 'move' : decidePublish(location, fix)
  if (decision === 'ignore') return false

  detection.forceNext = false
  const next =
    decision === 'move'
      ? fix
      : { ...location, source: fix.source, accuracyMeters: fix.accuracyMeters }
  detection.coords = { lat: next.lat, lon: next.lon }
  setLocation(next)
  announceFirstPublish(detection)
  return decision === 'move'
}

function publishGpsPosition(detection: Detection, position: GeolocationPosition) {
  const { location } = store()
  const coords = {
    lat: Number(position.coords.latitude.toFixed(5)),
    lon: Number(position.coords.longitude.toFixed(5)),
  }
  const keepName = canKeepPlaceName(location, coords)
  const moved = publishFix(detection, {
    ...coords,
    name: keepName ? location.name : GPS_PLACEHOLDER_NAME,
    ...(keepName && location.label ? { label: location.label } : {}),
    source: 'gps',
    accuracyMeters: Math.round(position.coords.accuracy),
    pendingName: true,
  })
  if (moved) void nameCurrentLocation(detection.options.addToFavorites)
}

function watchPreciseFix(detection: Detection): Promise<void> {
  return new Promise((resolve) => {
    let watchId: number | null = null
    const stop = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      watchId = null
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(stop, PRECISE_WATCH_MS)
    detection.cleanups.push(stop)
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        publishGpsPosition(detection, position)
        if (position.coords.accuracy <= GOOD_ACCURACY_M) stop()
      },
      stop,
      PRECISE_FIX,
    )
  })
}

/** Network estimate, then time zone. Returns the source that ended up describing the place, if any. */
async function applyEstimate(detection: Detection): Promise<string | null> {
  if (detection.stopped) return null
  if (isPreciseLocation(store().location) && !detection.forceNext) return null

  const ipLocation = await fetchIpLocation().catch(() => null)
  if (ipLocation) {
    publishFix(detection, ipLocation)
    announceFirstPublish(detection)
    return ipLocation.source ?? null
  }

  // Replacing a place the user chose with a capital would be worse than saying it failed.
  if (!detection.options.force && locationRank(store().location) === 0) {
    const guess = guessWeakLocation(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      typeof navigator !== 'undefined' ? navigator.language : undefined,
    )
    if (guess) {
      publishFix(detection, guess)
      announceFirstPublish(detection)
      return guess.source ?? null
    }
  }
  announceFirstPublish(detection)
  return null
}

function canUseGps(detection: Detection, permission: PermissionState | null) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false
  if (permission === 'denied') return false
  return Boolean(detection.options.prompt) || permission === 'granted'
}

async function runDetection(detection: Detection, answer: (outcome: DetectionOutcome) => void) {
  const permission = await queryGeolocationPermission()
  if (detection.stopped) {
    answer({ source: 'none', permission })
    return
  }

  const gpsUsable = canUseGps(detection, permission)
  store().setLocating(gpsUsable)

  let estimate: Promise<string | null> | null = null
  const startEstimate = () => (estimate ??= applyEstimate(detection))

  // A pending prompt can stay unanswered for as long as the user likes, so the page must not wait for it.
  let headStart: ReturnType<typeof setTimeout> | undefined
  if (!detection.options.force) {
    headStart = setTimeout(startEstimate, gpsUsable && permission === 'granted' ? GPS_HEAD_START_MS : 0)
    detection.cleanups.push(() => clearTimeout(headStart))
  }

  const fast = gpsUsable ? await readFastPosition() : null
  const position = fast && 'coords' in fast ? fast : null
  const denied = fast != null && 'code' in fast && fast.code === PERMISSION_DENIED

  if (position) {
    clearTimeout(headStart)
    publishGpsPosition(detection, position)
    answer({ source: 'gps', permission })
  } else {
    const source = await startEstimate()
    answer({ source: source ?? 'none', permission: denied ? 'denied' : permission })
  }

  if (gpsUsable && !denied && !detection.stopped) await watchPreciseFix(detection)
  finishDetection(detection)
}

/**
 * Network estimate and GPS run side by side; better information replaces worse, never the other way.
 * Resolves as soon as the caller has an answer, while GPS keeps refining in the background.
 */
export function startLocationDetection(options: DetectionOptions = {}): Promise<DetectionOutcome> {
  stopLocationDetection()
  const { location } = store()
  const detection: Detection = {
    options,
    stopped: false,
    forceNext: Boolean(options.force),
    announced: false,
    coords: { lat: location.lat, lon: location.lon },
    cleanups: [],
  }
  activeDetection = detection

  // Saved by a version that did not look up place names, or the lookup failed last time.
  if (location.source === 'gps' && location.name === GPS_PLACEHOLDER_NAME) {
    void nameCurrentLocation(false)
  }

  return new Promise((resolve) => {
    void runDetection(detection, resolve)
  })
}

export function isDetectingLocation() {
  return activeDetection != null
}

function failureMessage(permission: PermissionState | null) {
  return permission === 'denied'
    ? 'Přístup k poloze je odepřený a odhad podle sítě taky selhal. Povol polohu v prohlížeči, nebo vyber město ručně.'
    : 'Polohu se nepodařilo zjistit. Vyber město ručně, nebo zkus znovu.'
}

function estimateNotice(permission: PermissionState | null) {
  return permission === 'denied'
    ? 'GPS je odepřená, používám přibližnou polohu podle sítě.'
    : 'GPS zatím neodpověděla, používám přibližnou polohu podle sítě.'
}

/** The "Moje poloha" button: asks for GPS and reports what happened. */
export function useLocation() {
  const location = useWeatherStore((state) => state.location)
  const setLocation = useWeatherStore((state) => state.setLocation)
  const [loadingGps, setLoadingGps] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsNotice, setGpsNotice] = useState<string | null>(null)
  const [gpsSource, setGpsSource] = useState<string | null>(null)

  function clearGpsMessages() {
    setGpsError(null)
    setGpsNotice(null)
  }

  async function detectLocation(onSuccess?: () => void) {
    setLoadingGps(true)
    clearGpsMessages()
    setGpsSource(null)

    const { source, permission } = await startLocationDetection({
      prompt: true,
      force: true,
      addToFavorites: true,
    })

    setGpsSource(source)
    setLoadingGps(false)
    if (source === 'gps') onSuccess?.()
    else if (source === 'none') setGpsError(failureMessage(permission))
    else setGpsNotice(estimateNotice(permission))
  }

  return {
    location,
    setLocation,
    detectLocation,
    clearGpsMessages,
    loadingGps,
    gpsError,
    gpsNotice,
    gpsSource,
  }
}
