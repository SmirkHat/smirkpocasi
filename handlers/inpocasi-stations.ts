const STATIONS_URL = 'https://www.in-pocasi.cz/aktualni-pocasi/ajax/stations.json.php';

let cache = null;
let cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getPoints() {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;
  const response = await fetch(STATIONS_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'SmirkPocasi/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  cache = Array.isArray(json.points) ? json.points : [];
  cacheAt = Date.now();
  return cache;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, 'http://localhost');
  const lat = Number(url.searchParams.get('lat') ?? req.query?.lat);
  const lon = Number(url.searchParams.get('lon') ?? req.query?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Chybí lat nebo lon.' });
  }

  try {
    const points = await getPoints();
    const nearest = points
      .map((p) => ({
        ...p,
        distance: distanceKm(lat, lon, Number(p.lat), Number(p.lng)),
      }))
      .filter((p) => Number.isFinite(p.distance) && (p.t != null || p.h != null || p.w != null))
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) {
      return res.status(404).json({ error: 'Žádná stanice In-počasí v okolí.' });
    }

    // Wind from in-pocasi is km/h on their map UI; keep m/s-like values unlikely (typical 0–40).
    const windRaw = num(nearest.w);
    const gustRaw = num(nearest.g);

    return res.status(200).json({
      station: {
        id: nearest.id,
        name: nearest.name,
        type: nearest.type,
        distance: nearest.distance,
        lat: Number(nearest.lat),
        lon: Number(nearest.lng),
      },
      current: {
        temperature: num(nearest.t),
        humidity: num(nearest.h),
        pressure: null,
        // Site labels wind in km/h in tables; treat as km/h and convert later in normalizer via identity path.
        windSpeedKmh: windRaw,
        windGustKmh: gustRaw,
        windDirection: num(nearest.d),
        precipitation: num(nearest.p),
      },
      attribution: 'In-počasí (agregace stanic)',
    });
  } catch (error) {
    return res.status(502).json({ error: 'In-počasí stanice nedostupné.', detail: error.message });
  }
}
