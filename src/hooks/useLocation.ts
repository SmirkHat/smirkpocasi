import { useState } from 'react';
import { useWeatherStore } from '../store/weatherStore';

export function useLocation() {
  const location = useWeatherStore((state) => state.location);
  const setLocation = useWeatherStore((state) => state.setLocation);
  const addFavorite = useWeatherStore((state) => state.addFavorite);
  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  function useGps() {
    if (!navigator.geolocation) {
      setGpsError('GPS není v prohlížeči dostupná.');
      return;
    }

    setLoadingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gpsLocation = {
          name: 'Moje poloha',
          lat: Number(position.coords.latitude.toFixed(5)),
          lon: Number(position.coords.longitude.toFixed(5))
        };
        setLocation(gpsLocation);
        addFavorite(gpsLocation);
        setLoadingGps(false);
      },
      () => {
        setGpsError('Poloha se nepodařila zjistit.');
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  return { location, setLocation, useGps, loadingGps, gpsError };
}
