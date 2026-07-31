/** Shared robust consensus math (current weather + hourly forecast). */

export type WeightedValue = {
  value: number
  weight: number
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function weightedMedian(entries: WeightedValue[]): number | null {
  const usable = entries.filter(
    (entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0,
  )
  if (!usable.length) return null

  const sorted = [...usable].sort((a, b) => a.value - b.value)
  const totalWeight = sorted.reduce((sum, entry) => sum + entry.weight, 0)
  let weightSoFar = 0

  for (const entry of sorted) {
    weightSoFar += entry.weight
    if (weightSoFar >= totalWeight / 2) return entry.value
  }

  return sorted[sorted.length - 1].value
}

export function weightedStandardDeviation(entries: WeightedValue[]): number {
  const usable = entries.filter(
    (entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0,
  )
  if (usable.length < 2) return 0

  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0)
  const average = usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight
  const variance =
    usable.reduce((sum, entry) => sum + (entry.value - average) ** 2 * entry.weight, 0) / totalWeight
  return Math.sqrt(variance)
}

export function weightedCircularMean(entries: WeightedValue[]): number | null {
  const usable = entries.filter(
    (entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0,
  )
  if (!usable.length) return null

  const vector = usable.reduce(
    (sum, entry) => {
      const radians = (entry.value * Math.PI) / 180
      return {
        sin: sum.sin + Math.sin(radians) * entry.weight,
        cos: sum.cos + Math.cos(radians) * entry.weight,
      }
    },
    { sin: 0, cos: 0 },
  )

  if (Math.abs(vector.sin) < 0.0001 && Math.abs(vector.cos) < 0.0001) {
    return weightedMedian(usable)
  }
  return ((Math.atan2(vector.sin, vector.cos) * 180) / Math.PI + 360) % 360
}

/**
 * Drop values far from the weighted median (MAD-based), same rule as current-weather consensus.
 * Needs ≥4 entries and a baseTolerance; otherwise returns input unchanged.
 */
export function partitionOutliers<T extends WeightedValue>(
  entries: T[],
  baseTolerance: number | undefined,
): { kept: T[]; rejected: T[] } {
  const usable = entries.filter(
    (entry): entry is T =>
      Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0,
  )
  if (usable.length < 4 || !baseTolerance) {
    return { kept: usable, rejected: [] }
  }

  const center = weightedMedian(usable)
  if (center === null) return { kept: usable, rejected: [] }

  const mad = median(usable.map((entry) => Math.abs(entry.value - center))) || 0
  const tolerance = Math.max(baseTolerance, mad * 4)
  const kept = usable.filter((entry) => Math.abs(entry.value - center) <= tolerance)

  if (kept.length < Math.max(2, Math.ceil(usable.length / 2))) {
    return { kept: usable, rejected: [] }
  }

  const rejected = usable.filter((entry) => Math.abs(entry.value - center) > tolerance)
  return { kept, rejected }
}

export function withinLimits(value: number, limits?: [number, number]): boolean {
  if (!limits) return true
  return value >= limits[0] && value <= limits[1]
}

/** Weighted mode for discrete values (WMO weather codes). */
export function weightedMode(entries: WeightedValue[]): number | null {
  const counts = new Map<number, number>()
  for (const entry of entries) {
    if (!Number.isFinite(entry.value) || !Number.isFinite(entry.weight) || entry.weight <= 0) continue
    counts.set(entry.value, (counts.get(entry.value) || 0) + entry.weight)
  }
  if (!counts.size) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
}

/** Field tolerances / hard limits — shared by current + hourly consensus. */
export const ROBUST_FIELD = {
  temperature: { tolerance: 4, limits: [-70, 60] as [number, number] },
  precipitation: { tolerance: 3, limits: [0, 250] as [number, number] },
  precipitationProbability: { tolerance: 45, limits: [0, 100] as [number, number] },
  windSpeed: { tolerance: 18, limits: [0, 250] as [number, number] },
  windDirection: { limits: [0, 360] as [number, number] },
} as const

/**
 * Filter invalid + outliers, then weighted median (or circular mean for wind direction).
 */
export function robustAggregate(
  entries: WeightedValue[],
  options: {
    tolerance?: number
    limits?: [number, number]
    circular?: boolean
  } = {},
): number | null {
  const limited = entries.filter(
    (entry) =>
      Number.isFinite(entry.value) &&
      Number.isFinite(entry.weight) &&
      entry.weight > 0 &&
      withinLimits(entry.value, options.limits),
  )

  if (options.circular) {
    return weightedCircularMean(limited)
  }

  const { kept } = partitionOutliers(limited, options.tolerance)
  return weightedMedian(kept)
}
