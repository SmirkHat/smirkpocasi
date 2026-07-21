import { normalizePocasiCz } from './normalizers/pocasicz';

export async function fetchPocasiCz(location) {
  const response = await fetch(`/api/pocasicz?lat=${location.lat}&lon=${location.lon}`);

  if (!response.ok) throw new Error('Počasí.cz request failed.');

  return normalizePocasiCz(await response.json());
}
