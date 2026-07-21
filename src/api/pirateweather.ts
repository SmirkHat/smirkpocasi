import { normalizePirateWeather } from './normalizers/pirateweather';
import { apiUrl } from '@/lib/apiBase'

export async function fetchPirateWeather(location) {
  const response = await fetch(apiUrl(`/api/pirateweather?lat=${location.lat}&lon=${location.lon}`));

  if (!response.ok) throw new Error('Pirate Weather request failed.');

  return normalizePirateWeather(await response.json());
}
