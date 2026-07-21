import { normalizeNeighborStation } from './normalizers/neighborStation';
import { apiUrl } from '@/lib/apiBase'

export async function fetchShmu(location) {
  const { lat, lon } = location;
  const response = await fetch(apiUrl(`/api/shmu?lat=${lat}&lon=${lon}`));
  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Nepodařilo se načíst data SHMÚ.');
  }
  const data = await response.json();
  return normalizeNeighborStation(data);
}
