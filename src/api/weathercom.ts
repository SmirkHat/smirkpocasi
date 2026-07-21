import { normalizeWeatherCom } from './normalizers/weathercom';

export async function fetchWeatherCom(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/weathercom?${params}`);

  if (!response.ok) throw new Error('Weather.com request failed.');

  return normalizeWeatherCom(await response.json());
}
