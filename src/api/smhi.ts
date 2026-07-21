import { normalizeSmhi } from './normalizers/smhi';

export async function fetchSmhi(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(`/api/smhi?${params}`);
  if (!response.ok) throw new Error('SMHI request failed.');
  return normalizeSmhi(await response.json());
}
