import { normalizeNws } from './normalizers/nws';
import { apiUrl } from '@/lib/apiBase'

export async function fetchNws(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/nws?${params}`));
  if (!response.ok) throw new Error('NWS request failed.');
  return normalizeNws(await response.json());
}
