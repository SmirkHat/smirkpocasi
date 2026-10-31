import { BENCHMARK_FIELDS, STATIONS } from '../src/server/benchmark/config'
import type { BenchmarkDataset, BenchmarkField } from '../src/server/benchmark/config'

const SECONDS_PER_HOUR = 3600

function pickField(value: unknown): BenchmarkField {
  return BENCHMARK_FIELDS.includes(value as BenchmarkField) ? (value as BenchmarkField) : 'temperature'
}

function pickStation(value: unknown) {
  return STATIONS.some((station) => station.id === value) ? String(value) : null
}

function pickMonth(value: unknown) {
  return /^\d{4}-\d{2}$/.test(String(value)) ? String(value) : null
}

export default async function handler(req, res) {
  if (!process.env.BENCHMARK_DATA_DIR) {
    res.setHeader('Cache-Control', 'public, s-maxage=300')
    return res.status(200).json({ enabled: false })
  }

  // Loaded on demand so hosts without the benchmark never pull the whole provider fan-in into this route.
  const { benchmarkDatabase, ensureBenchmarkRunning } = await import('../src/server/benchmark/collector')
  ensureBenchmarkRunning()
  const { db, startError } = benchmarkDatabase()
  if (!db) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ enabled: false, error: startError })
  }

  const { benchmarkReport, targetReport } = await import('../src/server/benchmark/report')
  const field = pickField(req.query.field)
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')

  if (req.query.view === 'target') {
    const station = pickStation(req.query.station) ?? STATIONS[0].id
    const valid = Number(req.query.valid)
    if (!Number.isInteger(valid) || valid % SECONDS_PER_HOUR !== 0) {
      return res.status(400).json({ error: 'Parametr valid musí být celá hodina v epoch sekundách.' })
    }
    return res.status(200).json(targetReport(db, { station, valid, field }))
  }

  const dataset: BenchmarkDataset = req.query.dataset === 'archive' ? 'archive' : 'live'
  return res.status(200).json(
    benchmarkReport(db, { dataset, field, station: pickStation(req.query.station), month: pickMonth(req.query.month) }),
  )
}
