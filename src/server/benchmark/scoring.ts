import { COLD_GAUGE_CELSIUS, RAIN_EVENT_MM, RAIN_WINDOW_HOURS, TOLERANCE } from './config'
import type { BenchmarkDataset, BenchmarkField } from './config'
import { rainWindowTotal } from './series'
import type { HourlyObservation } from './truth'

const SECONDS_PER_HOUR = 3600

export type ScoreKey = {
  dataset: BenchmarkDataset
  month: string
  station: string
  source: string
  field: BenchmarkField
  bucket: number
}

export type ScoreCounts = {
  n: number
  sumAbs: number
  sumErr: number
  sumSq: number
  within: number
  hits: number
  misses: number
  falseAlarms: number
  correctNegatives: number
}

export type ScoreCell = ScoreKey & ScoreCounts
export type ScoreSheet = Map<string, ScoreCell>

export function emptyCounts(): ScoreCounts {
  return { n: 0, sumAbs: 0, sumErr: 0, sumSq: 0, within: 0, hits: 0, misses: 0, falseAlarms: 0, correctNegatives: 0 }
}

export function monthOf(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 7)
}

function addRainEvent(cell: ScoreCounts, forecast: number, observed: number) {
  const predicted = forecast >= RAIN_EVENT_MM
  const happened = observed >= RAIN_EVENT_MM
  if (predicted && happened) cell.hits += 1
  else if (happened) cell.misses += 1
  else if (predicted) cell.falseAlarms += 1
  else cell.correctNegatives += 1
}

export function addPair(sheet: ScoreSheet, key: ScoreKey, forecast: number | null, observed: number | null) {
  if (forecast === null || observed === null) return
  const id = `${key.dataset}|${key.month}|${key.station}|${key.source}|${key.field}|${key.bucket}`
  let cell = sheet.get(id)
  if (!cell) {
    cell = { ...key, ...emptyCounts() }
    sheet.set(id, cell)
  }
  const error = forecast - observed
  cell.n += 1
  cell.sumAbs += Math.abs(error)
  cell.sumErr += error
  cell.sumSq += error * error
  if (key.field === 'rain') addRainEvent(cell, forecast, observed)
  else if (Math.abs(error) <= TOLERANCE[key.field]) cell.within += 1
}

/** Null when a gauge cannot be trusted or any hour is missing: a rain score against that would be noise. */
export function observedRainWindow(observationAt: (hour: number) => HourlyObservation | undefined, windowEnd: number) {
  for (let step = 0; step < RAIN_WINDOW_HOURS; step += 1) {
    const temperature = observationAt(windowEnd - step * SECONDS_PER_HOUR)?.temperature
    if (temperature === null || temperature === undefined || temperature <= COLD_GAUGE_CELSIUS) return null
  }
  return rainWindowTotal((hour) => observationAt(hour)?.rain, windowEnd)
}

/** The same hour on the latest whole day known at issue: what you would guess with no model at all. */
export function persistenceHour(valid: number, leadHours: number) {
  const days = Math.max(1, Math.ceil(leadHours / 24))
  return valid - days * 24 * SECONDS_PER_HOUR
}

export type ForecastRowScore = {
  temperature: number | null
  wind: number | null
  rain: number | null
}

export function addForecastPairs(
  sheet: ScoreSheet,
  key: Omit<ScoreKey, 'field'>,
  forecast: ForecastRowScore,
  valid: number,
  observationAt: (hour: number) => HourlyObservation | undefined,
) {
  const observed = observationAt(valid)
  addPair(sheet, { ...key, field: 'temperature' }, forecast.temperature, observed?.temperature ?? null)
  addPair(sheet, { ...key, field: 'wind' }, forecast.wind, observed?.wind ?? null)
  addPair(sheet, { ...key, field: 'rain' }, forecast.rain, observedRainWindow(observationAt, valid))
}
