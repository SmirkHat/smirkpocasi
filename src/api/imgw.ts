import { normalizeNeighborStation } from './normalizers/neighborStation';
import { apiUrl } from '@/lib/apiBase'

export async function fetchImgw(location) {
  const { lat, lon } = location;
  const response = await fetch(apiUrl(`/api/imgw?lat=${lat}&lon=${lon}`));
  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Nepodařilo se načíst data IMGW.');
  }
  const data = await response.json();
  return normalizeNeighborStation(data);
}
