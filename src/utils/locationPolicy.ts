type Coordinates = { lat: number; lon: number }
type RankedLocation = Coordinates & { source?: string; accuracyMeters?: number }

export const GPS_PLACEHOLDER_NAME = 'Moje poloha'

const RANK_BY_SOURCE: Record<string, number> = {
  default: 0,
  language: 1,
  timezone: 1,
  'vercel-country': 1,
  'cloudflare-country': 1,
  ip: 2,
  geojs: 2,
  vercel: 2,
  cloudflare: 2,
  gps: 3,
}
/** A place the user picked by hand: automatic detection never overrides it. */
const MANUAL_RANK = 4
const GPS_RANK = RANK_BY_SOURCE.gps

const MIN_GPS_MOVE_M = 400
// IP lookups jump between nearby towns from one day to the next; that must not move the forecast.
const MIN_IP_MOVE_M = 15000
const KEEP_NAME_WITHIN_M = 5000

const TIMEZONE_CAPITALS: Record<string, { name: string } & Coordinates> = {
  'Europe/Prague': { name: 'Praha', lat: 50.0755, lon: 14.4378 },
  'Europe/Bratislava': { name: 'Bratislava', lat: 48.1486, lon: 17.1077 },
  'Europe/Vienna': { name: 'Vídeň', lat: 48.2082, lon: 16.3738 },
  'Europe/Berlin': { name: 'Berlín', lat: 52.52, lon: 13.405 },
  'Europe/Warsaw': { name: 'Varšava', lat: 52.2297, lon: 21.0122 },
  'Europe/Budapest': { name: 'Budapešť', lat: 47.4979, lon: 19.0402 },
  'Europe/Ljubljana': { name: 'Lublaň', lat: 46.0569, lon: 14.5058 },
  'Europe/Zagreb': { name: 'Záhřeb', lat: 45.815, lon: 15.9819 },
  'Europe/Rome': { name: 'Řím', lat: 41.9028, lon: 12.4964 },
  'Europe/Paris': { name: 'Paříž', lat: 48.8566, lon: 2.3522 },
  'Europe/Madrid': { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  'Europe/Amsterdam': { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  'Europe/Brussels': { name: 'Brusel', lat: 50.8503, lon: 4.3517 },
  'Europe/Zurich': { name: 'Curych', lat: 47.3769, lon: 8.5417 },
  'Europe/London': { name: 'Londýn', lat: 51.5074, lon: -0.1278 },
  'Europe/Kyiv': { name: 'Kyjev', lat: 50.4501, lon: 30.5234 },
  'Europe/Bucharest': { name: 'Bukurešť', lat: 44.4268, lon: 26.1025 },
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

export function distanceMeters(a: Coordinates, b: Coordinates) {
  const latDelta = toRadians(b.lat - a.lat)
  const lonDelta = toRadians(b.lon - a.lon)
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lonDelta / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

export function locationRank(location: { source?: string }) {
  return RANK_BY_SOURCE[location.source ?? ''] ?? MANUAL_RANK
}

export function isAutoLocation(location: { source?: string }) {
  return locationRank(location) < MANUAL_RANK
}

export function isPreciseLocation(location: { source?: string }) {
  return locationRank(location) >= GPS_RANK
}

/**
 * 'move' changes the coordinates (new weather, new photo), 'refine' only updates how we know them.
 * A fix must beat its own uncertainty: a 2 km radius reading is no evidence of a 1 km move.
 */
export function decidePublish(current: RankedLocation, next: RankedLocation): 'move' | 'refine' | 'ignore' {
  const currentRank = locationRank(current)
  const nextRank = locationRank(next)
  if (nextRank < currentRank) return 'ignore'

  const moved = distanceMeters(current, next)
  if (nextRank > currentRank) return moved >= MIN_GPS_MOVE_M ? 'move' : 'refine'

  if (nextRank === GPS_RANK) {
    if (moved >= Math.max(MIN_GPS_MOVE_M, next.accuracyMeters ?? 0)) return 'move'
    return (next.accuracyMeters ?? Infinity) < (current.accuracyMeters ?? Infinity) ? 'refine' : 'ignore'
  }
  return moved >= MIN_IP_MOVE_M ? 'move' : 'ignore'
}

export function canKeepPlaceName(current: RankedLocation, next: Coordinates) {
  return locationRank(current) > 0 && distanceMeters(current, next) < KEEP_NAME_WITHIN_M
}

export function guessLocationFromTimezone(timeZone: string | undefined) {
  const capital = timeZone ? TIMEZONE_CAPITALS[timeZone] : null
  return capital ? { ...capital, source: 'timezone' } : null
}

/** UI language of the browser — weaker than a time zone, useful when the zone is UTC or unknown. */
const LANGUAGE_CAPITALS: Record<string, { name: string } & Coordinates> = {
  cs: { name: 'Praha', lat: 50.0755, lon: 14.4378 },
  sk: { name: 'Bratislava', lat: 48.1486, lon: 17.1077 },
  de: { name: 'Berlín', lat: 52.52, lon: 13.405 },
  pl: { name: 'Varšava', lat: 52.2297, lon: 21.0122 },
  hu: { name: 'Budapešť', lat: 47.4979, lon: 19.0402 },
  sl: { name: 'Lublaň', lat: 46.0569, lon: 14.5058 },
  hr: { name: 'Záhřeb', lat: 45.815, lon: 15.9819 },
  it: { name: 'Řím', lat: 41.9028, lon: 12.4964 },
  fr: { name: 'Paříž', lat: 48.8566, lon: 2.3522 },
  es: { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  nl: { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  uk: { name: 'Kyjev', lat: 50.4501, lon: 30.5234 },
  ro: { name: 'Bukurešť', lat: 44.4268, lon: 26.1025 },
}

export function guessLocationFromLanguage(language: string | undefined) {
  const primary = String(language || '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0]
  if (!primary) return null
  const capital = LANGUAGE_CAPITALS[primary]
  return capital ? { ...capital, source: 'language' } : null
}

/** Time zone first (Europe/Prague), then UI language (cs). */
export function guessWeakLocation(timeZone?: string, language?: string) {
  return guessLocationFromTimezone(timeZone) || guessLocationFromLanguage(language)
}
