import { normalizeTomorrowio } from './normalizers/tomorrowio';
import { apiUrl } from '@/lib/apiBase'

export async function fetchTomorrowio(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/tomorrowio?${params}`));
  if (!response.ok) throw new Error('Tomorrow.io request failed.');
  return normalizeTomorrowio(await response.json());
}
