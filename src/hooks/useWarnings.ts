import { useEffect, useState } from 'react';
import { locationInCzechiaCoverage } from '../utils/geo';
import { apiUrl } from '@/lib/apiBase'

export function useWarnings(location) {
  const lat = location?.lat;
  const lon = location?.lon;
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [attribution, setAttribution] = useState(null);

  useEffect(() => {
    if (!lat || !lon) return undefined;

    if (!locationInCzechiaCoverage({ lat, lon })) {
      setWarnings([]);
      setAttribution(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(apiUrl(`/api/warnings?lat=${lat}&lon=${lon}`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Výstrahy se nepodařilo načíst.');
        return response.json();
      })
      .then((payload) => {
        setWarnings(payload.warnings || []);
        setAttribution(payload.attribution || null);
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [lat, lon]);

  return { warnings, loading, error, attribution };
}
