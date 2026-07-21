import { apiUrl } from '@/lib/apiBase'
export async function fetchMeteostatHistory(location) {
  const response = await fetch(apiUrl(`/api/meteostat?lat=${location.lat}&lon=${location.lon}`));
  if (response.status === 501) {
    return { disabled: true, days: [], station: null, attribution: null };
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Meteostat request failed.');
  }
  return response.json();
}
