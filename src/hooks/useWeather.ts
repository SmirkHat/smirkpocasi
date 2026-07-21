import { useEffect, useState } from 'react';
import { useWeatherStore } from '../store/weatherStore';
import { apiUrl } from '@/lib/apiBase'

function cacheMatchesLocation(cached, location) {
  if (!cached?.data || !location?.lat || !location?.lon) return false;
  if (cached.lat == null || cached.lon == null) return false;
  return cached.lat === location.lat && cached.lon === location.lon;
}

export function useWeather(location) {
  const cached = useWeatherStore((state) => state.weather);
  const setWeather = useWeatherStore((state) => state.setWeather);
  const relevant = cacheMatchesLocation(cached, location);
  const [data, setData] = useState(relevant ? cached.data : null);
  const [updatedAt, setUpdatedAt] = useState(relevant ? cached.updatedAt : null);
  const [loading, setLoading] = useState(!relevant);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!location?.lat || !location?.lon) return;

    const controller = new AbortController();
    const storeCached = useWeatherStore.getState().weather;
    const showSkeleton = !cacheMatchesLocation(storeCached, location);
    if (showSkeleton) setLoading(true);
    setError(null);

    fetch(apiUrl(`/api/weather?lat=${location.lat}&lon=${location.lon}`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Počasí se nepodařilo načíst.');
        return response.json();
      })
      .then((weather) => {
        setData(weather);
        setWeather(weather, { lat: location.lat, lon: location.lon });
        setUpdatedAt(new Date().toISOString());
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
    // Záměrně jen souřadnice — nový objekt `location` ze store by zbytečně restartoval fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lon, setWeather]);

  return { data, updatedAt, loading, error, offline: Boolean(error && data) };
}
