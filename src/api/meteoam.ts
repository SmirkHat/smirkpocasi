import { normalizeMeteoam } from './normalizers/meteoam';
import { apiUrl } from '@/lib/apiBase'

export async function fetchMeteoam(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/meteoam?${params}`));
  if (!response.ok) throw new Error('Meteo AM request failed.');
  return normalizeMeteoam(await response.json());
}
