/**
 * Sea surface temperature via Open-Meteo Marine (Copernicus-based SST).
 */

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const UA = { 'User-Agent': 'SmirkPocasi/1.0 (https://smirkhat.org)', Accept: 'application/json' };

/** Curated vacation coasts (Europe-centric + a few global). */
const SEA_SPOTS = [
  { id: 'rovinj', name: 'Rovinj', region: 'Chorvatsko · Istrie', lat: 45.081, lon: 13.639 },
  { id: 'porec', name: 'Poreč', region: 'Chorvatsko · Istrie', lat: 45.227, lon: 13.595 },
  { id: 'pula', name: 'Pula', region: 'Chorvatsko · Istrie', lat: 44.866, lon: 13.85 },
  { id: 'zadar', name: 'Zadar', region: 'Chorvatsko', lat: 44.119, lon: 15.231 },
  { id: 'split', name: 'Split', region: 'Chorvatsko · Dalmácie', lat: 43.508, lon: 16.44 },
  { id: 'makarska', name: 'Makarska', region: 'Chorvatsko', lat: 43.297, lon: 17.018 },
  { id: 'dubrovnik', name: 'Dubrovník', region: 'Chorvatsko', lat: 42.65, lon: 18.094 },
  { id: 'budva', name: 'Budva', region: 'Černá Hora', lat: 42.286, lon: 18.84 },
  { id: 'rimini', name: 'Rimini', region: 'Itálie · Jadran', lat: 44.067, lon: 12.567 },
  { id: 'jesolo', name: 'Jesolo', region: 'Itálie · Benátsko', lat: 45.533, lon: 12.65 },
  { id: 'alghero', name: 'Alghero', region: 'Itálie · Sardinie', lat: 40.558, lon: 8.319 },
  { id: 'taormina', name: 'Taormina', region: 'Itálie · Sicílie', lat: 37.852, lon: 15.288 },
  { id: 'nice', name: 'Nice', region: "Francie · Côte d'Azur", lat: 43.71, lon: 7.262 },
  { id: 'biarritz', name: 'Biarritz', region: 'Francie · Atlantik', lat: 43.483, lon: -1.559 },
  { id: 'barcelona', name: 'Barcelona', region: 'Španělsko', lat: 41.385, lon: 2.173 },
  { id: 'palma', name: 'Palma', region: 'Španělsko · Mallorca', lat: 39.57, lon: 2.65 },
  { id: 'malaga', name: 'Málaga', region: 'Španělsko · Costa del Sol', lat: 36.721, lon: -4.421 },
  { id: 'tenerife', name: 'Costa Adeje', region: 'Španělsko · Tenerife', lat: 28.092, lon: -16.729 },
  { id: 'rhodos', name: 'Rhodos', region: 'Řecko', lat: 36.435, lon: 28.217 },
  { id: 'chania', name: 'Chania', region: 'Řecko · Kréta', lat: 35.514, lon: 24.018 },
  { id: 'korfu', name: 'Korfu', region: 'Řecko', lat: 39.625, lon: 19.922 },
  { id: 'gdansk', name: 'Gdaňsk', region: 'Polsko · Balt', lat: 54.352, lon: 18.646 },
  { id: 'sopot', name: 'Sopot', region: 'Polsko · Balt', lat: 54.442, lon: 18.56 },
  { id: 'usedom', name: 'Usedom', region: 'Německo · Balt', lat: 53.933, lon: 14.083 },
  { id: 'brighton', name: 'Brighton', region: 'Velká Británie', lat: 50.822, lon: -0.137 },
  { id: 'miami', name: 'Miami Beach', region: 'USA · Florida', lat: 25.79, lon: -80.13 },
  { id: 'santamonica', name: 'Santa Monica', region: 'USA · Kalifornie', lat: 34.019, lon: -118.491 },
];

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

function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(value) {
  const n = finite(value);
  return n == null ? null : Math.round(n * 10) / 10;
}

