/**
 * Prefer rivers unless the nearest sea/spot is strictly closer.
 */

export type WaterPriorityMode = 'rivers' | 'seas'

export function riverStationDistance(station: { distance?: number; _dist?: number } | null | undefined) {
  const value = station?.distance ?? station?._dist
  return Number.isFinite(value) ? Number(value) : null
}

export function nearestDistanceKm(values: Array<number | null | undefined>) {
  const finite = values.filter((km): km is number => Number.isFinite(km))
  return finite.length ? Math.min(...finite) : null
}

/**
 * Seas win only when they are strictly closer than the nearest river station.
 * On a tie (or missing sea distance), rivers stay first.
 */
export function resolveWaterPriority({
  nearestRiverKm,
  nearestSeaKm,
  hasRivers,
  hasSeas,
}: {
  nearestRiverKm: number | null
  nearestSeaKm: number | null
  hasRivers: boolean
  hasSeas: boolean
}): WaterPriorityMode | null {
  if (hasRivers && hasSeas) {
    if (nearestSeaKm != null && (nearestRiverKm == null || nearestSeaKm < nearestRiverKm)) {
      return 'seas'
    }
    return 'rivers'
  }
  if (hasRivers) return 'rivers'
  if (hasSeas) return 'seas'
  return null
}
