import { normalizeYr } from './normalizers/yr';
import { apiUrl } from '@/lib/apiBase'

export async function fetchYr(location) {
  const response = await fetch(apiUrl(`/api/yr?lat=${location.lat}&lon=${location.lon}`));

  if (!response.ok) throw new Error('Yr.no request failed.');

  return normalizeYr(await response.json());
}
