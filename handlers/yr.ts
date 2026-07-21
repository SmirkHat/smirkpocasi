const YR_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';

function coordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : value;
}

function normalizedAltitude(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : null;
}

export default async function handler(req, res) {
  const { lat, lon, altitude } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const params = new URLSearchParams({
    lat: coordinate(lat),
    lon: coordinate(lon)
  });

  const altitudeValue = normalizedAltitude(altitude);
  if (altitudeValue !== null) params.set('altitude', altitudeValue);

  try {
    const response = await fetch(`${YR_URL}?${params}`, {
      headers: { 'User-Agent': 'SmirkPocasi/2.0 smirkhat.org' }
    });
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    if (response.headers.get('Last-Modified')) res.setHeader('Last-Modified', response.headers.get('Last-Modified'));
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'MET Norway Locationforecast is unavailable.', detail: error.message });
  }
}
