const WTTR_URL = 'https://wttr.in';

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  try {
    const response = await fetch(`${WTTR_URL}/${lat},${lon}?format=j1`, {
      headers: { 'User-Agent': 'SmirkPocasi/2.0 smirkhat.org' }
    });
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'wttr.in is unavailable.', detail: error.message });
  }
}
