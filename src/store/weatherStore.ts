import { create } from 'zustand'

export type WeatherLocation = {
  name: string
  lat: number
  lon: number
  label?: string
  fullName?: string
  source?: string
  accuracyMeters?: number
  /** The real name is still being looked up from the coordinates. Never persisted. */
  pendingName?: boolean
}

type WeatherCachePayload = {
  data: unknown
  updatedAt: string
  lat?: number
  lon?: number
}

type WeatherStore = {
  location: WeatherLocation
  favorites: WeatherLocation[]
  weather: WeatherCachePayload | null
  weatherUpdatedAt: string | null
  hydrated: boolean
  /** Waiting for GPS to answer; a better position may still replace the current one. */
  locating: boolean
  setLocating: (locating: boolean) => void
  hydrateFromStorage: () => void
  setLocation: (location: WeatherLocation) => void
  addFavorite: (location: WeatherLocation) => void
  removeFavorite: (location: WeatherLocation) => void
  setWeather: (weather: unknown, coords?: { lat: number; lon: number }) => void
}

const FAVORITES_KEY = 'smirkpocasi:favorites'
export const LOCATION_KEY = 'smirkpocasi:selected-location'
const WEATHER_CACHE_KEY = 'smirkpocasi:last-weather'

export const DEFAULT_LOCATION: WeatherLocation = {
  name: 'Praha',
  lat: 50.0755,
  lon: 14.4378,
  source: 'default',
}

const defaultLocation = DEFAULT_LOCATION

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Full or blocked storage only costs persistence; the app keeps working from memory.
  }
}

function readSavedLocation() {
  const saved = readJson<WeatherLocation | null>(LOCATION_KEY, null)
  return Number.isFinite(saved?.lat) && Number.isFinite(saved?.lon) && saved?.name ? saved : null
}

export function hasSavedLocation() {
  return readSavedLocation() != null
}

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  location: defaultLocation,
  favorites: [defaultLocation],
  weather: null,
  weatherUpdatedAt: null,
  hydrated: false,
  locating: false,
  setLocating(locating) {
    set({ locating })
  },
  hydrateFromStorage() {
    if (get().hydrated || !canUseStorage()) return
    const weather = readJson<WeatherCachePayload | null>(WEATHER_CACHE_KEY, null)
    const current = get().location
    set({
      // First launch hydrates right after detection published, with state storage cannot hold.
      location: current === defaultLocation ? (readSavedLocation() ?? current) : current,
      favorites: readJson(FAVORITES_KEY, [defaultLocation]),
      weather,
      weatherUpdatedAt: weather?.updatedAt || null,
      hydrated: true,
    })
  },
  setLocation(location) {
    writeJson(LOCATION_KEY, { ...location, pendingName: undefined })
    set({ location })
  },
  addFavorite(location) {
    const exists = get().favorites.some(
      (item) =>
        item.name === location.name ||
        (item.lat === location.lat && item.lon === location.lon),
    )
    if (exists) return

    const favorites = [location, ...get().favorites].slice(0, 10)
    writeJson(FAVORITES_KEY, favorites)
    set({ favorites })
  },
  removeFavorite(location) {
    const favorites = get().favorites.filter((item) => item.name !== location.name)
    writeJson(FAVORITES_KEY, favorites)
    set({ favorites })
  },
  setWeather(weather, coords) {
    const payload: WeatherCachePayload = {
      data: weather,
      updatedAt: new Date().toISOString(),
      ...(coords?.lat != null && coords?.lon != null
        ? { lat: coords.lat, lon: coords.lon }
        : {}),
    }
    writeJson(WEATHER_CACHE_KEY, payload)
    set({ weather: payload, weatherUpdatedAt: payload.updatedAt })
  },
}))
