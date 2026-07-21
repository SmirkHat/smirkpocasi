/**
 * Tomorrow.io Weather Forecast API (v4).
 * Free tier is tight (≈3 rps / 25 per hour / 500 per day) — cache aggressively
 * and round coordinates so nearby map pans share one upstream call.
 *
 * Env: TOMMOROWIO_KEY (legacy typo), TOMORROWIO_KEY, or TOMORROW_IO_KEY.
 */
const FORECAST_URL = 'https://api.tomorrow.io/v4/weather/forecast';

/** In-process cache shared across requests in the same server instance. */
const memoryCache = new Map();
const CACHE_TTL_MS = 55 * 60 * 1000;

function apiKey() {
  return (
    process.env.TOMMOROWIO_KEY ||
    process.env.TOMORROWIO_KEY ||
    process.env.TOMORROW_IO_KEY ||
    ''
  );
}

function coord(value, digits = 2) {
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

export default async function handler(req, res) {
  const key = apiKey();
  if (!key) {
    res.status(503).json({
      error: 'TOMMOROWIO_KEY / TOMORROWIO_KEY is not configured.',
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
    res.setHeader('Cache-Control', 's-maxage=3300, stale-while-revalidate=7200');
    res.setHeader('X-Cache', 'HIT');
    res.status(200).json(cached);
    return;
  }

  const params = new URLSearchParams({
    location: `${lat},${lon}`,
    timesteps: '1h',
    units: 'metric',
    apikey: key,
  });

  try {
    const response = await fetch(`${FORECAST_URL}?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SmirkPocasi/2.0 (smirkhat.org)',
      },
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      res.status(response.status).json({
        error: 'Tomorrow.io forecast unavailable.',
        detail: data?.message || data?.type || data,
      });
      return;
    }

    const payload = {
      source: 'tomorrowio',
      location: data?.location || { lat: Number(lat), lon: Number(lon) },
      timelines: data?.timelines || null,
    };

    writeCache(memoKey, payload);
    res.setHeader('Cache-Control', 's-maxage=3300, stale-while-revalidate=7200');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(payload);
  } catch (error) {
    res.status(502).json({ error: 'Tomorrow.io is unavailable.', detail: error.message });
  }
}
