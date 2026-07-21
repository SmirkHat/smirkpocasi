const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Chybí lat nebo lon.' });
    return;
  }

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,dew_point_2m,precipitation,weathercode,windspeed_10m,winddirection_10m,windgusts_10m,relative_humidity_2m,pressure_msl,surface_pressure,cloud_cover,visibility,uv_index',
    hourly: 'temperature_2m,dew_point_2m,precipitation,precipitation_probability,weathercode,windspeed_10m,winddirection_10m,windgusts_10m,cloud_cover,visibility',
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,uv_index_max',
    timezone: 'Europe/Prague',
    forecast_days: '7'
  });

  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params}`);
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Open-Meteo je nedostupné.', detail: error.message });
  }
}
