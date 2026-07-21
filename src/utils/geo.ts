/** Approximate Czechia bbox with a small border margin. */
export const CZ_COVERAGE_BOUNDS = {
  latMin: 48.0,
  latMax: 51.6,
  lonMin: 11.5,
  lonMax: 19.6
};

/** Hydro coverage — union of regional source footprints. */
export const HYDRO_COVERAGE_REGIONS = [
  { latMin: 47.2, latMax: 55.2, lonMin: 5.7, lonMax: 24.2 },
  { latMin: 41.0, latMax: 51.5, lonMin: -5.5, lonMax: 10.0 },
  { latMin: 49.5, latMax: 61.0, lonMin: -10.7, lonMax: 2.0 },
  { latMin: 24.0, latMax: 49.5, lonMin: -125.0, lonMax: -66.0 },
  { latMin: 41.5, latMax: 70.0, lonMin: -141.0, lonMax: -52.0 },
  { latMin: 45.7, latMax: 47.9, lonMin: 5.8, lonMax: 10.6 },
];

/** @deprecated Prefer HYDRO_COVERAGE_REGIONS. */
export const HYDRO_COVERAGE_BOUNDS = HYDRO_COVERAGE_REGIONS[0];

/** CHMI MAX_Z composite footprint (EPSG:4326) for radar ImageOverlay. */
export const CHMI_RADAR_BOUNDS = {
  latMin: 48.047,
  latMax: 52.167,
  lonMin: 11.267,
  lonMax: 20.77
};

/** Reject CHMI station hits farther than this even inside the bbox. */
export const CHMI_MAX_STATION_KM = 150;

function pointInBounds(lat, lon, bounds) {
  return (
    lat >= bounds.latMin &&
    lat <= bounds.latMax &&
    lon >= bounds.lonMin &&
    lon <= bounds.lonMax
  );
}

export function locationInCzechiaCoverage(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return pointInBounds(lat, lon, CZ_COVERAGE_BOUNDS);
}

export function locationInHydroCoverage(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return HYDRO_COVERAGE_REGIONS.some((bounds) => pointInBounds(lat, lon, bounds));
}

export function locationInChmiRadarCoverage(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return pointInBounds(lat, lon, CHMI_RADAR_BOUNDS);
}

export function isNearbyChmiStation(distanceKm, maxKm = CHMI_MAX_STATION_KM) {
  return Number.isFinite(distanceKm) && distanceKm <= maxKm;
}
