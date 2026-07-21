import weatherHandler from './weather'
import warningsHandler from './warnings'
import chmiAqiHandler from './chmi-aqi'
import { fetchAQI } from '../src/api/aqi'
import { normalizeOpenWeatherMapPollution } from '../src/api/normalizers/openweathermap'
import { buildServerConsensus } from '../src/server/fetchProvidersServer'
import { runLegacyHandler, runLegacyJson } from '../src/server/runLegacyHandler'
import openweathermapHandler from './openweathermap'

const MEMORY_TTL_MS = 90_000
const cache = new Map()
const inFlight = new Map()

function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`
}

function inCzechia(lat, lon) {
  return lat >= 48.3 && lat <= 51.2 && lon >= 11.8 && lon <= 19.1
}

function idwMean(stations, key, power = 2) {
  let numerator = 0
  let denominator = 0
  for (const reading of stations || []) {
    const value = Number(reading?.[key])
    const distanceKm = Number(reading?.station?.distanceKm)
    if (!Number.isFinite(value) || !Number.isFinite(distanceKm)) continue
    const weight = 1 / Math.max(distanceKm, 0.5) ** power
    numerator += value * weight
    denominator += weight
  }
  return denominator > 0 ? numerator / denominator : null
}

function nearestDistanceKm(stations) {
  const distances = (stations || [])
    .map((reading) => Number(reading?.station?.distanceKm))
    .filter(Number.isFinite)
  return distances.length ? Math.min(...distances) : null
}

function chmiBlendWeight(nearestKm) {
  if (!Number.isFinite(nearestKm)) return 0
  if (nearestKm <= 5) return 0.8
  if (nearestKm <= 15) return 0.65
  if (nearestKm <= 35) return 0.5
  if (nearestKm <= 60) return 0.35
  return 0.2
}

function blendNumber(chmiValue, openValue, chmiWeight) {
  const hasChmi = Number.isFinite(chmiValue)
  const hasOpen = Number.isFinite(openValue)
  if (hasChmi && hasOpen) return chmiValue * chmiWeight + openValue * (1 - chmiWeight)
  if (hasChmi) return chmiValue
  if (hasOpen) return openValue
  return null
}

function meanModels(...values) {
  const finite = values.filter((value) => Number.isFinite(value))
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function round(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function indexLabelFromValue(indexValue) {
  if (!Number.isFinite(indexValue)) return null
  if (indexValue < 0.34) return { label: 'Velmi dobrá až dobrá', level: '1A' }
  if (indexValue < 0.67) return { label: 'Velmi dobrá až dobrá', level: '1B' }
  if (indexValue < 1) return { label: 'Přijatelná', level: '2A' }
  if (indexValue < 1.5) return { label: 'Přijatelná', level: '2B' }
  if (indexValue < 2) return { label: 'Zhoršená až špatná', level: '3A' }
  return { label: 'Zhoršená až špatná', level: '3B' }
}

function aggregateAqi(chmiPayload, openPayload, owmPayload) {
  const stations = chmiPayload?.stations || []
  const nearestKm = nearestDistanceKm(stations)
  const chmiWeight = chmiBlendWeight(nearestKm)
  const chmi = {
    aqi: idwMean(stations, 'aqi'),
    indexValue: idwMean(stations, 'indexValue'),
    pm10: idwMean(stations, 'pm10'),
    pm25: idwMean(stations, 'pm25'),
    no2: idwMean(stations, 'no2'),
    o3: idwMean(stations, 'o3'),
    so2: idwMean(stations, 'so2'),
  }
  const model = {
    aqi: openPayload?.aqi ?? null,
    pm10: meanModels(openPayload?.pm10, owmPayload?.pm10),
    pm25: meanModels(openPayload?.pm25, owmPayload?.pm25),
    no2: meanModels(openPayload?.no2, owmPayload?.no2),
    o3: meanModels(openPayload?.o3, owmPayload?.o3),
    so2: meanModels(openPayload?.so2, owmPayload?.so2),
  }
  const indexValue = chmi.indexValue
  const indexMeta = indexLabelFromValue(indexValue)
  const sources = []
  if (stations.length) sources.push('ČHMÚ')
  if (openPayload) sources.push('Open-Meteo CAMS')
  if (owmPayload) sources.push('OpenWeatherMap')

  return {
    aqi: round(blendNumber(chmi.aqi, model.aqi, chmiWeight)),
    indexValue: indexValue != null ? round(indexValue, 2) : null,
    indexLevel: indexMeta?.level ?? null,
    label: indexMeta?.label ?? null,
    pm10: round(blendNumber(chmi.pm10, model.pm10, chmiWeight), 1),
    pm25: round(blendNumber(chmi.pm25, model.pm25, chmiWeight), 1),
    no2: round(blendNumber(chmi.no2, model.no2, chmiWeight), 1),
    o3: round(blendNumber(chmi.o3, model.o3, chmiWeight), 1),
    so2: round(blendNumber(chmi.so2, model.so2, chmiWeight), 1),
    updatedAt: openPayload?.updatedAt || owmPayload?.updatedAt || chmiPayload?.updatedAt || null,
    attribution: sources.length ? `Data: ${sources.join(' + ')}` : null,
    nearestKm: nearestKm != null ? round(nearestKm, 1) : null,
  }
}

async function buildHomeBundle(lat, lon) {
  const location = { lat, lon }
  const query = { lat: String(lat), lon: String(lon) }

  const [weatherResult, warningsResult, consensus, chmiAqi, openAqi, owmPollution] = await Promise.all([
    runLegacyHandler(weatherHandler, query),
    runLegacyHandler(warningsHandler, query),
    buildServerConsensus(location),
    inCzechia(lat, lon)
      ? runLegacyJson(chmiAqiHandler, query).catch(() => null)
      : Promise.resolve(null),
    fetchAQI(lat, lon).catch(() => null),
    runLegacyHandler(openweathermapHandler, { ...query, parts: 'pollution' }).then((result) => {
      if (!result.ok) return null
      const body = result.body
      if (!body || typeof body !== 'object' || !('pollution' in body)) return null
      return normalizeOpenWeatherMapPollution(body.pollution)
    }).catch(() => null),
  ])

  if (!weatherResult.ok) {
    throw new Error(weatherResult.error || 'Weather unavailable')
  }

  const warningsBody =
    warningsResult.ok && warningsResult.body && typeof warningsResult.body === 'object'
      ? warningsResult.body
      : { warnings: [], attribution: null }

  return {
    weather: weatherResult.body,
    warnings: warningsBody.warnings || [],
    warningsAttribution: warningsBody.attribution || null,
    aqi: aggregateAqi(chmiAqi, openAqi, owmPollution),
    consensus,
    requestLat: lat,
    requestLon: lon,
    updatedAt: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Chybí lat nebo lon.' })
  }

  const key = cacheKey(lat, lon)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < MEMORY_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=300')
    res.setHeader('X-Home-Cache', 'HIT')
    return res.status(200).json(cached.payload)
  }

  try {
    let pending = inFlight.get(key)
    if (!pending) {
      pending = buildHomeBundle(lat, lon).finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    const payload = await pending
    cache.set(key, { at: Date.now(), payload })
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=300')
    res.setHeader('X-Home-Cache', 'MISS')
    return res.status(200).json(payload)
  } catch (error) {
    if (cached?.payload) {
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
      res.setHeader('X-Home-Cache', 'STALE')
      return res.status(200).json({ ...cached.payload, stale: true })
    }
    return res.status(502).json({
      error: 'Home bundle failed.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
