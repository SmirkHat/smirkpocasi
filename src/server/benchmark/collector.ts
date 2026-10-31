import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import handlerWeather from '../../../handlers/weather'
import { OBSERVATION_SOURCE_IDS } from '../../utils/consensusCore'
import { fetchProviderValues } from '../fetchProvidersServer'
import { runLegacyHandler } from '../runLegacyHandler'
import { backfillArchive } from './archive'
import {
  LIMITED_SOURCE_SLOT_HOURS_UTC,
  LIMITED_SOURCE_STATION_IDS,
  SLOT_HOURS_UTC,
  SLOT_MINUTE_UTC,
  SOURCE_CONSENSUS,
  SOURCE_CONSENSUS_OPEN,
  SOURCE_OPEN_METEO,
  STATIONS,
  isOpenSource,
} from './config'
import type { BenchmarkStation } from './config'
import { forecastRows, hourlyValues, seriesToVerify } from './series'
import type { HourValues } from './series'
import { getMeta, inTransaction, openBenchmarkDb, saveForecastRows, saveObservations, saveSnapshot, setMeta } from './store'
import type { BenchmarkDb } from './store'
import { fetchRecentDays } from './truth'
import { pruneForecasts, scoreForecasts } from './verify'

const SECONDS_PER_HOUR = 3600
const MS_PER_HOUR = 3_600_000
// A restart within this window still catches the slot it missed. Later, the next one comes soon enough.
const CATCH_UP_MS = 3 * MS_PER_HOUR
const PAUSE_BETWEEN_STATIONS_MS = 20_000
const PAUSE_BETWEEN_OBSERVATION_FETCHES_MS = 2_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Slot times are epoch ms, ascending, for the UTC day of `nowMs` and the days around it. */
function slotsAround(nowMs: number) {
  const dayStart = Math.floor(nowMs / (24 * MS_PER_HOUR)) * 24 * MS_PER_HOUR
  return [-1, 0, 1].flatMap((day) =>
    SLOT_HOURS_UTC.map((hour) => dayStart + day * 24 * MS_PER_HOUR + hour * MS_PER_HOUR + SLOT_MINUTE_UTC * 60_000),
  )
}

export function latestSlot(nowMs: number) {
  return slotsAround(nowMs).filter((slot) => slot <= nowMs).at(-1) as number
}

export function nextSlot(nowMs: number) {
  return slotsAround(nowMs).find((slot) => slot > nowMs) as number
}

function includesLimitedSources(station: BenchmarkStation, slotMs: number) {
  return LIMITED_SOURCE_STATION_IDS.has(station.id) && LIMITED_SOURCE_SLOT_HOURS_UTC.has(new Date(slotMs).getUTCHours())
}

function reachHours(values: Map<number, HourValues>, issued: number) {
  const furthest = Math.max(...values.keys())
  return Math.max(0, Math.round((furthest - issued) / SECONDS_PER_HOUR))
}

async function collectStation(db: BenchmarkDb, station: BenchmarkStation, slotMs: number) {
  const issued = Math.floor(Date.now() / 1000)
  const limited = includesLimitedSources(station, slotMs)
  const answers = await fetchProviderValues(
    station,
    (provider) => !OBSERVATION_SOURCE_IDS.has(provider.id) && (limited || isOpenSource(provider)),
  )
  const baseline = await runLegacyHandler(handlerWeather, { lat: String(station.lat), lon: String(station.lon) })
  const hourly = baseline.ok ? (baseline.body as { hourly?: unknown })?.hourly : undefined

  const forConsensus: { open: boolean; series: any }[] = []
  inTransaction(db, () => {
    for (const { provider, result } of answers) {
      const value: any = result.status === 'fulfilled' ? result.value : null
      if (value?.providerStatus === 'not-applicable') continue
      const verified = value ? seriesToVerify(provider, value) : null
      const values = verified ? hourlyValues({ series: [verified.series] }) : null
      const usable = values && values.size > 0
      saveSnapshot(db, {
        station: station.id,
        source: provider.id,
        issued,
        delivered: Boolean(usable),
        reachHours: usable ? reachHours(values, issued) : null,
      })
      if (!usable) continue
      saveForecastRows(db, station.id, provider.id, issued, forecastRows(values, issued))
      if (verified?.inConsensus) forConsensus.push({ open: isOpenSource(provider), series: verified.series })
    }

    if (hourly) {
      const values = hourlyValues({ series: [], hourly })
      saveForecastRows(db, station.id, SOURCE_OPEN_METEO, issued, forecastRows(values, issued))
      saveSnapshot(db, { station: station.id, source: SOURCE_OPEN_METEO, issued, delivered: true, reachHours: reachHours(values, issued) })
    }

    const saveConsensus = (source: string, series: any[]) => {
      const values = hourlyValues({ series, hourly })
      if (!values.size) return
      saveForecastRows(db, station.id, source, issued, forecastRows(values, issued))
      saveSnapshot(db, { station: station.id, source, issued, delivered: true, reachHours: reachHours(values, issued) })
    }
    saveConsensus(SOURCE_CONSENSUS_OPEN, forConsensus.filter((entry) => entry.open).map((entry) => entry.series))
    if (limited) saveConsensus(SOURCE_CONSENSUS, forConsensus.map((entry) => entry.series))
  })
}

