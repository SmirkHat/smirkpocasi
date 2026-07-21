import { normalizeXweather } from './normalizers/xweather';

export async function fetchXweather(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/xweather?${params}`);
  if (!response.ok) throw new Error('Xweather request failed.');
  return normalizeXweather(await response.json());
}
