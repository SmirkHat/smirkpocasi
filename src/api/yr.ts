import { normalizeYr } from './normalizers/yr';

export async function fetchYr(location) {
  const response = await fetch(`/api/yr?lat=${location.lat}&lon=${location.lon}`);

  if (!response.ok) throw new Error('Yr.no request failed.');

  return normalizeYr(await response.json());
}
