const WEATHERAPI_URL = 'https://api.weatherapi.com/v1/current.json';

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

  const params = new URLSearchParams({ key, q: `${lat},${lon}`, aqi: 'no', lang: 'cs' });

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
