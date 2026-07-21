import { normalizeTomorrowio } from './normalizers/tomorrowio';

export async function fetchTomorrowio(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/tomorrowio?${params}`);
  if (!response.ok) throw new Error('Tomorrow.io request failed.');
  return normalizeTomorrowio(await response.json());
}
