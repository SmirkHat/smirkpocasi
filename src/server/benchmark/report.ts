import { PROVIDERS } from '../../config/providers'
import {
  DERIVED_SOURCE_NAMES,
  HORIZON_GROUPS,
  LEAD_BUCKETS,
  MIN_USEFUL_ETS,
  RAIN_WINDOW_HOURS,
  SOURCE_CONSENSUS_OPEN,
  STATIONS,
  TOLERANCE,
  isOpenSource,
} from './config'
import type { BenchmarkDataset, BenchmarkField } from './config'
import { emptyCounts, observedRainWindow } from './scoring'
import type { ScoreCell, ScoreCounts } from './scoring'
import { getMeta, readScores } from './store'
import type { BenchmarkDb } from './store'
import type { HourlyObservation } from './truth'

const MIN_PAIRS_PER_BUCKET = 30
const SECONDS_PER_DAY = 86_400

function addCounts(total: ScoreCounts, cell: ScoreCounts) {
  total.n += cell.n
  total.sumAbs += cell.sumAbs
  total.sumErr += cell.sumErr
  total.sumSq += cell.sumSq
  total.within += cell.within
  total.hits += cell.hits
  total.misses += cell.misses
  total.falseAlarms += cell.falseAlarms
  total.correctNegatives += cell.correctNegatives
}

function equitableThreatScore({ hits, misses, falseAlarms, correctNegatives }: ScoreCounts) {
  const total = hits + misses + falseAlarms + correctNegatives
  if (!total) return null
  const byChance = ((hits + falseAlarms) * (hits + misses)) / total
  const denominator = hits + misses + falseAlarms - byChance
  return denominator > 0 ? (hits - byChance) / denominator : null
}

function ratio(part: number, whole: number) {
  return whole > 0 ? part / whole : null
}

export function statistics(counts: ScoreCounts) {
  const { n, sumAbs, sumErr, sumSq, within, hits, misses, falseAlarms } = counts
  return {
    n,
    mae: ratio(sumAbs, n),
    bias: ratio(sumErr, n),
    rmse: n > 0 ? Math.sqrt(sumSq / n) : null,
    withinShare: ratio(within, n),
    ets: equitableThreatScore(counts),
    hitRate: ratio(hits, hits + misses),
    falseAlarmRatio: ratio(falseAlarms, hits + falseAlarms),
    frequencyBias: ratio(hits + falseAlarms, hits + misses),
  }
}

function sourceName(id: string) {
  return DERIVED_SOURCE_NAMES[id] ?? PROVIDERS.find((provider) => provider.id === id)?.name ?? id
}

function isRestricted(id: string) {
  const provider = PROVIDERS.find((candidate) => candidate.id === id)
  return Boolean(provider) && !isOpenSource(provider as { id: string })
}

/**
 * Sources are not sampled alike: commercial ones run at two stations only, and those errors differ
 * from a mountain station's. So each source is compared only on the station-months and leads it has.
 */
export function relativeToReference(cells: ScoreCell[], reference: ScoreCell[]) {
  const referenceByCell = new Map(reference.map((cell) => [`${cell.month}|${cell.station}|${cell.bucket}`, cell]))
  let own = 0
  let theirs = 0
  for (const cell of cells) {
    const match = referenceByCell.get(`${cell.month}|${cell.station}|${cell.bucket}`)
    if (!match?.n) continue
    own += cell.sumAbs
    theirs += (match.sumAbs / match.n) * cell.n
  }
  return theirs > 0 ? own / theirs - 1 : null
}

/** How far ahead the source stays useful, walking outward until a bucket misses the limit or has too little data. */
export function usefulHorizon(field: BenchmarkField, curve: { bucket: number; stats: ReturnType<typeof statistics> }[]) {
  let horizon = 0
  for (const { bucket, stats } of curve) {
    if (stats.n < MIN_PAIRS_PER_BUCKET) {
      if (field === 'rain' && bucket <= 6) continue
      break
    }
    const good =
      field === 'rain' ? (stats.ets ?? -1) >= MIN_USEFUL_ETS : (stats.mae ?? Infinity) <= TOLERANCE[field]
    if (!good) break
    horizon = bucket
  }
  return horizon
}

function availability(db: BenchmarkDb, station: string | null) {
  const rows = db
    .prepare(
      `SELECT source, COUNT(*) AS attempts, SUM(delivered) AS delivered, MAX(reach_hours) AS reach,
              COUNT(DISTINCT issued / ${SECONDS_PER_DAY}) AS days
       FROM snapshot ${station ? 'WHERE station = ?' : ''} GROUP BY source`,
    )
    .all(...(station ? [station] : [])) as unknown as { source: string; attempts: number; delivered: number; reach: number | null; days: number }[]
  return new Map(rows.map((row) => [row.source, row]))
}

