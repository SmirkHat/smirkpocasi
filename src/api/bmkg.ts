import { normalizeBmkg } from './normalizers/bmkg';
import { apiUrl } from '@/lib/apiBase'

export async function fetchBmkg(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/bmkg?${params}`));
  if (!response.ok) throw new Error('BMKG request failed.');
  return normalizeBmkg(await response.json());
}
