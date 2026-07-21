/**
 * NOAA/NWS api.weather.gov — US points only.
 * Flow: points → nearest station observation + hourly grid forecast.
 */
const BASE = 'https://api.weather.gov';
const UA = 'SmirkPocasi/2.0 (smirkhat.org; weather consensus)';

function coord(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/geo+json, application/json',
      'User-Agent': UA,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.detail || data?.title || `NWS ${response.status}`);
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

  try {
    const points = await fetchJson(`${BASE}/points/${lat},${lon}`);
    const props = points?.properties || {};
    const hourlyUrl = props.forecastHourly;
    const stationsUrl = props.observationStations;

    if (!hourlyUrl) {
      res.status(404).json({ error: 'NWS has no forecast for this point (US coverage only).' });
      return;
    }

    const [hourly, stations] = await Promise.all([
      fetchJson(hourlyUrl),
      stationsUrl ? fetchJson(stationsUrl) : Promise.resolve(null),
    ]);

    let observation = null;
    const stationId = stations?.features?.[0]?.properties?.stationIdentifier
      || stations?.features?.[0]?.id?.split('/')?.pop();

    if (stationId) {
      try {
        observation = await fetchJson(`${BASE}/stations/${stationId}/observations/latest`);
      } catch {
        observation = null;
      }
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({
      source: 'nws',
      grid: {
        office: props.cwa,
        gridX: props.gridX,
        gridY: props.gridY,
        timezone: props.timeZone,
      },
      observation,
      hourly,
    });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    res.status(status).json({
      error: 'NWS is unavailable.',
      detail: error.message,
      upstream: error.data || null,
    });
  }
}
