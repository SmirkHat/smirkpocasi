export default async function handler(req, res) {
  const { lat, lon } = req.query;
  const key = process.env.PIRATEWEATHER_KEY;

  if (!key) {
    res.status(501).json({ error: 'PIRATEWEATHER_KEY is not configured.' });
    return;
  }

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const params = new URLSearchParams({ units: 'si', exclude: 'minutely,hourly,daily,alerts' });

  try {
    const response = await fetch(`https://api.pirateweather.net/forecast/${key}/${lat},${lon}?${params}`);
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Pirate Weather is unavailable.', detail: error.message });
  }
}
