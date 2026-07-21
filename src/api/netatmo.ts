import { normalizeNeighborStation } from './normalizers/neighborStation';
import { apiUrl } from '@/lib/apiBase'

let unavailable = false;

export async function fetchNetatmo(location) {
  if (unavailable) return null;

  const response = await fetch(apiUrl(`/api/netatmo?lat=${location.lat}&lon=${location.lon}`));
  if (response.status === 501 || response.status === 404) {
    unavailable = true;
    return null;
  }
  if (!response.ok) throw new Error('Netatmo request failed.');
  return normalizeNeighborStation(await response.json());
}
