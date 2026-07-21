import { normalizeAladin } from './normalizers/aladin';
import { apiUrl } from '@/lib/apiBase'

export async function fetchAladin(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/aladin?${params}`));

  if (!response.ok) throw new Error('Aladin request failed.');

  return normalizeAladin(await response.json());
}
