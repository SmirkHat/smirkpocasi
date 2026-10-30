/** Shared robust consensus math (current weather + hourly forecast). */

export type WeightedValue = {
  value: number
  weight: number
}

export type AggregateExclusionReason = 'invalid' | 'outlier'

export type RobustAggregateDetails<T extends WeightedValue> = {
  value: number | null
  kept: T[]
  rejected: Array<{ entry: T; reason: AggregateExclusionReason }>
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
  const half = sorted.reduce((sum, entry) => sum + entry.weight, 0) / 2
  let weightSoFar = 0

  for (let index = 0; index < sorted.length; index += 1) {
    weightSoFar += sorted[index].weight
    // An exact split has no single middle member; taking the lower one would bias every even vote cold.
    if (Math.abs(weightSoFar - half) < 1e-9 && sorted[index + 1]) {
      return (sorted[index].value + sorted[index + 1].value) / 2
    }
    if (weightSoFar >= half) return sorted[index].value
  }

  return sorted[sorted.length - 1].value
}

export function weightedMean(entries: WeightedValue[]): number | null {
  let total = 0
  let totalWeight = 0
  for (const entry of entries) {
    if (!Number.isFinite(entry.value) || !Number.isFinite(entry.weight) || entry.weight <= 0) continue
    total += entry.value * entry.weight
    totalWeight += entry.weight
  }
  return totalWeight > 0 ? total / totalWeight : null
}

/**
 * Huber M-estimate: a weighted mean where far-off members are pulled in instead of counted in full.
 * A median of 20 models keeps only one member's value and jumps between members from run to run;
 * the mean verifies better, and clipping stops one bad source from dragging it.
 */
export function robustMean(entries: WeightedValue[]): number | null {
  const usable = entries.filter(
    (entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0,
  )
  const center = weightedMedian(usable)
  if (center === null) return null

  const deviation = weightedMedian(
    usable.map((entry) => ({ value: Math.abs(entry.value - center), weight: entry.weight })),
  )
  const clip = 1.345 * 1.4826 * (deviation ?? 0)
  if (clip === 0) return center

  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0)
  let estimate = center
  for (let step = 0; step < 5; step += 1) {
    const current = estimate
    estimate =
      usable.reduce(
        (sum, entry) => sum + Math.min(current + clip, Math.max(current - clip, entry.value)) * entry.weight,
        0,
      ) / totalWeight
  }
  return estimate
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

function weatherCodeGroup(code: number) {
  if (code <= 1) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  return 'rain'
}

/**
 * Vote on the kind of weather first, then on the exact code inside it. Sources describe the same
 * rain as 61, 63 or 80, so a flat vote splits them and hands the win to a lone "overcast".
 */
export function weatherCodeConsensus(entries: WeightedValue[]): number | null {
  const groups = new Map<string, WeightedValue[]>()
  for (const entry of entries) {
    if (!Number.isFinite(entry.value) || !Number.isFinite(entry.weight) || entry.weight <= 0) continue
    const group = weatherCodeGroup(entry.value)
    groups.set(group, [...(groups.get(group) || []), entry])
  }
  if (!groups.size) return null

  const groupWeight = (members: WeightedValue[]) => members.reduce((sum, entry) => sum + entry.weight, 0)
  const [strongest] = [...groups.values()].sort((a, b) => groupWeight(b) - groupWeight(a))
  return weightedMode(strongest)
}

/** Field tolerances / hard limits — shared by current + hourly consensus. */
export const ROBUST_FIELD = {
  temperature: { tolerance: 4, limits: [-70, 60] as [number, number] },
  // Rain is zero-inflated: with most models dry the median is 0 every hour, so a day of scattered
  // showers would sum to 0 mm. Only an absurd value counts as an outlier here.
  precipitation: { tolerance: 25, limits: [0, 250] as [number, number], mean: true },
  precipitationProbability: { tolerance: 45, limits: [0, 100] as [number, number], mean: true },
  windSpeed: { tolerance: 18, limits: [0, 250] as [number, number] },
  windDirection: { limits: [0, 360] as [number, number] },
} as const

/**
 * Filter invalid + outliers, then robust mean (or circular mean for wind direction).
 */
export function robustAggregate(
  entries: WeightedValue[],
  options: {
    tolerance?: number
    limits?: [number, number]
    circular?: boolean
    mean?: boolean
  } = {},
): number | null {
  return robustAggregateDetails(entries, options).value
}

/** Same consensus calculation as `robustAggregate`, with its audit trail. */
export function robustAggregateDetails<T extends WeightedValue>(
  entries: T[],
  options: {
    tolerance?: number
    limits?: [number, number]
    circular?: boolean
    mean?: boolean
  } = {},
): RobustAggregateDetails<T> {
  const limited: T[] = []
  const invalid: RobustAggregateDetails<T>['rejected'] = []
  for (const entry of entries) {
    const usable =
      Number.isFinite(entry.value) &&
      Number.isFinite(entry.weight) &&
      entry.weight > 0 &&
      withinLimits(entry.value, options.limits)
    if (usable) limited.push(entry)
    else invalid.push({ entry, reason: 'invalid' })
  }

  if (options.circular) {
    return {
      value: weightedCircularMean(limited),
      kept: limited,
      rejected: invalid,
    }
  }

  const { kept, rejected } = partitionOutliers(limited, options.tolerance)
  return {
    value: options.mean ? weightedMean(kept) : robustMean(kept),
    kept,
    rejected: [
      ...invalid,
      ...rejected.map((entry) => ({ entry, reason: 'outlier' as const })),
    ],
  }
}
