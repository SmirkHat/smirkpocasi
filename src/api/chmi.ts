import { normalizeCHMI } from './normalizers/chmi';
import { apiUrl } from '@/lib/apiBase'

export async function fetchCHMI(location) {
  const { lat, lon } = location;
  const response = await fetch(apiUrl(`/api/chmi?lat=${lat}&lon=${lon}`));
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Nepodařilo se načíst data ČHMÚ.');
  }
  const data = await response.json();
  return normalizeCHMI(data);
}
