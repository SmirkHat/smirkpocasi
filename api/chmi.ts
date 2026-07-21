const METADATA_BASE = 'https://opendata.chmi.cz/meteorology/climate/now/metadata/';
const DATA_BASE = 'https://opendata.chmi.cz/meteorology/climate/now/data/';

let metaCache = null;
let metaCacheAt = 0;
const META_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_STATION_ATTEMPTS = 12;

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

async function getMetadata() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  if (metaCache && Date.now() - metaCacheAt < META_CACHE_TTL) return metaCache;

  try {
    // We try today's metadata, if fail try yesterday
    const url = `${METADATA_BASE}meta1-${today}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Metadata fetch failed');
    const json = await response.json();
    const values = json.data?.data?.values || [];
    
    const stations = values.map(v => ({
      wsi: v[0],
      id: v[1],
      name: v[2],
      lon: v[3],
      lat: v[4],
      elevation: v[5]
    }));

    metaCache = stations;
    metaCacheAt = Date.now();
    return stations;
  } catch (e) {
    console.error('CHMI metadata error:', e.message);
    // Try yesterday if today failed
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0].replace(/-/g, '');
    try {
      const url = `${METADATA_BASE}meta1-${yesterday}.json`;
      const response = await fetch(url);
      const json = await response.json();
      const stations = json.data?.data?.values.map(v => ({ wsi: v[0], id: v[1], name: v[2], lon: v[3], lat: v[4], elevation: v[5] }));
      metaCache = stations;
      metaCacheAt = Date.now();
      return stations;
    } catch {
      return [];
    }
  }
}

function dayStamp(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().split('T')[0].replace(/-/g, '');
}

async function fetchStationData(station, day) {
  const dataUrl = `${DATA_BASE}10m-${station.wsi}-${day}.json`;
  const response = await fetch(dataUrl);
  if (!response.ok) return null;

  const json = await response.json();
  const values = json.data?.data?.values || [];
  if (!values.length) return null;

  return values;
}

function measurementsFromValues(values) {
  const measurements = {};
  values.forEach(v => {
    const [, element, dt, val] = v;
    if (!measurements[dt]) measurements[dt] = { dt };
    measurements[dt][element] = val;
  });

  return measurements;
}

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Chybí lat nebo lon.' });
    return;
  }

  try {
    const stations = await getMetadata();
    if (!stations.length) throw new Error('Nepodařilo se načíst seznam stanic.');

    const userLat = Number(lat);
    const userLon = Number(lon);

    const nearestStations = stations
      .map(s => ({ ...s, dist: distanceKm(userLat, userLon, s.lat, s.lon) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, MAX_STATION_ATTEMPTS);

    let nearest = null;
    let values = [];

    for (const day of [dayStamp(), dayStamp(1)]) {
      for (const station of nearestStations) {
        const stationValues = await fetchStationData(station, day);
        if (!stationValues) continue;

        nearest = station;
        values = stationValues;
        break;
      }

      if (nearest) break;
    }

    if (!nearest) throw new Error(`Data nejsou dostupná pro ${nearestStations.length} nejbližších stanic.`);

    const measurements = measurementsFromValues(values);

    const sortedTimes = Object.keys(measurements).sort().reverse();
    const latest = measurements[sortedTimes[0]];
    if (!latest) throw new Error(`Stanice ${nearest.name} nemá použitelná měření.`);

    const result = {
      station: {
        id: nearest.id,
        wsi: nearest.wsi,
        name: nearest.name,
        distance: nearest.dist,
        elevation: nearest.elevation
      },
      current: {
        time: latest.dt,
        temperature: latest.T,
        humidity: latest.H,
        pressure: latest.P,
        windSpeed: latest.F,
        windDirection: latest.D,
        precipitation: latest.SRA10M,
        windGust: latest.Fmax
      },
      history: sortedTimes.slice(0, 12).map(t => ({
        time: t,
        temperature: measurements[t].T,
        precipitation: measurements[t].SRA10M
      })),
      attribution: 'Data: ČHMÚ (OpenData)'
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({ error: 'ČHMÚ data jsou nedostupná.', detail: error.message });
  }
}
