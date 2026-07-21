import { normalizePocasiCz } from './normalizers/pocasicz';
import { apiUrl } from '@/lib/apiBase'

export async function fetchPocasiCz(location) {
  const response = await fetch(apiUrl(`/api/pocasicz?lat=${location.lat}&lon=${location.lon}`));

  if (!response.ok) throw new Error('Počasí.cz request failed.');

  return normalizePocasiCz(await response.json());
}
