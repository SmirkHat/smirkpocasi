/**
 * Unofficial weather.com (api.weather.com) proxy.
 * Uses the same public site apiKey the website embeds; override with WEATHER_COM_API_KEY.
 * Not an official partner integration — may break without notice.
 */
const API_HOST = 'https://api.weather.com';
// Public key scraped from weather.com web client (HAR). Prefer env override.
const DEFAULT_SITE_KEY = '71f92ea9dd2f4790b92ea9dd2f779061';

function geocode(lat, lon) {
  const a = Number(lat);
  const b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return `${a.toFixed(3)},${b.toFixed(3)}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SmirkPocasi/2.0 (unofficial weather.com client)',
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.error?.message || data?.failure || `weather.com ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const geo = geocode(lat, lon);
  if (!geo) {
    res.status(400).json({ error: 'Invalid lat or lon.' });
    return;
  }

  const apiKey = process.env.WEATHER_COM_API_KEY || DEFAULT_SITE_KEY;
  const common = new URLSearchParams({
    geocode: geo,
    units: 'm',
    language: 'cs-CZ',
    format: 'json',
    apiKey,
  });

  try {
    const [current, hourly] = await Promise.all([
      fetchJson(`${API_HOST}/v3/wx/observations/current?${common}`),
      fetchJson(`${API_HOST}/v3/wx/forecast/hourly/2day?${common}`),
    ]);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({
      source: 'weather.com',
      unofficial: true,
      geocode: geo,
      current,
      hourly,
    });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    res.status(status).json({
      error: 'Weather.com is unavailable.',
      detail: error.message,
      upstream: error.data || null,
    });
  }
}
