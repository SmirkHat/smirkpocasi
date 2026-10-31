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
import { buildResult, locationInCoverage, OBSERVATION_SOURCE_IDS } from '../utils/consensusCore'
import { createParallelLimit } from './parallelLimit'
import { numberOrNull } from '../utils/weatherMath'
import type { LegacyHandler } from './adaptVercelHandler'
import { runLegacyJson } from './runLegacyHandler'
import { settleWithQuorum } from './settleWithQuorum'

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
// One slow upstream must not hold the page: past this point we answer as soon as enough models are in.
const SOFT_DEADLINE_MS = 1100
const FORECAST_QUORUM = 8
// Late answers land here too, so the follow-up request is complete and instant.
const MODEL_CACHE_MS = 5 * 60 * 1000
const STATION_CACHE_MS = 3 * 60 * 1000
const FAILURE_CACHE_MS = 45 * 1000
const MAX_CACHED_RUNS = 600

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'cloud_cover',
  'visibility',
  'uv_index',
].join(',')

const ENSEMBLE_MEAN_FIELDS = [
  'temperature_2m',
  'temperature_2m_spread',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'cloud_cover',
  'visibility',
  'uv_index',
].join(',')

type Normalizer = (data: unknown) => unknown
type ProviderRun = { startedAt: number; ttlMs: number; promise: Promise<any> }

const providerRuns = new Map<string, ProviderRun>()
// Open-Meteo answers 429 to bursts: 3-4 refusals per load with every model at once, about one at six parallel,
// none at four. Refused models fell out of the consensus and the failure stayed cached for 45 s.
const openMeteoSlot = createParallelLimit(4)

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

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

async function requestOpenMeteoJson(url: string) {
  // Without its own timeout a hung request would keep its slot long after the provider's budget ran out.
  const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.error) {
    throw new Error(data?.reason || data?.error || 'Open-Meteo request failed.')
  }
  return data
}

function fetchOpenMeteoJson(url: string) {
  return openMeteoSlot(() => requestOpenMeteoJson(url))
}

async function fetchOpenMeteoModelServer(location: { lat: number; lon: number }, provider: { endpoint?: string; model?: string }) {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    current: CURRENT_FIELDS,
    hourly: CURRENT_FIELDS,
    daily: 'sunrise,sunset',
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
    daily: 'sunrise,sunset',
    timezone: 'Europe/Prague',
    forecast_days: '7',
  })
  return normalizeOpenMeteo(await fetchOpenMeteoJson(`${ENSEMBLE_METEO_HOST}/v1/ensemble?${params}`))
}

function pruneProviderRuns(now: number) {
  for (const [key, run] of providerRuns) {
    if (now - run.startedAt >= run.ttlMs) providerRuns.delete(key)
  }
  while (providerRuns.size >= MAX_CACHED_RUNS) {
    providerRuns.delete(providerRuns.keys().next().value as string)
  }
}

/** Shares one upstream call between concurrent requests and recent repeats for the same ~1 km cell. */
function cachedProviderRun(
  provider: (typeof PROVIDERS)[number],
  location: { lat: number; lon: number },
  run: () => Promise<unknown>,
) {
  const key = `${provider.id}:${location.lat.toFixed(2)},${location.lon.toFixed(2)}`
  const now = Date.now()
  const existing = providerRuns.get(key)
  if (existing && now - existing.startedAt < existing.ttlMs) return existing.promise

  const entry: ProviderRun = {
    startedAt: now,
    ttlMs: OBSERVATION_SOURCE_IDS.has(provider.id) ? STATION_CACHE_MS : MODEL_CACHE_MS,
    promise: run(),
  }
  entry.promise.catch(() => {
    entry.ttlMs = FAILURE_CACHE_MS
  })
  pruneProviderRuns(now)
  providerRuns.set(key, entry)
  return entry.promise
}

const NO_COVERAGE = { providerStatus: 'not-applicable', error: 'Zdroj nemá pro tuto polohu pokrytí.' }

/** Regional model grids are rotated rather than lat/lon rectangles, so only Open-Meteo knows whether a point is inside. */
function noCoverageIfOutsideGrid(error: Error) {
  if (/no data is available for this location/i.test(error.message)) return NO_COVERAGE
  throw error
}

async function fetchOneProvider(provider: (typeof PROVIDERS)[number], location: { lat: number; lon: number }) {
  if (!locationInCoverage(provider, location)) return NO_COVERAGE

  const budget = timeoutMs(provider)
  const controller = provider.id === 'opensensemap' ? new AbortController() : null
  const run = async () => {
    if (provider.id === 'brightsky') return fetchBrightsky(location)
    if (provider.id === 'opensensemap') return fetchOpenSenseMap(location, { signal: controller?.signal })

    if (typeof provider.model === 'string' && String(provider.model).includes('ensemble')) {
      return fetchOpenMeteoEnsembleServer(location, provider)
    }
    if (provider.endpoint) {
      return fetchOpenMeteoModelServer(location, provider).catch(noCoverageIfOutsideGrid)
    }

    const wired = PROXY_PROVIDERS[provider.id]
    if (!wired) throw new Error(`No server fetch for ${provider.id}`)
    const raw = await runLegacyJson(wired.handler, {
      lat: String(location.lat),
      lon: String(location.lon),
    })
    return wired.normalize(raw)
  }

  // The budget belongs to the shared run, not each request: a hung upstream fails once for everybody.
  return cachedProviderRun(provider, location, async () => {
    try {
      return await withTimeout(run(), budget, provider.name)
    } finally {
      controller?.abort()
    }
  })
}

function isForecastAnswer(provider: (typeof PROVIDERS)[number], result: any) {
  return (
    !OBSERVATION_SOURCE_IDS.has(provider.id) &&
    result?.status === 'fulfilled' &&
    numberOrNull(result.value?.temperature) !== null
  )
}

/** Waits for every provider, unlike the page: a benchmark has time, and a straggler is still a forecast. */
export async function fetchProviderValues(
  location: { lat: number; lon: number },
  include: (provider: (typeof PROVIDERS)[number]) => boolean,
) {
  const providers = PROVIDERS.filter((provider) => provider.enabled && include(provider))
  const settled = await Promise.allSettled(providers.map((provider) => fetchOneProvider(provider, location)))
  return providers.map((provider, index) => ({ provider, result: settled[index] }))
}

/**
 * Fan-in all enabled providers in-process and build consensus.
 * `partial` tells the client that stragglers were left out and a follow-up request will include them.
 */
export async function buildServerConsensus(location: { lat: number; lon: number }) {
  const enabled = PROVIDERS.filter((provider) => provider.enabled)
  const settled: any[] = enabled.map(() => null)
  const tasks = enabled.map(async (provider, index) => {
    try {
      settled[index] = { status: 'fulfilled', value: await fetchOneProvider(provider, location) }
    } catch (reason) {
      settled[index] = { status: 'rejected', reason }
    }
  })

  await settleWithQuorum(
    tasks,
    () => enabled.filter((provider, index) => isForecastAnswer(provider, settled[index])).length >= FORECAST_QUORUM,
    SOFT_DEADLINE_MS,
  )
  return { ...buildResult(settled), partial: settled.includes(null) }
}
