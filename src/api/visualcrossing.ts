import { normalizeVisualCrossing } from './normalizers/visualcrossing';

export async function fetchVisualCrossing(location) {
  const response = await fetch(`/api/visualcrossing?lat=${location.lat}&lon=${location.lon}`);

  if (!response.ok) throw new Error('Visual Crossing request failed.');

  return normalizeVisualCrossing(await response.json());
}
