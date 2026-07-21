const POCASICZ_URL = 'https://wapi.pocasi.seznam.cz/v2/forecast';

function coordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : value;
}

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const params = new URLSearchParams({
    lat: coordinate(lat),
    lon: coordinate(lon),
    include: 'current,place,entries,daily'
  });

  try {
    const response = await fetch(`${POCASICZ_URL}?${params}`, {
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
    res.status(502).json({ error: 'Počasí.cz forecast is unavailable.', detail: error.message });
  }
}
