import { normalizePirateWeather } from './normalizers/pirateweather';

export async function fetchPirateWeather(location) {
  const response = await fetch(`/api/pirateweather?lat=${location.lat}&lon=${location.lon}`);

  if (!response.ok) throw new Error('Pirate Weather request failed.');

  return normalizePirateWeather(await response.json());
}