function collectionStatus(db: BenchmarkDb) {
  const span = db.prepare('SELECT MIN(issued) AS first, MAX(issued) AS last, COUNT(DISTINCT issued) AS snapshots FROM snapshot').get() as {
    first: number | null
    last: number | null
    snapshots: number
  }
  const live = db.prepare("SELECT COALESCE(SUM(n), 0) AS pairs FROM score WHERE dataset = 'live'").get() as { pairs: number }
  const archive = db.prepare("SELECT COALESCE(SUM(n), 0) AS pairs FROM score WHERE dataset = 'archive'").get() as { pairs: number }
  return {
    firstSnapshot: span.first,
    lastSnapshot: span.last,
    snapshots: span.snapshots,
    livePairs: live.pairs,
    archivePairs: archive.pairs,
    lastRun: getMeta(db, 'last_run'),
    lastErrors: JSON.parse(getMeta(db, 'last_errors') ?? '[]') as string[],
  }
}

export function benchmarkReport(
  db: BenchmarkDb,
  filter: { dataset: BenchmarkDataset; field: BenchmarkField; station: string | null; month: string | null },
) {
  const cells = readScores(db, filter)
  const reference = cells.filter((cell) => cell.source === SOURCE_CONSENSUS_OPEN)
  const bySource = new Map<string, ScoreCell[]>()
  for (const cell of cells) {
    const list = bySource.get(cell.source) ?? []
    list.push(cell)
    bySource.set(cell.source, list)
  }
  const snapshots = filter.dataset === 'live' ? availability(db, filter.station) : new Map()

  const summarize = (list: ScoreCell[]) => {
    const total = emptyCounts()
    list.forEach((cell) => addCounts(total, cell))
    return { ...statistics(total), vsReference: relativeToReference(list, reference) }
  }

  const sources = [...bySource.entries()].map(([id, sourceCells]) => {
    const curve = LEAD_BUCKETS.flatMap(({ id: bucket }) => {
      const inBucket = sourceCells.filter((cell) => cell.bucket === bucket)
      return inBucket.length ? [{ bucket, stats: summarize(inBucket) }] : []
    })
    const snapshot = snapshots.get(id)
    return {
      id,
      name: sourceName(id),
      restricted: isRestricted(id),
      groups: Object.fromEntries(
        HORIZON_GROUPS.map(({ id: group, buckets }) => [
          group,
          summarize(sourceCells.filter((cell) => buckets.includes(cell.bucket))),
        ]),
      ),
      curve,
      horizonHours: usefulHorizon(filter.field, curve),
      reachHours: snapshot?.reach ?? Math.max(...curve.map((point) => point.bucket)),
      availability: snapshot ? ratio(snapshot.delivered, snapshot.attempts) : null,
      days: snapshot?.days ?? null,
    }
  })

  const unavailable = [...snapshots.entries()]
    .filter(([id, snapshot]) => !snapshot.delivered && !bySource.has(id))
    .map(([id]) => sourceName(id))

  const months = (
    db.prepare('SELECT DISTINCT month FROM score WHERE dataset = ? ORDER BY month DESC').all(filter.dataset) as unknown as { month: string }[]
  ).map((row) => row.month)

  return {
    enabled: true,
    filter,
    status: collectionStatus(db),
    stations: STATIONS.map(({ id, name }) => ({ id, name })),
    months,
    buckets: LEAD_BUCKETS,
    groups: HORIZON_GROUPS.map(({ id, label }) => ({ id, label })),
    sources,
    unavailable,
    generatedAt: new Date().toISOString(),
  }
}

/** Rain forecasts are six-hour totals, so the measured side has to be one as well. */
function observedForTarget(db: BenchmarkDb, filter: { station: string; valid: number; field: BenchmarkField }) {
  const rows = db
    .prepare('SELECT valid, temperature, wind, rain FROM observation WHERE station = ? AND valid BETWEEN ? AND ?')
    .all(filter.station, filter.valid - RAIN_WINDOW_HOURS * 3600, filter.valid) as unknown as (HourlyObservation & { valid: number })[]
  const byHour = new Map(rows.map((row) => [row.valid, row]))
  if (filter.field === 'rain') return observedRainWindow((hour) => byHour.get(hour), filter.valid)
  return byHour.get(filter.valid)?.[filter.field] ?? null
}

/** What each open source said about one hour, issue by issue. Commercial raw values stay out of this public view. */
export function targetReport(db: BenchmarkDb, filter: { station: string; valid: number; field: BenchmarkField }) {
  const column = filter.field
  const rows = db
    .prepare(`SELECT source, issued, ${column} AS value FROM forecast WHERE station = ? AND valid = ? AND ${column} IS NOT NULL ORDER BY issued`)
    .all(filter.station, filter.valid) as unknown as { source: string; issued: number; value: number }[]
  const series = new Map<string, { id: string; name: string; points: { leadHours: number; value: number }[] }>()
  for (const row of rows) {
    if (isRestricted(row.source)) continue
    let entry = series.get(row.source)
    if (!entry) {
      entry = { id: row.source, name: sourceName(row.source), points: [] }
      series.set(row.source, entry)
    }
    entry.points.push({ leadHours: Math.round((filter.valid - row.issued) / 3600), value: row.value })
  }
  return { valid: filter.valid, station: filter.station, field: filter.field, observed: observedForTarget(db, filter), series: [...series.values()] }
}
