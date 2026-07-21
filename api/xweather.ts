/**
 * Xweather (formerly AerisWeather) conditions + hourly forecasts.
 * https://www.xweather.com/docs/weather-api/
 *
 * Env:
 * - XWEATHER_KEY as `clientId_clientSecret` (dashboard often shows them joined), or
 * - XWEATHER_CLIENT_ID + XWEATHER_CLIENT_SECRET
 */
const BASE = 'https://data.api.xweather.com';
const memoryCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function credentials() {
  const id = process.env.XWEATHER_CLIENT_ID;
  const secret = process.env.XWEATHER_CLIENT_SECRET;
  if (id && secret) return { id, secret };

  const combined = process.env.XWEATHER_KEY || process.env.AERIS_KEY || '';
  const idx = combined.indexOf('_');
  if (idx > 0) {
    return { id: combined.slice(0, idx), secret: combined.slice(idx + 1) };
  }
  return null;
}

function coord(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : null;
}

function cacheKey(lat, lon) {
  return `${lat},${lon}`;
}

function readCache(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key, data) {
  memoryCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  if (memoryCache.size > 200) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SmirkPocasi/2.0 (smirkhat.org)',
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const err = new Error(data?.error?.description || `Xweather ${response.status}`);
    err.status = response.status === 200 ? 502 : response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function firstResponse(data) {
  if (Array.isArray(data?.response)) return data.response[0] || null;
  return data?.response || null;
}

export default async function handler(req, res) {
  const creds = credentials();
  if (!creds) {
    res.status(503).json({
      error: 'XWEATHER_KEY (or XWEATHER_CLIENT_ID + XWEATHER_CLIENT_SECRET) is not configured.',
    });
    return;
  }

  const lat = coord(req.query.lat);
  const lon = coord(req.query.lon);
  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing or invalid lat/lon.' });
    return;
  }

  const memoKey = cacheKey(lat, lon);
  const cached = readCache(memoKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('X-Cache', 'HIT');
    res.status(200).json(cached);
    return;
  }

  const auth = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
  });
  const loc = `${lat},${lon}`;

  try {
    const [conditionsData, forecastData] = await Promise.all([
      fetchJson(`${BASE}/conditions/${loc}?${auth}`),
      fetchJson(`${BASE}/forecasts/${loc}?${auth}&filter=1hr&limit=72`),
    ]);

    const payload = {
      source: 'xweather',
      location: { lat: Number(lat), lon: Number(lon) },
      conditions: firstResponse(conditionsData),
      forecast: firstResponse(forecastData),
    };

    writeCache(memoKey, payload);
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(payload);
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    res.status(status).json({
      error: 'Xweather is unavailable.',
      detail: error.message,
      upstream: error.data || null,
    });
  }
}
