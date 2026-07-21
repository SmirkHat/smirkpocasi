const METADATA_URL = 'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata';
const CURRENT_BASE = 'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min';
const PARAMETERS = 'TL,RF,FF,DD,RR,P,FFX';

let stationsCache = null;
let stationsCacheAt = 0;
const META_TTL = 24 * 60 * 60 * 1000;

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

async function getStations() {
  if (stationsCache && Date.now() - stationsCacheAt < META_TTL) return stationsCache;
  const response = await fetch(METADATA_URL);
  if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
  const json = await response.json();
  stationsCache = (json.stations || [])
    .filter((s) => s.is_active !== false && Number.isFinite(s.lat) && Number.isFinite(s.lon))
    .map((s) => ({
      id: String(s.id),
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      altitude: s.altitude,
    }));
  stationsCacheAt = Date.now();
  return stationsCache;
}

function paramValue(feature, name) {
  const series = feature?.properties?.parameters?.[name]?.data;
  if (!Array.isArray(series) || !series.length) return null;
  const value = series[series.length - 1];
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
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
    const stations = await getStations();
    const nearest = stations
      .map((s) => ({ ...s, distance: distanceKm(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) throw new Error('Žádná GeoSphere stanice.');

    const currentUrl = `${CURRENT_BASE}?parameters=${PARAMETERS}&station_ids=${nearest.id}&output_format=geojson`;
    const response = await fetch(currentUrl);
    if (!response.ok) throw new Error(`Current HTTP ${response.status}`);
    const json = await response.json();
    const feature = json.features?.[0];
    if (!feature) throw new Error(`Stanice ${nearest.name} bez dat.`);

    return res.status(200).json({
      station: {
        id: nearest.id,
        name: nearest.name,
        distance: nearest.distance,
        lat: nearest.lat,
        lon: nearest.lon,
        altitude: nearest.altitude,
      },
      current: {
        time: json.timestamps?.[json.timestamps.length - 1] ?? null,
        temperature: paramValue(feature, 'TL'),
        humidity: paramValue(feature, 'RF'),
        pressure: paramValue(feature, 'P'),
        windSpeed: paramValue(feature, 'FF'),
        windDirection: paramValue(feature, 'DD'),
        windGust: paramValue(feature, 'FFX'),
        precipitation: paramValue(feature, 'RR'),
      },
      attribution: 'GeoSphere Austria (CC BY 4.0)',
    });
  } catch (error) {
    return res.status(502).json({ error: 'GeoSphere data jsou nedostupná.', detail: error.message });
  }
}
