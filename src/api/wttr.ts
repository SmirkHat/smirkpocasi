import { normalizeWttr } from './normalizers/wttr';

export async function fetchWttr(location) {
  const response = await fetch(`/api/wttr?lat=${location.lat}&lon=${location.lon}`);

  if (!response.ok) throw new Error('wttr.in request failed.');

  return normalizeWttr(await response.json());
}
