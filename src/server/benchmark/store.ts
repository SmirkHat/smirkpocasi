import type { DatabaseSync } from 'node:sqlite'
import type { ForecastRow } from './series'
import type { ScoreCell, ScoreSheet } from './scoring'
import type { HourlyObservation } from './truth'

export type BenchmarkDb = DatabaseSync

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS forecast (
    station TEXT NOT NULL,
    source TEXT NOT NULL,
    issued INTEGER NOT NULL,
    valid INTEGER NOT NULL,
    temperature REAL,
    wind REAL,
    rain REAL,
    scored INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (station, source, issued, valid)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS forecast_unscored ON forecast (valid) WHERE scored = 0;
  CREATE INDEX IF NOT EXISTS forecast_target ON forecast (station, valid);
  CREATE TABLE IF NOT EXISTS observation (
    station TEXT NOT NULL,
    valid INTEGER NOT NULL,
    temperature REAL,
    wind REAL,
    rain REAL,
    PRIMARY KEY (station, valid)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS score (
    dataset TEXT NOT NULL,
    month TEXT NOT NULL,
    station TEXT NOT NULL,
    source TEXT NOT NULL,
    field TEXT NOT NULL,
    bucket INTEGER NOT NULL,
    n INTEGER NOT NULL,
    sum_abs REAL NOT NULL,
    sum_err REAL NOT NULL,
    sum_sq REAL NOT NULL,
    within INTEGER NOT NULL,
    hits INTEGER NOT NULL,
    misses INTEGER NOT NULL,
    false_alarms INTEGER NOT NULL,
    correct_negatives INTEGER NOT NULL,
    PRIMARY KEY (dataset, month, station, source, field, bucket)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS snapshot (
    station TEXT NOT NULL,
    source TEXT NOT NULL,
    issued INTEGER NOT NULL,
    delivered INTEGER NOT NULL,
    reach_hours INTEGER,
    PRIMARY KEY (station, source, issued)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
`

/** Reached through getBuiltinModule so bundlers on hosts without it (Vercel, Workers) never try to resolve it. */
export function openBenchmarkDb(path: string): BenchmarkDb {
  const sqlite = process.getBuiltinModule('node:sqlite')
  const db = new sqlite.DatabaseSync(path)
  db.exec(SCHEMA)
  return db
}

export function inTransaction<T>(db: BenchmarkDb, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function getMeta(db: BenchmarkDb, key: string) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(db: BenchmarkDb, key: string, value: string) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function saveForecastRows(db: BenchmarkDb, station: string, source: string, issued: number, rows: ForecastRow[]) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO forecast (station, source, issued, valid, temperature, wind, rain) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const row of rows) insert.run(station, source, issued, row.valid, row.temperature, row.wind, row.rain)
}

export function saveSnapshot(
  db: BenchmarkDb,
  snapshot: { station: string; source: string; issued: number; delivered: boolean; reachHours: number | null },
) {
  db.prepare('INSERT OR REPLACE INTO snapshot (station, source, issued, delivered, reach_hours) VALUES (?, ?, ?, ?, ?)').run(
    snapshot.station,
    snapshot.source,
    snapshot.issued,
    snapshot.delivered ? 1 : 0,
    snapshot.reachHours,
  )
}

/** A later fetch may complete an hour, but must not wipe a value an earlier one already had. */
export function saveObservations(db: BenchmarkDb, station: string, hours: Map<number, HourlyObservation>) {
  const upsert = db.prepare(`
    INSERT INTO observation (station, valid, temperature, wind, rain) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (station, valid) DO UPDATE SET
      temperature = COALESCE(excluded.temperature, temperature),
      wind = COALESCE(excluded.wind, wind),
      rain = COALESCE(excluded.rain, rain)
  `)
  inTransaction(db, () => {
    for (const [valid, hour] of hours) upsert.run(station, valid, hour.temperature, hour.wind, hour.rain)
  })
}

export function saveScores(db: BenchmarkDb, sheet: ScoreSheet) {
  const upsert = db.prepare(`
    INSERT INTO score (dataset, month, station, source, field, bucket, n, sum_abs, sum_err, sum_sq, within, hits, misses, false_alarms, correct_negatives)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (dataset, month, station, source, field, bucket) DO UPDATE SET
      n = n + excluded.n,
      sum_abs = sum_abs + excluded.sum_abs,
      sum_err = sum_err + excluded.sum_err,
      sum_sq = sum_sq + excluded.sum_sq,
      within = within + excluded.within,
      hits = hits + excluded.hits,
      misses = misses + excluded.misses,
      false_alarms = false_alarms + excluded.false_alarms,
      correct_negatives = correct_negatives + excluded.correct_negatives
  `)
  for (const cell of sheet.values()) {
    upsert.run(
      cell.dataset, cell.month, cell.station, cell.source, cell.field, cell.bucket,
      cell.n, cell.sumAbs, cell.sumErr, cell.sumSq, cell.within,
      cell.hits, cell.misses, cell.falseAlarms, cell.correctNegatives,
    )
  }
}

export function readScores(
  db: BenchmarkDb,
  filter: { dataset: string; field: string; station: string | null; month: string | null },
): ScoreCell[] {
  const clauses = ['dataset = ?', 'field = ?']
  const params: string[] = [filter.dataset, filter.field]
  if (filter.station) {
    clauses.push('station = ?')
    params.push(filter.station)
  }
  if (filter.month) {
    clauses.push('month = ?')
    params.push(filter.month)
  }
  const rows = db
    .prepare(
      `SELECT dataset, month, station, source, field, bucket, n,
              sum_abs AS sumAbs, sum_err AS sumErr, sum_sq AS sumSq, within,
              hits, misses, false_alarms AS falseAlarms, correct_negatives AS correctNegatives
       FROM score WHERE ${clauses.join(' AND ')}`,
    )
    .all(...params)
  return rows as unknown as ScoreCell[]
}
