import { normalizeBrightsky } from './normalizers/brightsky';

// DWD stations are sparse near CZ/border; default radius is too tight for Praha.
const MAX_DIST_METERS = 100_000;

export async function fetchBrightsky(location) {
  const { lat, lon } = location;
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    max_dist: String(MAX_DIST_METERS),
  });
  const response = await fetch(`https://api.brightsky.dev/current_weather?${params}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error('Brightsky request failed.');
  }

  const data = await response.json();
  return normalizeBrightsky(data);
}
