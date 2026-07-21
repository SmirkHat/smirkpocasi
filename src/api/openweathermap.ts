import { normalizeOpenWeatherMap } from './normalizers/openweathermap';

export async function fetchOpenWeatherMap(location) {
  const response = await fetch(`/api/openweathermap?lat=${location.lat}&lon=${location.lon}`);

  if (!response.ok) throw new Error('OpenWeatherMap request failed.');

  return normalizeOpenWeatherMap(await response.json());
}
