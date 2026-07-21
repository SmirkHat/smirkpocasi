import { normalizeWeatherCom } from './normalizers/weathercom';
import { apiUrl } from '@/lib/apiBase'

export async function fetchWeatherCom(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/weathercom?${params}`));

  if (!response.ok) throw new Error('Weather.com request failed.');

  return normalizeWeatherCom(await response.json());
}
