/**
 * AccuWeather proxy.
 * Prefer ACCUWEATHER_KEY (official). Falls back to the public web client key
 * scraped from www.accuweather.com (HAR) — that key allows current + 24h hourly only.
 */
const BASE = 'https://api.accuweather.com';
// Public key embedded by the AccuWeather website (radar / limited forecast). Override via env.
const DEFAULT_SITE_KEY = 'de13920f574d420984d3080b1fa6132b';

function coord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : null;
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
    const err = new Error(data?.Message || data?.message || `AccuWeather ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function fetchHourly(locationKey, auth) {
  const common = `${auth}&details=true&metric=true`;
  // Official keys often allow 120h; the website key only allows 24h.
  for (const hours of [120, 24]) {
    try {
      const hourly = await fetchJson(
        `${BASE}/forecasts/v1/hourly/${hours}hour/${locationKey}?${common}`
      );
      if (Array.isArray(hourly) && hourly.length) {
        return { hourly, hours };
      }
    } catch (error) {
      if (error.status === 403 || error.status === 401) continue;
      throw error;
    }
  }
  return { hourly: [], hours: null };
}

export default async function handler(req, res) {
  const envKey = process.env.ACCUWEATHER_KEY || process.env.ACCU_KEY;
  const apiKey = envKey || process.env.ACCUWEATHER_SITE_KEY || DEFAULT_SITE_KEY;
  const unofficial = !envKey;

  const lat = coord(req.query.lat);
  const lon = coord(req.query.lon);

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing or invalid lat/lon.' });
    return;
  }

  const auth = new URLSearchParams({ apikey: apiKey });

  try {
    const location = await fetchJson(
      `${BASE}/locations/v1/cities/geoposition/search.json?${auth}&q=${encodeURIComponent(`${lat},${lon}`)}`
    );
    const locationKey = location?.Key;
    if (!locationKey) {
      res.status(404).json({ error: 'AccuWeather location key not found.', upstream: location });
      return;
    }

    const common = `${auth}&details=true&metric=true`;
    const [current, hourlyResult] = await Promise.all([
      fetchJson(`${BASE}/currentconditions/v1/${locationKey}?${common}`),
      fetchHourly(locationKey, auth),
    ]);

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({
      source: 'accuweather',
      unofficial,
      locationKey,
      locationName: location?.LocalizedName || location?.EnglishName || null,
      hourlyHours: hourlyResult.hours,
      current: Array.isArray(current) ? current[0] : current,
      hourly: hourlyResult.hourly,
    });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    res.status(status).json({
      error: 'AccuWeather is unavailable.',
      detail: error.message,
      upstream: error.data || null,
    });
  }
}
