/**
 * Italian Air Force Meteorology (Meteo AM) unofficial JSON APIs.
 * Station radius for current + meteogram for hourly forecast.
 */
const CURRENT_URL = 'https://api.meteoam.it/deda-ows/api/GetStationRadius';
const FORECAST_URL = 'https://api.meteoam.it/deda-meteograms/api/GetMeteogram/preset1';

function coord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    const err = new Error(data?.message || `Meteo AM ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  const lat = coord(req.query.lat);
  const lon = coord(req.query.lon);

  if (lat == null || lon == null) {
    res.status(400).json({ error: 'Missing or invalid lat/lon.' });
    return;
  }

  try {
    const [current, forecast] = await Promise.all([
      fetchJson(`${CURRENT_URL}/${lat}/${lon}`),
      fetchJson(`${FORECAST_URL}/${lat},${lon}`),
    ]);

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({
      source: 'meteoam',
      unofficial: true,
      current,
      forecast,
    });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    res.status(status).json({
      error: 'Meteo AM is unavailable.',
      detail: error.message,
      upstream: error.data || null,
    });
  }
}
