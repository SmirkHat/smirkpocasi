/**
 * BMKG (Indonesia) present weather + digital forecast by coordinates.
 * https://cuaca.bmkg.go.id/
 */
const CURRENT_URL = 'https://cuaca.bmkg.go.id/api/presentwx/coord';
const FORECAST_URL = 'https://cuaca.bmkg.go.id/api/df/v1/forecast/coord';

function coord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SmirkPocasi/2.0 (smirkhat.org)',
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.message || `BMKG ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  const lat = coord(req.query.lat);
  const lon = coord(req.query.lon);

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing or invalid lat/lon.' });
    return;
  }

  const params = new URLSearchParams({ lat, lon });

  try {
    const [current, forecast] = await Promise.all([
      fetchJson(`${CURRENT_URL}?${params}`),
      fetchJson(`${FORECAST_URL}?${params}`),
    ]);

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({
      source: 'bmkg',
      current,
      forecast,
    });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    res.status(status).json({
      error: 'BMKG is unavailable.',
      detail: error.message,
      upstream: error.data || null,
    });
  }
}
