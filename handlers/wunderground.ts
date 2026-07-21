const NEAR_URL = 'https://api.weather.com/v3/location/near';
const OBS_URL = 'https://api.weather.com/v2/pws/observations/current';

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.WUNDERGROUND_KEY;
  if (!key) {
    return res.status(501).json({ error: 'WUNDERGROUND_KEY is not configured.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const lat = Number(url.searchParams.get('lat') ?? req.query?.lat);
  const lon = Number(url.searchParams.get('lon') ?? req.query?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Missing lat or lon.' });
  }

  try {
    const nearParams = new URLSearchParams({
      geocode: `${lat},${lon}`,
      product: 'pws',
      format: 'json',
      apiKey: key,
    });
    const nearResponse = await fetch(`${NEAR_URL}?${nearParams}`);
    const nearData = await nearResponse.json();
    if (!nearResponse.ok) {
      return res.status(nearResponse.status).json({ error: 'Weather Underground near lookup failed.', detail: nearData });
    }

    const stationId =
      nearData?.location?.stationId?.[0] ||
      nearData?.location?.pwsId?.[0] ||
      nearData?.stationId?.[0] ||
      null;
    if (!stationId) {
      return res.status(404).json({ error: 'No nearby Weather Underground PWS.' });
    }

    const obsParams = new URLSearchParams({
      stationId: String(stationId),
      format: 'json',
      units: 'm',
      apiKey: key,
    });
    const obsResponse = await fetch(`${OBS_URL}?${obsParams}`);
    const obsData = await obsResponse.json();
    if (!obsResponse.ok) {
      return res.status(obsResponse.status).json({ error: 'Weather Underground observation failed.', detail: obsData });
    }

    const obs = obsData?.observations?.[0] || {};
    const metric = obs.metric || {};
    const stationLat = num(obs.lat);
    const stationLon = num(obs.lon);

    return res.status(200).json({
      station: {
        id: String(stationId),
        name: obs.neighborhood || obs.stationID || String(stationId),
        distance: null,
        lat: stationLat,
        lon: stationLon,
      },
      current: {
        time: obs.obsTimeUtc || obs.obsTimeLocal || null,
        temperature: num(metric.temp),
        humidity: num(obs.humidity),
        pressure: num(metric.pressure),
        windSpeed: num(metric.windSpeed),
        windDirection: num(obs.winddir),
        windGust: num(metric.windGust),
        precipitation: num(metric.precipRate ?? metric.precipTotal),
      },
      attribution: 'Weather Underground PWS',
      raw: { stationId },
    });
  } catch (error) {
    return res.status(502).json({ error: 'Weather Underground is unavailable.', detail: error.message });
  }
}
