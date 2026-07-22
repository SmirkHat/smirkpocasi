import { create } from 'zustand'

export type WeatherLocation = {
  name: string
  lat: number
  lon: number
  label?: string
  source?: string
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
  hydrateFromStorage: () => void
  setLocation: (location: WeatherLocation) => void
  addFavorite: (location: WeatherLocation) => void
  removeFavorite: (location: WeatherLocation) => void
  setWeather: (weather: unknown, coords?: { lat: number; lon: number }) => void
}

const FAVORITES_KEY = 'smirkpocasi:favorites'
export const LOCATION_KEY = 'smirkpocasi:selected-location'
const WEATHER_CACHE_KEY = 'smirkpocasi:last-weather'
/** Set after first-launch GPS → IP → Praha cascade (or when a saved location already exists). */
export const LOCATION_BOOTSTRAP_KEY = 'smirkpocasi:location-bootstrapped'

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
  localStorage.setItem(key, JSON.stringify(value))
}

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  location: defaultLocation,
  favorites: [defaultLocation],
  weather: null,
  weatherUpdatedAt: null,
  hydrated: false,
  hydrateFromStorage() {
    if (get().hydrated || !canUseStorage()) return
    const weather = readJson<WeatherCachePayload | null>(WEATHER_CACHE_KEY, null)
    set({
      location: readJson(LOCATION_KEY, defaultLocation),
      favorites: readJson(FAVORITES_KEY, [defaultLocation]),
      weather,
      weatherUpdatedAt: weather?.updatedAt || null,
      hydrated: true,
    })
  },
  setLocation(location) {
    writeJson(LOCATION_KEY, location)
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
