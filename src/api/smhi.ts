import { normalizeSmhi } from './normalizers/smhi';
import { apiUrl } from '@/lib/apiBase'

export async function fetchSmhi(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/smhi?${params}`));
  if (!response.ok) throw new Error('SMHI request failed.');
  return normalizeSmhi(await response.json());
}
