const META_URL = 'https://opendata.chmi.cz/air_quality/now/metadata/metadata.json';
const DATA_URL = 'https://opendata.chmi.cz/air_quality/now/data/airquality_1h_avg_CZ.csv';

const META_TTL = 24 * 60 * 60 * 1000;
const DATA_TTL = 10 * 60 * 1000;
const NEAREST_LIMIT = 10;
const CANDIDATE_SCAN = 50;
const MAX_STATION_KM = 80;

let metaCache = null;
let metaCacheAt = 0;
let dataCache = null;
let dataCacheAt = 0;

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

function indexLabel(value) {
  const discrete = {
    0: { label: 'Neúplná data', level: null, aqi: null },
    1: { label: 'Velmi dobrá až dobrá', level: '1A', aqi: 15 },
    2: { label: 'Velmi dobrá až dobrá', level: '1B', aqi: 30 },
    3: { label: 'Přijatelná', level: '2A', aqi: 45 },
    4: { label: 'Přijatelná', level: '2B', aqi: 55 },
    5: { label: 'Zhoršená až špatná', level: '3A', aqi: 75 },
    6: { label: 'Zhoršená až špatná', level: '3B', aqi: 90 }
  };

  if (!Number.isFinite(value)) return discrete[0];
  if (Object.prototype.hasOwnProperty.call(discrete, value)) return discrete[value];

  if (value < 0.34) return discrete[1];
  if (value < 0.67) return discrete[2];
  if (value < 1) return discrete[3];
  if (value < 1.5) return discrete[4];
  if (value < 2) return discrete[5];
  return discrete[6];
}

async function getStations() {
  if (metaCache && Date.now() - metaCacheAt < META_TTL) return metaCache;

  const response = await fetch(META_URL);
  if (!response.ok) throw new Error('AQI metadata fetch failed');
  const json = await response.json();
  const localities = json.data?.Localities || [];
  const stations = [];

  for (const locality of localities) {
    if (locality.Active === false) continue;
    const lat = locality.Localization?.LatAsNumber;
    const lon = locality.Localization?.LonAsNumber;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const components = new Map();
    for (const program of locality.MeasuringPrograms || []) {
      for (const measurement of program.Measurements || []) {
        if (!measurement.IdRegistration || !measurement.ComponentCode) continue;
        components.set(String(measurement.IdRegistration), measurement.ComponentCode);
      }
    }

    stations.push({
      code: locality.LocalityCode,
      name: locality.Name || locality.BasicInfo?.LocalityName,
      lat,
      lon,
      components
    });
  }

  metaCache = stations;
  metaCacheAt = Date.now();
  return stations;
}

async function getMeasurements() {
  if (dataCache && Date.now() - dataCacheAt < DATA_TTL) return dataCache;

  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('AQI data fetch failed');
  const text = await response.text();
  const rows = new Map();

  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [idRegistration, startTime, idValueType, value] = line.split(',').map((part) => part.trim());
    const type = Number(idValueType);
    if (type !== 8 && type !== 148) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;

    if (!rows.has(idRegistration)) rows.set(idRegistration, { updatedAt: startTime });
    const entry = rows.get(idRegistration);
    entry.updatedAt = startTime;
    if (type === 148) entry.index = numeric;
    else entry.value = numeric;
  }

  dataCache = rows;
  dataCacheAt = Date.now();
  return rows;
}

function stationReading(station, measurements) {
  const values = {};
  let updatedAt = null;
  let indexValue = null;

  for (const [idRegistration, component] of station.components.entries()) {
    const row = measurements.get(String(idRegistration));
    if (!row) continue;
    updatedAt = row.updatedAt || updatedAt;
    if (component === 'INDX' && row.index != null) indexValue = row.index;
    if (row.value == null) continue;
    if (component === 'PM10') values.pm10 = row.value;
    if (component === 'PM2_5' || component === 'PM25') values.pm25 = row.value;
    if (component === 'NO2') values.no2 = row.value;
    if (component === 'O3') values.o3 = row.value;
    if (component === 'SO2') values.so2 = row.value;
    if (component === 'INDX') indexValue = row.value;
  }

  if (indexValue == null) {
    for (const [idRegistration, component] of station.components.entries()) {
      if (component !== 'INDX') continue;
      const row = measurements.get(String(idRegistration));
      if (row?.index != null) indexValue = row.index;
      else if (row?.value != null) indexValue = row.value;
    }
  }

  if (values.pm10 == null && values.pm25 == null && values.no2 == null && indexValue == null) {
    return null;
  }

  const index = indexLabel(indexValue);
  return {
    station: {
      code: station.code,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      distanceKm: Number(station.distanceKm.toFixed(1))
    },
    aqi: index.aqi,
    indexValue,
    indexLevel: index.level,
    label: index.label,
    pm10: values.pm10 ?? null,
    pm25: values.pm25 ?? null,
    no2: values.no2 ?? null,
    o3: values.o3 ?? null,
    so2: values.so2 ?? null,
    updatedAt
  };
}

export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'Chybí lat nebo lon.' });
    return;
  }

  try {
    const [stations, measurements] = await Promise.all([getStations(), getMeasurements()]);
    const ranked = stations
      .map((station) => ({ ...station, distanceKm: distanceKm(lat, lon, station.lat, station.lon) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearest = [];
    for (const station of ranked.slice(0, CANDIDATE_SCAN)) {
      if (station.distanceKm > MAX_STATION_KM) break;
      const reading = stationReading(station, measurements);
      if (!reading) continue;
      nearest.push(reading);
      if (nearest.length >= NEAREST_LIMIT) break;
    }

    if (!nearest.length) {
      res.status(404).json({ error: 'Pro tuto polohu nejsou dostupná imisní data ČHMÚ.' });
      return;
    }

    const best = nearest[0];
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({
      ...best,
      stations: nearest,
      attribution: 'Data: ČHMÚ OpenData (kvalita ovzduší / ISKO)'
    });
  } catch (error) {
    res.status(502).json({ error: 'ČHMÚ AQI je nedostupné.', detail: error.message });
  }
}
