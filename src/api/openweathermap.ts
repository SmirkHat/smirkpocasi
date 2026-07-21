import { normalizeOpenWeatherMap } from './normalizers/openweathermap';
import { apiUrl } from '@/lib/apiBase'

export async function fetchOpenWeatherMap(location) {
  const response = await fetch(apiUrl(`/api/openweathermap?lat=${location.lat}&lon=${location.lon}`));

  if (!response.ok) throw new Error('OpenWeatherMap request failed.');

  return normalizeOpenWeatherMap(await response.json());
}
