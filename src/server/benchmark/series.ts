import { OBSERVATION_SOURCE_IDS } from '../../utils/consensusCore'
import { extractForecastSeries } from '../../utils/forecastSeries'
import { buildMergedForecastDays, pragueHourKey } from '../../utils/hourlyForecast'
import { parsePragueTime } from '../../utils/weatherMath'
import { RAIN_WINDOW_HOURS } from './config'

const SECONDS_PER_HOUR = 3600
const EVERY_HOUR_UP_TO_LEAD = 24
const SPARSE_STEP_HOURS = 3

export type HourValues = { temperature: number | null; wind: number | null; rain: number | null }
export type ForecastRow = HourValues & { valid: number }

type ForecastSeriesInput = { id: string; name?: string; weight: number; kind: string; data: unknown }

/** Runs the series through the page's own merge, so the benchmark scores exactly what a visitor would have seen. */
export function hourlyValues({ series, hourly }: { series: ForecastSeriesInput[]; hourly?: unknown }) {
  const { days } = buildMergedForecastDays({ hourly, forecastSeries: series })
  const values = new Map<number, HourValues>()
  for (const day of days) {
    for (const hour of day.hours) {
      // A model past the end of its range still has hours, with nothing in them. They are not part of its reach.
      if (hour.temperature === null && hour.windSpeed === null && hour.precipMm === null) continue
      values.set(Math.floor(hour.time.getTime() / 1000 / SECONDS_PER_HOUR) * SECONDS_PER_HOUR, {
        temperature: hour.temperature,
        wind: hour.windSpeed,
        rain: hour.precipMm,
      })
    }
  }
  return values
}

/** Null unless every hour of the window is known, so a coarse source is not credited with a dry gap. */
export function rainWindowTotal(rainAt: (hour: number) => number | null | undefined, windowEnd: number) {
  let total = 0
  for (let step = 0; step < RAIN_WINDOW_HOURS; step += 1) {
    const rain = rainAt(windowEnd - step * SECONDS_PER_HOUR)
    if (rain === null || rain === undefined) return null
    total += rain
  }
  return total
}

// Every hour would mean 168 rows per source and station, about 5 MB a day. Long leads change slowly,
// and Prague hours keep the 3-hourly sources in, whose steps sit on local multiples of three.
function worthKeeping(valid: number, leadHours: number) {
  if (leadHours <= EVERY_HOUR_UP_TO_LEAD) return true
  const pragueHour = Number(pragueHourKey(new Date(valid * 1000)).slice(11))
  return pragueHour % SPARSE_STEP_HOURS === 0
}

/** Forecast rows from the moment of issue on. A rain window must lie wholly after issue, or part of it was already known. */
export function forecastRows(values: Map<number, HourValues>, issued: number) {
  const rows: ForecastRow[] = []
  for (const [valid, hour] of values) {
    const leadHours = (valid - issued) / SECONDS_PER_HOUR
    if (leadHours < 0 || !worthKeeping(valid, leadHours)) continue
    rows.push({
      valid,
      temperature: hour.temperature,
      wind: hour.wind,
      rain:
        leadHours >= RAIN_WINDOW_HOURS ? rainWindowTotal((at) => values.get(at)?.rain, valid) : null,
    })
  }
  return rows
}

function stepSeries(provider: { id: string; name: string; weight: number }, steps: unknown[]) {
  return steps.length ? { id: provider.id, name: provider.name, weight: provider.weight, kind: 'steps', data: { steps } } : null
}

function numberTimesOrNull(value: unknown, factor: number) {
  return value === null || value === undefined ? null : Number(value) * factor
}

/**
 * Sources whose hours the page ignores: they have no series for the merged forecast, but they
 * do have a forecast to verify. Kept here so that measuring them does not change what visitors see.
 */
function benchmarkOnlySeries(provider: { id: string; name: string; weight: number }, raw: any) {
  if (provider.id === 'pocasicz' && Array.isArray(raw?.entries)) {
    return stepSeries(
      provider,
      raw.entries.map((entry: any) => ({
        time: parsePragueTime(`${entry.localDate}T${entry.localTime}`).toISOString(),
        temperature: entry.temp ?? null,
        windSpeed: numberTimesOrNull(entry.wind, 3.6),
        precipitation: entry.precip ?? null,
      })),
    )
  }
  if (provider.id === 'weatherapi' && Array.isArray(raw?.forecast?.forecastday)) {
    return stepSeries(
      provider,
      raw.forecast.forecastday
        .flatMap((day: any) => day?.hour ?? [])
        .map((hour: any) => ({
          time: new Date(hour.time_epoch * 1000).toISOString(),
          temperature: hour.temp_c ?? null,
          windSpeed: hour.wind_kph ?? null,
          precipitation: hour.precip_mm ?? null,
        })),
    )
  }
  if (provider.id === 'pirateweather' && Array.isArray(raw?.hourly?.data)) {
    return stepSeries(
      provider,
      raw.hourly.data.map((hour: any) => ({
        time: new Date(hour.time * 1000).toISOString(),
        temperature: hour.temperature ?? null,
        windSpeed: numberTimesOrNull(hour.windSpeed, 3.6),
        precipitation: hour.precipIntensity ?? null,
      })),
    )
  }
  return null
}

/** `inConsensus` follows the page: a source it does not merge must not move the consensus being measured. */
export function seriesToVerify(provider: { id: string; name: string; weight: number }, value: { raw?: unknown }) {
  const merged = extractForecastSeries(provider, value, OBSERVATION_SOURCE_IDS) as ForecastSeriesInput | null
  if (merged) return { series: merged, inConsensus: true }
  const own = benchmarkOnlySeries(provider, value.raw)
  return own ? { series: own as ForecastSeriesInput, inConsensus: false } : null
}
