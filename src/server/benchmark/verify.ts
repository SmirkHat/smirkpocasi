import { PROVIDERS } from '../../config/providers'
import {
  RAW_RETENTION_DAYS,
  SOURCE_CONSENSUS_OPEN,
  SOURCE_PERSISTENCE,
  isOpenSource,
  leadBucket,
} from './config'
import { addForecastPairs, monthOf, persistenceHour } from './scoring'
import type { ScoreSheet } from './scoring'
import { rainWindowTotal } from './series'
import { inTransaction, saveScores } from './store'
import type { BenchmarkDb } from './store'
import type { HourlyObservation } from './truth'

const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86_400
// The longest lead reaches back this far for persistence, plus a rain window.
const OBSERVATION_LOOKBACK_SECONDS = 11 * SECONDS_PER_DAY

type ForecastRecord = {
  station: string
  source: string
  issued: number
  valid: number
  temperature: number | null
  wind: number | null
  rain: number | null
}

function observationLookup(db: BenchmarkDb, from: number) {
  const rows = db
    .prepare('SELECT station, valid, temperature, wind, rain FROM observation WHERE valid >= ?')
    .all(from) as unknown as (HourlyObservation & { station: string; valid: number })[]
  const byStation = new Map<string, Map<number, HourlyObservation>>()
  for (const row of rows) {
    let hours = byStation.get(row.station)
    if (!hours) {
      hours = new Map()
      byStation.set(row.station, hours)
    }
    hours.set(row.valid, row)
  }
  return byStation
}

/** Rain for an hour is only complete once the next hour's reading exists. */
function latestVerifiableHours(observations: Map<string, Map<number, HourlyObservation>>) {
  const latest = new Map<string, number>()
  for (const [station, hours] of observations) {
    latest.set(station, Math.max(...hours.keys()) - SECONDS_PER_HOUR)
  }
  return latest
}

function addPersistence(sheet: ScoreSheet, row: ForecastRecord, bucket: number, month: string, leadHours: number, hours: Map<number, HourlyObservation>) {
  const reference = persistenceHour(row.valid, leadHours)
  const yesterday = hours.get(reference)
  addForecastPairs(
    sheet,
    { dataset: 'live', month, station: row.station, source: SOURCE_PERSISTENCE, bucket },
    {
      temperature: yesterday?.temperature ?? null,
      wind: yesterday?.wind ?? null,
      rain: rainWindowTotal((hour) => hours.get(hour)?.rain, reference),
    },
    row.valid,
    (hour) => hours.get(hour),
  )
}

/**
 * Turns forecasts whose time has come into counted errors. A row is marked in the same
 * transaction that counts it, so running this twice can never count anything twice.
 */
export function scoreForecasts(db: BenchmarkDb, nowSeconds: number) {
  const rows = db
    .prepare(
      'SELECT station, source, issued, valid, temperature, wind, rain FROM forecast WHERE scored = 0 AND valid <= ?',
    )
    .all(nowSeconds) as unknown as ForecastRecord[]
  if (!rows.length) return 0

  const earliest = rows.reduce((min, row) => Math.min(min, row.valid), Infinity)
  const observations = observationLookup(db, earliest - OBSERVATION_LOOKBACK_SECONDS)
  const verifiableUntil = latestVerifiableHours(observations)
  const sheet: ScoreSheet = new Map()
  const markScored = db.prepare('UPDATE forecast SET scored = 1 WHERE station = ? AND source = ? AND issued = ? AND valid = ?')
  let scored = 0

  inTransaction(db, () => {
    for (const row of rows) {
      const hours = observations.get(row.station)
      if (!hours || row.valid > (verifiableUntil.get(row.station) as number)) continue
      markScored.run(row.station, row.source, row.issued, row.valid)
      scored += 1

      const leadHours = (row.valid - row.issued) / SECONDS_PER_HOUR
      const bucket = leadBucket(leadHours)
      if (bucket === null) continue
      const month = monthOf(row.valid)
      addForecastPairs(sheet, { dataset: 'live', month, station: row.station, source: row.source, bucket }, row, row.valid, (hour) => hours.get(hour))
      // Every snapshot has this source, so the baseline gets exactly one sample per scored hour.
      if (row.source === SOURCE_CONSENSUS_OPEN) addPersistence(sheet, row, bucket, month, leadHours, hours)
    }
    saveScores(db, sheet)
  })
  return scored
}

function restrictedRawSources() {
  return PROVIDERS.filter((provider) => !isOpenSource(provider)).map((provider) => provider.id)
}

/** Commercial forecasts leave as soon as they are counted, because their terms on storage could not be confirmed. */
export function pruneForecasts(db: BenchmarkDb, nowSeconds: number) {
  const restricted = restrictedRawSources()
  const placeholders = restricted.map(() => '?').join(',')
  db.prepare(`DELETE FROM forecast WHERE scored = 1 AND source IN (${placeholders})`).run(...restricted)
  db.prepare('DELETE FROM forecast WHERE issued < ?').run(nowSeconds - RAW_RETENTION_DAYS * SECONDS_PER_DAY)
}
