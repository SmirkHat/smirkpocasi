import { normalizeWeatherbit } from './normalizers/weatherbit';

export async function fetchWeatherbit(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/weatherbit?${params}`);
  if (!response.ok) throw new Error('Weatherbit request failed.');
  return normalizeWeatherbit(await response.json());
}
