const TOKEN_URL = 'https://api.netatmo.com/oauth2/token';
const PUBLIC_URL = 'https://api.netatmo.com/api/getpublicdata';

let tokenCache = null;
let tokenCacheAt = 0;

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

async function getAccessToken() {
  const clientId = process.env.NETATMO_CLIENT_ID;
  const clientSecret = process.env.NETATMO_CLIENT_SECRET;
  const refreshToken = process.env.NETATMO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('NETATMO_CLIENT_ID / NETATMO_CLIENT_SECRET / NETATMO_REFRESH_TOKEN are not configured.');
  }

  if (tokenCache && Date.now() - tokenCacheAt < 50 * 60 * 1000) return tokenCache;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error || 'Netatmo token refresh failed');
  }
  tokenCache = data.access_token;
  tokenCacheAt = Date.now();
  return tokenCache;
}

function parseStation(station, lat, lon) {
  const location = station?.place?.location;
  // Netatmo place.location is [lon, lat]
  const lonVal = Array.isArray(location) ? Number(location[0]) : null;
  const latVal = Array.isArray(location) ? Number(location[1]) : null;

  let temperature = null;
  let humidity = null;
  let pressure = null;
  let windSpeed = null;
  let windDirection = null;
  let windGust = null;
  let precipitation = null;
  let time = null;

  const measures = station.measures || {};
  for (const measure of Object.values(measures)) {
    const type = measure.type || [];
    const values = measure.res ? Object.values(measure.res)[0] : null;
    const stamp = measure.res ? Object.keys(measure.res)[0] : null;
    if (!values) continue;
    if (stamp) time = new Date(Number(stamp) * 1000).toISOString();
    type.forEach((key, index) => {
      const value = num(values[index]);
      if (key === 'temperature') temperature = value;
      if (key === 'humidity') humidity = value;
      if (key === 'pressure') pressure = value;
    });
    if (measure.rain_60min != null) precipitation = num(measure.rain_60min);
    if (measure.wind_strength != null) windSpeed = num(measure.wind_strength);
    if (measure.wind_angle != null) windDirection = num(measure.wind_angle);
    if (measure.gust_strength != null) windGust = num(measure.gust_strength);
  }

  return {
    id: station._id,
    name: station.place?.city || station._id,
    lat: latVal,
    lon: lonVal,
    distance:
      Number.isFinite(latVal) && Number.isFinite(lonVal) ? distanceKm(lat, lon, latVal, lonVal) : null,
    current: {
      time,
      temperature,
      humidity,
      pressure,
      windSpeed,
      windDirection,
      windGust,
      precipitation,
    },
  };
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
    return res.status(400).json({ error: 'Missing lat or lon.' });
  }

  if (!process.env.NETATMO_CLIENT_ID || !process.env.NETATMO_CLIENT_SECRET || !process.env.NETATMO_REFRESH_TOKEN) {
    return res.status(501).json({ error: 'Netatmo credentials are not configured.' });
  }

  try {
    const token = await getAccessToken();
    const delta = 0.08;
    const params = new URLSearchParams({
      lat_ne: String(lat + delta),
      lon_ne: String(lon + delta),
      lat_sw: String(lat - delta),
      lon_sw: String(lon - delta),
      filter: 'true',
    });
    const response = await fetch(`${PUBLIC_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Netatmo request failed.', detail: data });
    }

    const stations = (data.body || [])
      .map((station) => parseStation(station, lat, lon))
      .filter((s) => s.current.temperature != null || s.current.humidity != null)
      .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));

    const nearest = stations[0];
    if (!nearest) {
      return res.status(404).json({ error: 'No nearby Netatmo public station.' });
    }

    return res.status(200).json({
      station: {
        id: nearest.id,
        name: nearest.name,
        distance: nearest.distance,
        lat: nearest.lat,
        lon: nearest.lon,
      },
      current: nearest.current,
      attribution: 'Netatmo Weathermap (public PWS)',
    });
  } catch (error) {
    return res.status(502).json({ error: 'Netatmo is unavailable.', detail: error.message });
  }
}
