import { normalizeAccuweather } from '../api/normalizers/accuweather'
import { normalizeAladin } from '../api/normalizers/aladin'
import { normalizeAviation } from '../api/normalizers/aviation'
import { normalizeBmkg } from '../api/normalizers/bmkg'
import { normalizeCHMI } from '../api/normalizers/chmi'
import { normalizeFmi } from '../api/normalizers/fmi'
import { normalizeInpocasiStation } from '../api/normalizers/inpocasi'
import { normalizeMeteoam } from '../api/normalizers/meteoam'
import { normalizeMeteosource } from '../api/normalizers/meteosource'
import { normalizeNeighborStation } from '../api/normalizers/neighborStation'
import { normalizeNws } from '../api/normalizers/nws'
import { normalizeOpenMeteo } from '../api/normalizers/openmeteo'
import { normalizeOpenWeatherMap } from '../api/normalizers/openweathermap'
import { normalizePirateWeather } from '../api/normalizers/pirateweather'
import { normalizePocasiCz } from '../api/normalizers/pocasicz'
import { normalizeSmhi } from '../api/normalizers/smhi'
import { normalizeTomorrowio } from '../api/normalizers/tomorrowio'
import { normalizeWeatherApi } from '../api/normalizers/weatherapi'
import { normalizeWeatherbit } from '../api/normalizers/weatherbit'
import { normalizeWeatherCom } from '../api/normalizers/weathercom'
import { normalizeWttr } from '../api/normalizers/wttr'
import { normalizeXweather } from '../api/normalizers/xweather'
import { normalizeYr } from '../api/normalizers/yr'
import { fetchBrightsky } from '../api/brightsky'
import { fetchOpenSenseMap } from '../api/opensensemap'
import { PROVIDERS } from '../config/providers'
import { buildResult, locationInCoverage } from '../utils/consensusCore'
import { numberOrNull } from '../utils/weatherMath'
import type { LegacyHandler } from './adaptVercelHandler'
import { runLegacyJson } from './runLegacyHandler'

import handlerAccuweather from '../../handlers/accuweather'
import handlerAladin from '../../handlers/aladin'
import handlerAviation from '../../handlers/aviation'
import handlerBmkg from '../../handlers/bmkg'
import handlerChmi from '../../handlers/chmi'
import handlerFmi from '../../handlers/fmi'
import handlerGeosphere from '../../handlers/geosphere'
import handlerImgw from '../../handlers/imgw'
import handlerInpocasi from '../../handlers/inpocasi-stations'
import handlerMeteoam from '../../handlers/meteoam'
import handlerMeteosource from '../../handlers/meteosource'
import handlerNetatmo from '../../handlers/netatmo'
import handlerNws from '../../handlers/nws'
import handlerOpenweathermap from '../../handlers/openweathermap'
import handlerPirateweather from '../../handlers/pirateweather'
import handlerPocasicz from '../../handlers/pocasicz'
import handlerShmu from '../../handlers/shmu'
import handlerSmhi from '../../handlers/smhi'
import handlerTomorrowio from '../../handlers/tomorrowio'
import handlerWeatherapi from '../../handlers/weatherapi'
import handlerWeatherbit from '../../handlers/weatherbit'
import handlerWeathercom from '../../handlers/weathercom'
import handlerWttr from '../../handlers/wttr'
import handlerWunderground from '../../handlers/wunderground'
import handlerXweather from '../../handlers/xweather'
import handlerYr from '../../handlers/yr'

const OPEN_METEO_HOST = 'https://api.open-meteo.com'
const ENSEMBLE_METEO_HOST = 'https://ensemble-api.open-meteo.com'
const PROVIDER_TIMEOUT_MS = 4500
const SECONDARY_TIMEOUT_MS = 3000

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'surface_pressure',
  'cloud_cover',
  'visibility',
].join(',')

const ENSEMBLE_MEAN_FIELDS = [
  'temperature_2m',
  'temperature_2m_spread',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'surface_pressure',
  'cloud_cover',
  'visibility',
  'uv_index',
].join(',')

type Normalizer = (data: unknown) => unknown

