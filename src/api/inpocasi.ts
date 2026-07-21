import { normalizeInpocasiStation } from './normalizers/inpocasi';

export async function fetchInpocasiStations(location) {
  const response = await fetch(`/api/inpocasi-stations?lat=${location.lat}&lon=${location.lon}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Nepodařilo se načíst stanice In-počasí.');
  }
  return normalizeInpocasiStation(await response.json());
}
