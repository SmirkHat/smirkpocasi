export async function fetchAQI(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide',
    timezone: 'Europe/Prague'
  });
  
  const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.reason || 'Air quality data unavailable.');
  }
  
  const data = await response.json();
  const current = data.current;
  
  return {
    aqi: current.european_aqi,
    pm10: current.pm10,
    pm25: current.pm2_5,
    no2: current.nitrogen_dioxide,
    o3: current.ozone,
    so2: current.sulphur_dioxide,
    updatedAt: current.time,
    attribution: 'Data: Open-Meteo (CAMS)'
  };
}
