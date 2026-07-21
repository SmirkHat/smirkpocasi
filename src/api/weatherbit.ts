import { normalizeWeatherbit } from './normalizers/weatherbit';
import { apiUrl } from '@/lib/apiBase'

export async function fetchWeatherbit(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/weatherbit?${params}`));
  if (!response.ok) throw new Error('Weatherbit request failed.');
  return normalizeWeatherbit(await response.json());
}
