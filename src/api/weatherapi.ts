import { normalizeWeatherApi } from './normalizers/weatherapi';
import { apiUrl } from '@/lib/apiBase'

export async function fetchWeatherApi(location) {
  const response = await fetch(apiUrl(`/api/weatherapi?lat=${location.lat}&lon=${location.lon}`));

  if (!response.ok) throw new Error('WeatherAPI.com request failed.');

  return normalizeWeatherApi(await response.json());
}
