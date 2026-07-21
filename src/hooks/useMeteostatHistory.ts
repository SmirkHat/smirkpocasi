import { useEffect, useState } from 'react';
import { fetchMeteostatHistory } from '../api/meteostat';

export function useMeteostatHistory(location) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!location?.lat || !location?.lon) return undefined;
    if (import.meta.env.VITE_ENABLE_API_KEY_PROVIDERS !== 'true') {
      setData({ disabled: true, days: [], station: null, attribution: null });
      setLoading(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchMeteostatHistory(location)
      .then((payload) => {
        if (!controller.signal.aborted) setData(payload);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [location]);

  return { data, loading, error };
}
