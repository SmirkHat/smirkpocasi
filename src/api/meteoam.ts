import { normalizeMeteoam } from './normalizers/meteoam';

export async function fetchMeteoam(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/meteoam?${params}`);
  if (!response.ok) throw new Error('Meteo AM request failed.');
  return normalizeMeteoam(await response.json());
}
