import { normalizeAviation } from './normalizers/aviation';

export async function fetchAviation(location) {
  const { lat, lon } = location;
  const response = await fetch(`/api/aviation?lat=${lat}&lon=${lon}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Nepodařilo se načíst letecká data.');
  }
  const data = await response.json();
  return normalizeAviation(data);
}