const PROXY_PROVIDERS: Record<string, { handler: LegacyHandler; normalize: Normalizer }> = {
  chmi: { handler: handlerChmi, normalize: normalizeCHMI },
  aviation: { handler: handlerAviation, normalize: normalizeAviation },
  shmu: { handler: handlerShmu, normalize: normalizeNeighborStation },
  geosphere: { handler: handlerGeosphere, normalize: normalizeNeighborStation },
  imgw: { handler: handlerImgw, normalize: normalizeNeighborStation },
  aladin: { handler: handlerAladin, normalize: normalizeAladin },
  yr: { handler: handlerYr, normalize: normalizeYr },
  smhi: { handler: handlerSmhi, normalize: normalizeSmhi },
  fmi: { handler: handlerFmi, normalize: normalizeFmi },
  nws: { handler: handlerNws, normalize: normalizeNws },
  meteoam: { handler: handlerMeteoam, normalize: normalizeMeteoam },
  bmkg: { handler: handlerBmkg, normalize: normalizeBmkg },
  weathercom: { handler: handlerWeathercom, normalize: normalizeWeatherCom },
  wttr: { handler: handlerWttr, normalize: normalizeWttr },
  pocasicz: { handler: handlerPocasicz, normalize: normalizePocasiCz },
  inpocasi: { handler: handlerInpocasi, normalize: normalizeInpocasiStation },
  weatherapi: { handler: handlerWeatherapi, normalize: normalizeWeatherApi },
  pirateweather: { handler: handlerPirateweather, normalize: normalizePirateWeather },
  openweathermap: { handler: handlerOpenweathermap, normalize: normalizeOpenWeatherMap },
  tomorrowio: { handler: handlerTomorrowio, normalize: normalizeTomorrowio },
  meteosource: { handler: handlerMeteosource, normalize: normalizeMeteosource },
  xweather: { handler: handlerXweather, normalize: normalizeXweather },
  weatherbit: { handler: handlerWeatherbit, normalize: normalizeWeatherbit },
  accuweather: { handler: handlerAccuweather, normalize: normalizeAccuweather },
  netatmo: { handler: handlerNetatmo, normalize: normalizeNeighborStation },
  wunderground: { handler: handlerWunderground, normalize: normalizeNeighborStation },
}

function timeoutMs(provider: { weight?: number }) {
  const weight = numberOrNull(provider?.weight)
  return weight !== null && weight >= 3 ? PROVIDER_TIMEOUT_MS : SECONDARY_TIMEOUT_MS
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout.`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function fetchOpenMeteoJson(url: string) {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.error) {
    throw new Error(data?.reason || data?.error || 'Open-Meteo request failed.')
  }
  return data
}

async function fetchOpenMeteoModelServer(location: { lat: number; lon: number }, provider: { endpoint?: string; model?: string }) {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    current: CURRENT_FIELDS,
    hourly: CURRENT_FIELDS,
    timezone: 'Europe/Prague',
    forecast_days: '7',
  })
  if (provider.model) params.set('models', provider.model)
  return normalizeOpenMeteo(await fetchOpenMeteoJson(`${OPEN_METEO_HOST}${provider.endpoint}?${params}`))
}

async function fetchOpenMeteoEnsembleServer(location: { lat: number; lon: number }, provider: { model?: string }) {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    models: String(provider.model),
    hourly: ENSEMBLE_MEAN_FIELDS,
    timezone: 'Europe/Prague',
    forecast_days: '7',
  })
  return normalizeOpenMeteo(await fetchOpenMeteoJson(`${ENSEMBLE_METEO_HOST}/v1/ensemble?${params}`))
}

async function fetchOneProvider(provider: (typeof PROVIDERS)[number], location: { lat: number; lon: number }) {
  if (!locationInCoverage(provider, location)) {
    return { providerStatus: 'not-applicable', error: 'Zdroj nemá pro tuto polohu pokrytí.' }
  }

  const budget = timeoutMs(provider)
  const run = async () => {
    if (provider.id === 'brightsky') return fetchBrightsky(location)
    if (provider.id === 'opensensemap') return fetchOpenSenseMap(location)

    if (typeof provider.model === 'string' && String(provider.model).includes('ensemble')) {
      return fetchOpenMeteoEnsembleServer(location, provider)
    }
    if (provider.endpoint) {
      return fetchOpenMeteoModelServer(location, provider)
    }

    const wired = PROXY_PROVIDERS[provider.id]
    if (!wired) throw new Error(`No server fetch for ${provider.id}`)
    const raw = await runLegacyJson(wired.handler, {
      lat: String(location.lat),
      lon: String(location.lon),
    })
    return wired.normalize(raw)
  }

  return withTimeout(run(), budget, provider.name)
}

/** Fan-in all enabled providers in-process and build consensus. */
export async function buildServerConsensus(location: { lat: number; lon: number }) {
  const enabled = PROVIDERS.filter((provider) => provider.enabled)
  const settled = await Promise.all(
    enabled.map(async (provider) => {
      try {
        const value = await fetchOneProvider(provider, location)
        return { status: 'fulfilled' as const, value }
      } catch (reason) {
        return { status: 'rejected' as const, reason }
      }
    }),
  )
  return buildResult(settled)
}
