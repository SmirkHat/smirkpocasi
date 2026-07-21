import STATIONS from '../data/imgw-stations.json';
const SYNOP_URL = 'https://danepubliczne.imgw.pl/api/data/synop';

let synopCache = null;
let synopCacheAt = 0;
const SYNOP_TTL = 10 * 60 * 1000;

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
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function getSynop() {
  if (synopCache && Date.now() - synopCacheAt < SYNOP_TTL) return synopCache;
  const response = await fetch(SYNOP_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  synopCache = new Map(rows.map((row) => [String(row.id_stacji), row]));
  synopCacheAt = Date.now();
  return synopCache;
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
    const synop = await getSynop();
    const nearest = STATIONS
      .filter((s) => synop.has(String(s.id)))
      .map((s) => ({ ...s, distance: distanceKm(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) throw new Error('Žádná IMGW stanice s daty.');

    const row = synop.get(String(nearest.id));
    const time =
      row.data_pomiaru && row.godzina_pomiaru != null
        ? `${row.data_pomiaru}T${String(row.godzina_pomiaru).padStart(2, '0')}:00:00`
        : null;

    return res.status(200).json({
      station: {
        id: nearest.id,
        name: nearest.name,
        distance: nearest.distance,
        lat: nearest.lat,
        lon: nearest.lon,
      },
      current: {
        time,
        temperature: num(row.temperatura),
        humidity: num(row.wilgotnosc_wzgledna),
        pressure: num(row.cisnienie),
        windSpeed: num(row.predkosc_wiatru),
        windDirection: num(row.kierunek_wiatru),
        windGust: null,
        precipitation: num(row.suma_opadu),
      },
      attribution: 'IMGW-PIB dane publiczne',
    });
  } catch (error) {
    return res.status(502).json({ error: 'IMGW data jsou nedostupná.', detail: error.message });
  }
}
