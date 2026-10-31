import { PROVIDERS } from '../../config/providers'
import { ROBUST_FIELD, robustAggregate } from '../../utils/robustAggregate'
import { ARCHIVE_MONTHS, SOURCE_CONSENSUS_OPEN, SOURCE_PERSISTENCE, STATIONS } from './config'
import type { BenchmarkStation } from './config'
import { addForecastPairs, monthOf } from './scoring'
import type { ScoreSheet } from './scoring'
import { rainWindowTotal } from './series'
import { getMeta, inTransaction, saveObservations, saveScores, setMeta } from './store'
import type { BenchmarkDb } from './store'
import { fetchFinishedMonth } from './truth'
import type { HourlyObservation } from './truth'

const PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast'
const RUN_AGES_DAYS = [0, 1, 2, 3, 4, 5, 6]
const VARIABLES = { temperature: 'temperature_2m', wind: 'wind_speed_10m', rain: 'precipitation' }
const REQUEST_TIMEOUT_MS = 60_000
const SECONDS_PER_HOUR = 3600
// One month of all models weighs about 60 Open-Meteo calls. This keeps the backfill far from its limits,
// which the same server's visitors share.
const PAUSE_BETWEEN_REQUESTS_MS = 30_000
const PAUSE_AFTER_REFUSAL_MS = 120_000

/** Names differ here from the forecast endpoints, and ensemble means have no archive at all. */
const ARCHIVE_MODELS: Record<string, string> = {
  ecmwf_ifs: 'ecmwf_ifs',
  ecmwf_aifs: 'ecmwf_aifs025_single',
  icon_seamless: 'icon_seamless',
  icon_d2: 'icon_d2',
  arome: 'meteofrance_arome_france',
  arpege: 'meteofrance_arpege_europe',
  gfs: 'gfs_seamless',
  gem: 'gem_seamless',
  knmi_harmonie: 'knmi_harmonie_arome_europe',
  dmi_harmonie: 'dmi_harmonie_arome_europe',
}

type ArchiveResponse = { hourly?: Record<string, (string | number | null)[]> }
type ModelSource = { id: string; weight: number; model: string }

function archiveSources(): ModelSource[] {
  return PROVIDERS.filter((provider) => provider.enabled && provider.id in ARCHIVE_MODELS).map((provider) => ({
    id: provider.id,
    weight: provider.weight,
    model: ARCHIVE_MODELS[provider.id],
  }))
}

function variableName(variable: string, runAge: number, model: string) {
  return runAge === 0 ? `${variable}_${model}` : `${variable}_previous_day${runAge}_${model}`
}