async function collectObservations(db: BenchmarkDb, errors: string[]) {
  for (const station of STATIONS) {
    try {
      saveObservations(db, station.id, await fetchRecentDays(station.id, Date.now()))
    } catch (error) {
      errors.push(`měření ${station.name}: ${errorText(error)}`)
    }
    await sleep(PAUSE_BETWEEN_OBSERVATION_FETCHES_MS)
  }
}

/** Failures are noted and shown on the page: a forecast benchmark must not take the API down with it. */
async function runSlot(db: BenchmarkDb, slotMs: number) {
  const errors: string[] = []
  for (const station of STATIONS) {
    try {
      await collectStation(db, station, slotMs)
    } catch (error) {
      errors.push(`${station.name}: ${errorText(error)}`)
    }
    await sleep(PAUSE_BETWEEN_STATIONS_MS)
  }
  try {
    await collectObservations(db, errors)
    const now = Math.floor(Date.now() / 1000)
    scoreForecasts(db, now)
    pruneForecasts(db, now)
  } catch (error) {
    errors.push(`vyhodnocení: ${errorText(error)}`)
  }
  setMeta(db, 'last_slot', String(slotMs))
  setMeta(db, 'last_run', new Date().toISOString())
  setMeta(db, 'last_errors', JSON.stringify(errors))
  if (errors.length) console.error('[benchmark]', errors.join('; '))
}

let archiveRunning = false

async function runArchive(db: BenchmarkDb) {
  if (archiveRunning) return
  archiveRunning = true
  try {
    await backfillArchive(db, Date.now())
  } catch (error) {
    console.error('[benchmark] archive', errorText(error))
  } finally {
    archiveRunning = false
  }
}

function schedule(db: BenchmarkDb) {
  const run = async () => {
    try {
      const now = Date.now()
      const due = latestSlot(now)
      const last = Number(getMeta(db, 'last_slot') ?? 0)
      if (last < due && (last === 0 || now - due < CATCH_UP_MS)) {
        await runSlot(db, due)
      }
    } catch (error) {
      // An unhandled rejection here would bring the whole API down, over a benchmark.
      console.error('[benchmark] slot', errorText(error))
    }
    // Resumes after a restart, picks up newly finished months and retries a failed one.
    void runArchive(db)
    setTimeout(run, Math.max(1000, nextSlot(Date.now()) - Date.now()))
  }
  void run()
}

let database: BenchmarkDb | null = null
let startError: string | null = null
let started = false

/** No-op without BENCHMARK_DATA_DIR, which only a host with lasting storage should set. */
export function ensureBenchmarkRunning() {
  const dir = process.env.BENCHMARK_DATA_DIR
  if (!dir || started) return
  started = true
  try {
    mkdirSync(dir, { recursive: true })
    database = openBenchmarkDb(join(dir, 'benchmark.sqlite'))
    schedule(database)
  } catch (error) {
    startError = error instanceof Error ? error.message : String(error)
    console.error('[benchmark] start failed:', startError)
  }
}

export function benchmarkDatabase() {
  return { db: database, startError }
}
