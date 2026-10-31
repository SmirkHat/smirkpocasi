export type BenchmarkField = 'temperature' | 'wind' | 'rain'
export type BenchmarkDataset = 'live' | 'archive'

export const BENCHMARK_FIELDS: BenchmarkField[] = ['temperature', 'wind', 'rain']

export const STATIONS = [
  { id: '11518', name: 'Praha Ruzyně', lat: 50.100278, lon: 14.255556 },
  { id: '11723', name: 'Brno Tuřany', lat: 49.153056, lon: 16.688889 },
  { id: '11450', name: 'Plzeň', lat: 49.764722, lon: 13.378889 },
  { id: '11546', name: 'České Budějovice', lat: 48.951944, lon: 14.469722 },
  { id: '11603', name: 'Liberec', lat: 50.76972, lon: 15.02389 },
  { id: '11652', name: 'Pardubice', lat: 50.016111, lon: 15.740273 },
  { id: '11774', name: 'Holešov', lat: 49.320556, lon: 17.57 },
  { id: '11406', name: 'Cheb', lat: 50.068333, lon: 12.391389 },
  { id: '11698', name: 'Kuchařovice', lat: 48.881111, lon: 16.085278 },
  { id: '11710', name: 'Luká', lat: 49.652222, lon: 16.953333 },
  { id: '11683', name: 'Svratouch', lat: 49.735, lon: 16.034167 },
  { id: '11509', name: 'Doksany', lat: 50.45889, lon: 14.17 },
]

export type BenchmarkStation = (typeof STATIONS)[number]

export const SLOT_HOURS_UTC = [1, 7, 13, 19]
export const SLOT_MINUTE_UTC = 20

// Commercial and unofficial sources have daily quotas or no agreement at all. Four loads a day
// stay small next to real visitors, at the price of fewer samples than the open models get.
export const LIMITED_SOURCE_STATION_IDS = new Set(['11518', '11723'])
export const LIMITED_SOURCE_SLOT_HOURS_UTC = new Set([7, 19])

/** `id` is the bucket's upper bound in hours, so a one-day-old archived run lands in the same bucket as a live one. */
export const LEAD_BUCKETS = [
  { id: 3, label: '0–3 h' },
  { id: 6, label: '3–6 h' },
  { id: 12, label: '6–12 h' },
  { id: 24, label: '12–24 h' },
  { id: 48, label: '1–2 dny' },
  { id: 72, label: '2–3 dny' },
  { id: 96, label: '3–4 dny' },
  { id: 120, label: '4–5 dní' },
  { id: 144, label: '5–6 dní' },
  { id: 168, label: '6–7 dní' },
  { id: 240, label: '7–10 dní' },
]

export const HORIZON_GROUPS = [
  { id: 'short', label: 'Do 24 h', buckets: [3, 6, 12, 24] },
  { id: 'medium', label: '1–3 dny', buckets: [48, 72] },
  { id: 'long', label: '3–7 dní', buckets: [96, 120, 144, 168] },
]

export function leadBucket(leadHours: number) {
  if (leadHours < 0) return null
  return LEAD_BUCKETS.find((bucket) => leadHours <= bucket.id)?.id ?? null
}

/** Within these a forecast counts as a hit, and a source's reach ends where its average error passes them. */
export const TOLERANCE = { temperature: 2, wind: 5 }

// Single hours punish a shower forecast one hour off as both a miss and a false alarm, and sources
// disagree on whether a step's rain falls before or after its timestamp. Six hours absorbs both.
export const RAIN_WINDOW_HOURS = 6
export const RAIN_EVENT_MM = 0.5
export const MIN_USEFUL_ETS = 0.2
// Unheated gauges stay at zero through snowfall, so a cold window has no trustworthy rain total.
export const COLD_GAUGE_CELSIUS = 2

export const SOURCE_CONSENSUS = 'consensus'
export const SOURCE_CONSENSUS_OPEN = 'consensus_open'
export const SOURCE_PERSISTENCE = 'persistence'
export const SOURCE_OPEN_METEO = 'openmeteo'

export const DERIVED_SOURCE_NAMES: Record<string, string> = {
  [SOURCE_CONSENSUS]: 'Konsenzus (všechny zdroje)',
  [SOURCE_CONSENSUS_OPEN]: 'Konsenzus (otevřené zdroje)',
  [SOURCE_PERSISTENCE]: 'Včerejšek (naivní odhad)',
  [SOURCE_OPEN_METEO]: 'Open-Meteo Best Match',
}

/** Open-licence or official forecasts. Everything else is commercial or unofficial. */
export function isOpenSource(provider: { id: string; endpoint?: string; model?: string }) {
  return (
    Boolean(provider.endpoint) ||
    String(provider.model ?? '').includes('ensemble') ||
    provider.id === 'aladin' ||
    provider.id === 'yr'
  )
}

export const RAW_RETENTION_DAYS = 60
export const ARCHIVE_MONTHS = 3
