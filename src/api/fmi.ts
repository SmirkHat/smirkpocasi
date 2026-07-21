import { normalizeFmi } from './normalizers/fmi';

export async function fetchFmi(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/fmi?${params}`);
  if (!response.ok) throw new Error('FMI request failed.');
  return normalizeFmi(await response.json());
}
