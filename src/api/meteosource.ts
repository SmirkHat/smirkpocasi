import { normalizeMeteosource } from './normalizers/meteosource';

export async function fetchMeteosource(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/meteosource?${params}`);
  if (!response.ok) throw new Error('Meteosource request failed.');
  return normalizeMeteosource(await response.json());
}
