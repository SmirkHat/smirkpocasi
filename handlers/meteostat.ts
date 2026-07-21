const POINT_DAILY_URL = 'https://meteostat.p.rapidapi.com/point/daily';

function isoDate(offsetDays = 0) {
  const date = new Date(Date.now() - offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
}

function rapidHeaders(key) {
  return {
    'x-rapidapi-key': key,
    'x-rapidapi-host': 'meteostat.p.rapidapi.com',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** BASIC RapidAPI plan is ~1 req/s — retry briefly on 429. */
async function fetchMeteostat(url, key, { retries = 2 } = {}) {
  let lastResponse = null;
  let lastData = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    lastResponse = await fetch(url, { headers: rapidHeaders(key) });
    lastData = await lastResponse.json().catch(() => ({}));
    if (lastResponse.status !== 429 || attempt === retries) break;
    await sleep(1100 * (attempt + 1));
  }

  return { response: lastResponse, data: lastData };
}

function rapidErrorMessage(data, fallback) {
  const message = data?.message || data?.error || data?.messages;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return fallback;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.METEOSTAT_KEY;
  if (!key) {
    return res.status(501).json({ error: 'METEOSTAT_KEY is not configured.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const lat = Number(url.searchParams.get('lat') ?? req.query?.lat);
  const lon = Number(url.searchParams.get('lon') ?? req.query?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Missing lat or lon.' });
  }

  try {
    // Single call (point/daily) instead of nearby+stations/daily — halves RapidAPI usage
    // and avoids BASIC per-second rate limits on Settings remounts.
    // Daily archives lag ~1 day; end yesterday for more complete rows.
    const dailyParams = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      start: isoDate(7),
      end: isoDate(1),
    });
    const { response, data } = await fetchMeteostat(`${POINT_DAILY_URL}?${dailyParams}`, key);

    if (!response.ok) {
      return res.status(response.status).json({
        error: rapidErrorMessage(data, 'Meteostat daily failed.'),
        detail: data,
      });
    }

    const days = (data.data || []).map((row) => ({
      date: String(row.date || '').slice(0, 10),
      tavg: row.tavg ?? null,
      tmin: row.tmin ?? null,
      tmax: row.tmax ?? null,
      prcp: row.prcp ?? null,
      wspd: row.wspd ?? null,
      pres: row.pres ?? null,
    }));

    return res.status(200).json({
      station: {
        id: null,
        name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        distance: null,
        lat,
        lon,
      },
      days,
      attribution: 'Meteostat point/daily (RapidAPI)',
    });
  } catch (error) {
    return res.status(502).json({ error: 'Meteostat is unavailable.', detail: error.message });
  }
}
