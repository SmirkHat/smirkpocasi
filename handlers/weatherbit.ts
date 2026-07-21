/**
 * Weatherbit — Free-tier safe by default.
 *
 * Free: 50 req/day, 1 rps — current + 7-day daily only (no hourly/minutely/AQI).
 * Set WEATHERBIT_TIER=standard|plus|business to also pull hourly (paid plans).
 *
 * Env: WEATHERBIT_KEY
 */
const BASE = 'https://api.weatherbit.io/v2.0';
const memoryCache = new Map();

/** Long TTL — free quota is only 50/day. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function apiKey() {
  return process.env.WEATHERBIT_KEY || process.env.WEATHER_BIT_KEY || '';
}

function tier() {
  const value = String(process.env.WEATHERBIT_TIER || 'free').trim().toLowerCase();
  return value || 'free';
}

function isPaidTier(value) {
  return ['standard', 'plus', 'business', 'enterprise'].includes(value);
}

function coord(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : null;
}

function cacheKey(lat, lon, plan) {
  return `${plan}:${lat},${lon}`;
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
  if (memoryCache.size > 100) {
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
  if (!response.ok) {
    const err = new Error(data?.error || data?.message || `Weatherbit ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  const key = apiKey();
  if (!key) {
    res.status(503).json({ error: 'WEATHERBIT_KEY is not configured.' });
    return;
  }

  const lat = coord(req.query.lat);
  const lon = coord(req.query.lon);
  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing or invalid lat/lon.' });
    return;
  }

  const plan = tier();
  const memoKey = cacheKey(lat, lon, plan);
  const cached = readCache(memoKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
    res.setHeader('X-Cache', 'HIT');
    res.status(200).json(cached);
    return;
  }

  const common = new URLSearchParams({
    lat,
    lon,
    key,
    units: 'M',
    lang: 'en',
  });

  try {
    const tasks = [
      fetchJson(`${BASE}/current?${common}`),
      // Free allows 7-day daily; higher tiers allow 16 — keep 7 to stay free-safe.
      fetchJson(`${BASE}/forecast/daily?${common}&days=7`),
    ];

    if (isPaidTier(plan)) {
      tasks.push(fetchJson(`${BASE}/forecast/hourly?${common}&hours=48`));
    }

    const settled = await Promise.allSettled(tasks);
    const current = settled[0].status === 'fulfilled' ? settled[0].value : null;
    const daily = settled[1].status === 'fulfilled' ? settled[1].value : null;
    const hourly =
      isPaidTier(plan) && settled[2]?.status === 'fulfilled' ? settled[2].value : null;

    if (!current && !daily) {
      const firstErr = settled.find((item) => item.status === 'rejected')?.reason;
      const status =
        firstErr?.status && firstErr.status >= 400 && firstErr.status < 600
          ? firstErr.status
          : 502;
      res.status(status).json({
        error: 'Weatherbit is unavailable.',
        detail: firstErr?.message || null,
        upstream: firstErr?.data || null,
      });
      return;
    }

    const payload = {
      source: 'weatherbit',
      tier: plan,
      freeSafe: !isPaidTier(plan),
      current: current?.data?.[0] || null,
      daily: daily?.data || null,
      hourly: hourly?.data || null,
    };

    writeCache(memoKey, payload);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(payload);
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    res.status(status).json({
      error: 'Weatherbit is unavailable.',
      detail: error.message,
      upstream: error.data || null,
    });
  }
}
