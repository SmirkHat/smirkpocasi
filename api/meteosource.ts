/**
 * Meteosource point weather + hourly forecast.
 * https://www.meteosource.com/documentation
 *
 * Env: METEOSOURCE_KEY, optional METEOSOURCE_TIER (free|flexi|standard|…, default free).
 * Cache aggressively — free tiers are limited.
 */
const memoryCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function apiKey() {
  return process.env.METEOSOURCE_KEY || process.env.METEO_SOURCE_KEY || '';
}

function tier() {
  const value = String(process.env.METEOSOURCE_TIER || 'free').trim().toLowerCase();
  return value || 'free';
}

function coord(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : null;
}

function cacheKey(lat, lon) {
  return `${tier()}:${lat},${lon}`;
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
    res.status(503).json({ error: 'METEOSOURCE_KEY is not configured.' });
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

  // Free tier only accepts language=en (other locales need higher plans).
  const params = new URLSearchParams({
    lat,
    lon,
    sections: 'current,hourly',
    timezone: 'UTC',
    language: 'en',
    units: 'metric',
    key,
  });

  const url = `https://www.meteosource.com/api/v1/${tier()}/point?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'User-Agent': 'SmirkPocasi/2.0 (smirkhat.org)',
      },
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      res.status(response.status).json({
        error: 'Meteosource forecast unavailable.',
        detail: data?.detail || data?.message || data,
      });
      return;
    }

    const payload = {
      source: 'meteosource',
      tier: tier(),
      ...data,
    };

    writeCache(memoKey, payload);

    const expires = response.headers.get('Expires');
    if (expires) res.setHeader('Expires', expires);
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(payload);
  } catch (error) {
    res.status(502).json({ error: 'Meteosource is unavailable.', detail: error.message });
  }
}
