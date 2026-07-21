import { normalizeAccuweather } from './normalizers/accuweather';
import { apiUrl } from '@/lib/apiBase'

export async function fetchAccuweather(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/accuweather?${params}`));
  if (!response.ok) throw new Error('AccuWeather request failed.');
  return normalizeAccuweather(await response.json());
}
