const NOW_BASE = 'https://opendata.chmi.cz/meteorology/climate/now/data'
const RECENT_BASE = 'https://opendata.chmi.cz/meteorology/climate/recent/data/10min'
const REQUEST_TIMEOUT_MS = 30_000
const SAMPLES_PER_HOUR = 6
const MS_PER_HOUR = 3_600_000

export type HourlyObservation = { temperature: number | null; wind: number | null; rain: number | null }

const PLAUSIBLE: Record<string, [number, number]> = {
  T: [-50, 50],
  F: [0, 80],
  SRA10M: [0, 60],
}

function plausibleNumber(element: string, value: unknown) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  const [min, max] = PLAUSIBLE[element]
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function ensureHour(hours: Map<number, HourlyObservation>, hour: number) {
  let row = hours.get(hour)
  if (!row) {
    row = { temperature: null, wind: null, rain: null }
    hours.set(hour, row)
  }
  return row
}

/**
 * Reduces ČHMÚ's 10-minute rows to hours: instant temperature and wind at the full hour,
 * rain summed over the hour ending there, and only when all six samples arrived.
 * Keys are epoch seconds of the full hour.
 */
export function hourlyObservations(rows: unknown[][]) {
  const hours = new Map<number, HourlyObservation>()
  const rainSamples = new Map<number, number[]>()

  for (const [, element, dt, rawValue] of rows) {
    const code = String(element)
    if (!(code in PLAUSIBLE)) continue
    const value = plausibleNumber(code, rawValue)
    const time = Date.parse(String(dt))
    if (value === null || !Number.isFinite(time)) continue

    if (code === 'SRA10M') {
      const hourEnd = (Math.ceil(time / MS_PER_HOUR) * MS_PER_HOUR) / 1000
      const samples = rainSamples.get(hourEnd) ?? []
      samples.push(value)
      rainSamples.set(hourEnd, samples)
      continue
    }
    if (time % MS_PER_HOUR !== 0) continue
    const row = ensureHour(hours, time / 1000)
    if (code === 'T') row.temperature = value
    else row.wind = value * 3.6
  }

  for (const [hour, samples] of rainSamples) {
    if (samples.length !== SAMPLES_PER_HOUR) continue
    ensureHour(hours, hour).rain = samples.reduce((sum, value) => sum + value, 0)
  }
  return hours
}

async function fetchRows(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`ČHMÚ ${response.status}`)
  const json = await response.json()
  const rows = json?.data?.data?.values
  return Array.isArray(rows) ? (rows as unknown[][]) : null
}

/** The live feed keeps three daily files per station, so a short outage loses nothing. */
export async function fetchRecentDays(stationId: string, nowMs: number) {
  const rows: unknown[][] = []
  for (const daysAgo of [2, 1, 0]) {
    const stamp = new Date(nowMs - daysAgo * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '')
    const dayRows = await fetchRows(`${NOW_BASE}/10m-0-20000-0-${stationId}-${stamp}.json`)
    if (dayRows) rows.push(...dayRows)
  }
  return hourlyObservations(rows)
}

/** `month` is `YYYY-MM`. Null until ČHMÚ publishes the finished month. */
export async function fetchFinishedMonth(stationId: string, month: string) {
  const [year, monthNumber] = month.split('-')
  const rows = await fetchRows(`${RECENT_BASE}/${monthNumber}/10m-0-20000-0-${stationId}-${year}${monthNumber}.json`)
  return rows ? hourlyObservations(rows) : null
}
