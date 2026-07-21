import { normalizeFmi } from './normalizers/fmi';
import { apiUrl } from '@/lib/apiBase'

export async function fetchFmi(location) {
  const params = new URLSearchParams({ lat: location.lat, lon: location.lon });
  const response = await fetch(apiUrl(`/api/fmi?${params}`));
  if (!response.ok) throw new Error('FMI request failed.');
  return normalizeFmi(await response.json());
}