function round2(value) {
  const n = finite(value);
  return n == null ? null : Math.round(n * 100) / 100;
}

async function fetchMarineBatch(spots) {
  const latitudes = spots.map((s) => s.lat).join(',');
  const longitudes = spots.map((s) => s.lon).join(',');
  const url =
    `${MARINE_URL}?latitude=${latitudes}&longitude=${longitudes}` +
    `&current=sea_surface_temperature,wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height` +
    `&hourly=sea_surface_temperature,wave_height&daily=wave_height_max` +
    `&forecast_days=7&timezone=auto`;

  const response = await fetch(url, { headers: UA });
  if (!response.ok) throw new Error(`Open-Meteo Marine ${response.status}`);
  const json = await response.json();
  return Array.isArray(json) ? json : [json];
}

function compassFromDeg(deg) {
  const n = finite(deg);
  if (n == null) return null;
  const dirs = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
  const idx = Math.round((((n % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function dailySstSeries(times, values) {
  const byDay = new Map();
  for (let i = 0; i < times.length; i += 1) {
    const t = String(times[i] || '');
    const day = t.slice(0, 10);
    const hour = t.slice(11, 13);
    const v = round1(values[i]);
    if (!day || v == null) continue;
    const prev = byDay.get(day);
    if (!prev || hour === '12') byDay.set(day, { date: day, temperature: v });
  }
  return [...byDay.values()];
}

function mapSpot(spot, payload, originLat, originLon) {
  const current = payload?.current || {};
  const sst = round1(current.sea_surface_temperature);
  if (sst == null) return null;

  const hourlyTimes = payload?.hourly?.time || [];
  const hourlySst = payload?.hourly?.sea_surface_temperature || [];
  const history = hourlyTimes
    .map((t, i) => {
      const v = round1(hourlySst[i]);
      if (v == null) return null;
      return { t, v };
    })
    .filter(Boolean)
    .slice(0, 48);

  const forecast = dailySstSeries(hourlyTimes, hourlySst);
  let trend = null;
  if (forecast.length >= 2) {
    trend = round1(forecast[forecast.length - 1].temperature - forecast[0].temperature);
  }

  const dailyWaveMax = (payload?.daily?.time || []).map((date, i) => ({
    date,
    waveHeightMax: round2(payload.daily.wave_height_max?.[i]),
  })).filter((row) => row.waveHeightMax != null);

  const dist =
    Number.isFinite(originLat) && Number.isFinite(originLon)
      ? Math.round(distanceKm(originLat, originLon, spot.lat, spot.lon))
      : null;

  return {
    id: spot.id,
    name: spot.name,
    region: spot.region,
    lat: spot.lat,
    lon: spot.lon,
    temperature: sst,
    waveHeight: round2(current.wave_height),
    wavePeriod: round1(current.wave_period),
    waveDirection: finite(current.wave_direction),
    waveDirectionLabel: compassFromDeg(current.wave_direction),
    windWaveHeight: round2(current.wind_wave_height),
    swellWaveHeight: round2(current.swell_wave_height),
    time: current.time || null,
    history,
    forecast,
    dailyWaveMax,
    trend,
    distanceKm: dist,
    source: 'open-meteo-marine',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, 'http://localhost');
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const limit = Math.min(40, Math.max(5, Number(url.searchParams.get('limit')) || 16));

    const payloads = await fetchMarineBatch(SEA_SPOTS);
    const spots = SEA_SPOTS.map((spot, i) => mapSpot(spot, payloads[i], lat, lon)).filter(Boolean);

    spots.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return a.name.localeCompare(b.name, 'cs');
    });

    const nearest = spots[0] || null;
    const list = spots.slice(0, limit);

    return res.status(200).json({
      nearest,
      spots: list,
      attribution: "Open-Meteo Marine (SST · Copernicus)",
      updated: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Marine fetch failed' });
  }
}
