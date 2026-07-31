/**
 * WeatherAPI.com — forecast endpoint includes `current` plus today's astronomy
 * and hourly chance_of_rain (current.json alone has neither sunrise nor PoP).
 *
 * Env: WEATHERAPI_KEY
 */
const WEATHERAPI_URL = 'https://api.weatherapi.com/v1/forecast.json';

export default async function handler(req, res) {
  const { lat, lon } = req.query;
  const key = process.env.WEATHERAPI_KEY;

  if (!key) {
    res.status(501).json({ error: 'WEATHERAPI_KEY is not configured.' });
    return;
  }

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const params = new URLSearchParams({
    key,
    q: `${lat},${lon}`,
    days: '1',
    aqi: 'no',
    alerts: 'no',
    lang: 'cs',
  });

  try {
    const response = await fetch(`${WEATHERAPI_URL}?${params}`);
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'WeatherAPI.com is unavailable.', detail: error.message });
  }
}
