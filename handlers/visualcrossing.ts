const VISUAL_CROSSING_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

export default async function handler(req, res) {
  const { lat, lon } = req.query;
  const key = process.env.VISUALCROSSING_KEY;

  if (!key) {
    res.status(501).json({ error: 'VISUALCROSSING_KEY is not configured.' });
    return;
  }

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const params = new URLSearchParams({ key, unitGroup: 'metric', include: 'current', lang: 'cs' });

  try {
    const response = await fetch(`${VISUAL_CROSSING_URL}/${lat},${lon}/today?${params}`);
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Visual Crossing is unavailable.', detail: error.message });
  }
}
