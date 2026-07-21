/**
 * OpenWeatherMap bundle: current + 5-day/3h forecast + air pollution.
 * Optional One Call 3.0 hourly when the key has that product enabled.
 *
 * Query `parts` (comma list): current,forecast,pollution,onecall — default all except onecall
 * (onecall is tried opportunistically when forecast is requested).
 */
const CURRENT_URL = 'https://api.openweathermap.org/data/2.5/weather';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const POLLUTION_URL = 'https://api.openweathermap.org/data/2.5/air_pollution';
const ONECALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.message || `OpenWeatherMap ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function parseParts(raw) {
  const requested = String(raw || 'current,forecast,pollution')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return new Set(requested.length ? requested : ['current', 'forecast', 'pollution']);
}

export default async function handler(req, res) {
  const { lat, lon, parts: partsRaw } = req.query;
  const key = process.env.OPENWEATHERMAP_KEY;

  if (!key) {
    res.status(501).json({ error: 'OPENWEATHERMAP_KEY is not configured.' });
    return;
  }

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const parts = parseParts(partsRaw);
  const common = new URLSearchParams({
    appid: key,
    lat: String(lat),
    lon: String(lon),
    units: 'metric',
    lang: 'cz',
  });

  try {
    const tasks = [];
    const labels = [];

    if (parts.has('current')) {
      labels.push('current');
      tasks.push(fetchJson(`${CURRENT_URL}?${common}`));
    }
    if (parts.has('forecast')) {
      labels.push('forecast');
      tasks.push(fetchJson(`${FORECAST_URL}?${common}`));
    }
    if (parts.has('pollution')) {
      labels.push('pollution');
      tasks.push(fetchJson(`${POLLUTION_URL}?${common}`));
    }

    const settled = await Promise.allSettled(tasks);
    const bundle = {
      source: 'openweathermap',
      current: null,
      forecast: null,
      pollution: null,
      onecall: null,
    };

    settled.forEach((result, index) => {
      const label = labels[index];
      if (result.status === 'fulfilled') bundle[label] = result.value;
    });

    // Opportunistic One Call 3.0 (hourly 48h) — ignore if key lacks the product.
    if (parts.has('forecast') || parts.has('onecall')) {
      try {
        const onecallParams = new URLSearchParams(common);
        onecallParams.set('exclude', 'minutely');
        bundle.onecall = await fetchJson(`${ONECALL_URL}?${onecallParams}`);
      } catch {
        bundle.onecall = null;
      }
    }

    const hasAny = bundle.current || bundle.forecast || bundle.pollution || bundle.onecall;
    if (!hasAny) {
      const firstError = settled.find((result) => result.status === 'rejected');
      const status = firstError?.reason?.status || 502;
      res.status(status).json({
        error: 'OpenWeatherMap is unavailable.',
        detail: firstError?.reason?.message || 'No data',
      });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json(bundle);
  } catch (error) {
    res.status(502).json({ error: 'OpenWeatherMap is unavailable.', detail: error.message });
  }
}