function requestedVariables() {
  return Object.values(VARIABLES).flatMap((variable) =>
    RUN_AGES_DAYS.map((age) => (age === 0 ? variable : `${variable}_previous_day${age}`)),
  )
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

async function fetchArchivedRuns(station: BenchmarkStation, month: string, sources: ModelSource[]) {
  const { start, end } = monthBounds(month)
  const params = new URLSearchParams({
    latitude: String(station.lat),
    longitude: String(station.lon),
    hourly: requestedVariables().join(','),
    start_date: start,
    end_date: end,
    models: sources.map((source) => source.model).join(','),
    timezone: 'UTC',
  })
  const response = await fetch(`${PREVIOUS_RUNS_URL}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (response.status === 429) throw new RefusedError()
  if (!response.ok) throw new Error(`Open-Meteo archive ${response.status}`)
  return (await response.json()) as ArchiveResponse
}

class RefusedError extends Error {}

function hoursOf(times: (string | number | null)[]) {
  return times.map((time) => Date.parse(`${time}:00Z`) / 1000)
}

function consensusAt(values: (number | null)[], sources: ModelSource[], field: keyof typeof VARIABLES) {
  const entries = sources.flatMap((source, index) => {
    const value = values[index]
    return value === null || value === undefined ? [] : [{ value, weight: source.weight, source: source.id }]
  })
  const options = field === 'temperature' ? ROBUST_FIELD.temperature : field === 'wind' ? ROBUST_FIELD.windSpeed : ROBUST_FIELD.precipitation
  return entries.length ? robustAggregate(entries, options) : null
}

/** Rows in Previous Runs carry the age of the run, not an hour-exact lead, hence one bucket per day. */
export function scoreArchivedRuns(
  sheet: ScoreSheet,
  station: string,
  response: ArchiveResponse,
  sources: ModelSource[],
  observations: Map<number, HourlyObservation>,
) {
  const hourly = response.hourly ?? {}
  const hours = hoursOf(hourly.time ?? [])
  const observationAt = (hour: number) => observations.get(hour)

  for (const runAge of RUN_AGES_DAYS) {
    const bucket = (runAge + 1) * 24
    const series = (source: ModelSource, variable: string) => (hourly[variableName(variable, runAge, source.model)] ?? []) as (number | null)[]

    const perSource = sources.map((source) => {
      const rain = new Map<number, number | null>()
      series(source, VARIABLES.rain).forEach((value, index) => rain.set(hours[index], value))
      return { source, rain, temperature: series(source, VARIABLES.temperature), wind: series(source, VARIABLES.wind) }
    })
    const consensusRain = new Map<number, number | null>()
    for (const hour of hours) {
      consensusRain.set(hour, consensusAt(perSource.map((entry) => entry.rain.get(hour) ?? null), sources, 'rain'))
    }

    hours.forEach((hour, index) => {
      const month = monthOf(hour)
      for (const entry of perSource) {
        addForecastPairs(
          sheet,
          { dataset: 'archive', month, station, source: entry.source.id, bucket },
          {
            temperature: entry.temperature[index] ?? null,
            wind: entry.wind[index] ?? null,
            rain: rainWindowTotal((at) => entry.rain.get(at), hour),
          },
          hour,
          observationAt,
        )
      }
      addForecastPairs(
        sheet,
        { dataset: 'archive', month, station, source: SOURCE_CONSENSUS_OPEN, bucket },
        {
          temperature: consensusAt(perSource.map((entry) => entry.temperature[index] ?? null), sources, 'temperature'),
          wind: consensusAt(perSource.map((entry) => entry.wind[index] ?? null), sources, 'wind'),
          rain: rainWindowTotal((at) => consensusRain.get(at), hour),
        },
        hour,
        observationAt,
      )
      const reference = hour - (runAge + 1) * 24 * SECONDS_PER_HOUR
      addForecastPairs(
        sheet,
        { dataset: 'archive', month, station, source: SOURCE_PERSISTENCE, bucket },
        {
          temperature: observations.get(reference)?.temperature ?? null,
          wind: observations.get(reference)?.wind ?? null,
          rain: rainWindowTotal((at) => observations.get(at)?.rain, reference),
        },
        hour,
        observationAt,
      )
    })
  }
}

export function finishedMonths(nowMs: number, count = ARCHIVE_MONTHS) {
  const now = new Date(nowMs)
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - index, 1)).toISOString().slice(0, 7),
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** One request per station and month, remembered once done, so a restart resumes and each new month joins by itself. */
export async function backfillArchive(db: BenchmarkDb, nowMs: number) {
  const sources = archiveSources()
  for (const month of finishedMonths(nowMs)) {
    for (const station of STATIONS) {
      const doneKey = `archive:${station.id}:${month}`
      if (getMeta(db, doneKey)) continue
      const observations = await fetchFinishedMonth(station.id, month)
      if (!observations) continue
      try {
        const response = await fetchArchivedRuns(station, month, sources)
        const sheet: ScoreSheet = new Map()
        scoreArchivedRuns(sheet, station.id, response, sources, observations)
        saveObservations(db, station.id, observations)
        inTransaction(db, () => {
          saveScores(db, sheet)
          setMeta(db, doneKey, new Date().toISOString())
        })
      } catch (error) {
        if (!(error instanceof RefusedError)) throw error
        await sleep(PAUSE_AFTER_REFUSAL_MS)
      }
      await sleep(PAUSE_BETWEEN_REQUESTS_MS)
    }
  }
}
