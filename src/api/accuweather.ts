import { normalizeAccuweather } from './normalizers/accuweather';

export async function fetchAccuweather(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/accuweather?${params}`);
  if (!response.ok) throw new Error('AccuWeather request failed.');
  return normalizeAccuweather(await response.json());
}
