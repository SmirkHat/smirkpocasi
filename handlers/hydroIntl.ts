/**
 * International hydrology: FR, UK, US, PL, IE, CA, CH.
 * Same station shape as api/hydro.ts enrichMetrics().
 */

const MAX_STATION_KM = 150;
const MAP_RADIUS_KM = 180;
const MAP_MAX_MARKERS = 400;
const HISTORY_POINTS = 24;
const UA = { 'User-Agent': 'SmirkPocasi/1.0 (https://smirkhat.org)', Accept: 'application/json' };

export const FR_BOUNDS = { latMin: 41.0, latMax: 51.5, lonMin: -5.5, lonMax: 10.0 };
export const UK_BOUNDS = { latMin: 49.5, latMax: 61.0, lonMin: -8.8, lonMax: 2.0 };
export const US_BOUNDS = { latMin: 24.0, latMax: 49.5, lonMin: -125.0, lonMax: -66.0 };
export const PL_BOUNDS = { latMin: 49.0, latMax: 54.9, lonMin: 14.85, lonMax: 24.2 };
export const IE_BOUNDS = { latMin: 51.3, latMax: 55.5, lonMin: -10.7, lonMax: -5.3 };
export const CA_BOUNDS = { latMin: 41.5, latMax: 70.0, lonMin: -141.0, lonMax: -52.0 };
export const CH_BOUNDS = { latMin: 45.7, latMax: 47.9, lonMin: 5.8, lonMax: 10.6 };

let eaReadingsCache = null;
let eaReadingsCacheAt = 0;
const EA_READINGS_TTL = 10 * 60 * 1000;

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

function inBounds(lat, lon, bounds) {
  return lat >= bounds.latMin && lat <= bounds.latMax && lon >= bounds.lonMin && lon <= bounds.lonMax;
}

function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function spaLevel(value) {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
}

function computeSpaPct(height, spa1, refHigh = null) {
  const h = finite(height);
  if (h == null) return null;
  const denom = spaLevel(spa1) ?? spaLevel(refHigh);
  if (denom == null || denom <= 0) return null;
  return Math.round((h / denom) * 1000) / 10;
}

function computeFloodLevel(height, spa) {
  if (height == null || !spa) return 0;
  const spa3 = spaLevel(spa.spa3);
  const spa2 = spaLevel(spa.spa2);
  const spa1 = spaLevel(spa.spa1);
  if (spa3 != null && height >= spa3) return 3;
  if (spa2 != null && height >= spa2) return 2;
  if (spa1 != null && height >= spa1) return 1;
  return 0;
}

function downsampleSeries(points, maxPoints = HISTORY_POINTS) {
  if (!Array.isArray(points) || !points.length) return [];
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const out = [];
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

function mapHistory(raw) {
  return downsampleSeries(
    (raw || [])
      .map((row) => {
        const value = finite(row.value);
        const t = row.t || row.timestamp || row.dateTime || row.dt;
        if (value == null || !t) return null;
        return { t: typeof t === 'number' ? new Date(t).toISOString() : String(t), v: value };
      })
      .filter(Boolean),
  );
}

function roundFlow(value) {
  const n = finite(value);
  if (n == null) return null;
  const abs = Math.abs(n);
  if (abs >= 100) return Math.round(n);
  if (abs >= 10) return Math.round(n * 10) / 10;
  if (abs >= 1) return Math.round(n * 100) / 100;
  return Math.round(n * 1000) / 1000;
}

function enrich(station) {
  const height = finite(station.height) != null ? Math.round(finite(station.height) * 10) / 10 : null;
  const spa1 = spaLevel(station.spa1);
  const spa2 = spaLevel(station.spa2);
  const spa3 = spaLevel(station.spa3);
  const dry = spaLevel(station.dry) ?? finite(station.dry);
  const refHigh = spaLevel(station.refHigh);
  const history = Array.isArray(station.history) ? station.history : [];
  let trend = null;
  if (history.length >= 2) {
    const first = history[0].v;
    const last = history[history.length - 1].v;
    if (Number.isFinite(first) && Number.isFinite(last)) {
      trend = Math.round((last - first) * 10) / 10;
    }
  }
  return {
    ...station,
    height,
    flow: roundFlow(station.flow),
    spa1,
    spa2,
    spa3,
    dry,
    spaPct: computeSpaPct(height, spa1, refHigh),
    trend,
    history,
    floodLevel: station.floodLevel || computeFloodLevel(height, { spa1, spa2, spa3 }),
  };
}

function bbox(lat, lon, km) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    minLon: lon - dLon,
    minLat: lat - dLat,
    maxLon: lon + dLon,
    maxLat: lat + dLat,
    asQuery: `${(lon - dLon).toFixed(4)},${(lat - dLat).toFixed(4)},${(lon + dLon).toFixed(4)},${(lat + dLat).toFixed(4)}`,
  };
}

function nearRegion(lat, lon, bounds, centerLat, centerLon, maxKm) {
  return inBounds(lat, lon, bounds) || distanceKm(lat, lon, centerLat, centerLon) <= maxKm;
}

async function fetchJson(url, headers = UA) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}

// Hub'Eau (FR) — H mm→cm, Q m³/s

async function hubeauStations(lat, lon, radiusKm = 150) {
  const url =
    `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations` +
    `?latitude=${lat}&longitude=${lon}&distance=${radiusKm}&en_service=true&format=json&size=200`;
  const json = await fetchJson(url);
  return (json.data || [])
    .map((s) => {
      const slat = finite(s.latitude_station);
      const slon = finite(s.longitude_station);
      if (slat == null || slon == null) return null;
      return {
        code: s.code_station,
        name: s.libelle_station || s.libelle_site || s.code_station,
        river: s.libelle_cours_eau || '',
        lat: slat,
        lon: slon,
        _dist: distanceKm(lat, lon, slat, slon),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a._dist - b._dist);
}

async function hubeauObs(codeStation, { hours = 24, size = 200 } = {}) {
  const start = new Date(Date.now() - hours * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const url =
    `https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr` +
    `?code_station=${encodeURIComponent(codeStation)}&grandeur_hydro=H,Q` +
    `&date_debut_obs=${start}&size=${size}&sort=desc`;
  const json = await fetchJson(url);
  const rows = json.data || [];
  const heights = [];
  const flows = [];
  for (const row of rows) {
    const v = finite(row.resultat_obs);
    if (v == null) continue;
    if (row.grandeur_hydro === 'H') heights.push({ t: row.date_obs, value: v / 10 }); // mm → cm
    if (row.grandeur_hydro === 'Q') flows.push({ t: row.date_obs, value: v });
  }
  return {
    height: heights[0]?.value ?? null,
    flow: flows[0]?.value ?? null,
    time: heights[0]?.t || flows[0]?.t || null,
    history: mapHistory(heights.reverse()),
  };
}

export async function fetchHubeauNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, FR_BOUNDS, 46.5, 2.5, 320)) return [];
  try {
    const stations = (await hubeauStations(lat, lon, MAX_STATION_KM)).filter((s) => s._dist <= MAX_STATION_KM).slice(0, 8);
    return Promise.all(
      stations.map(async (s) => {
        try {
          const obs = await hubeauObs(s.code);
          return enrich({
            id: `hubeau-${s.code}`,
            name: s.name,
            river: s.river,
            lat: s.lat,
            lon: s.lon,
            height: obs.height,
            flow: obs.flow,
            time: obs.time,
            history: obs.history,
            spa1: null,
            spa2: null,
            spa3: null,
            dry: null,
            source: 'hubeau',
            attribution: "Hub'Eau Hydrométrie",
            country: 'FR',
            _dist: s._dist,
          });
        } catch {
          return null;
        }
      }),
    ).then((rows) => rows.filter(Boolean));
  } catch (e) {
    console.error('HubEau nearby error:', e.message);
    return [];
  }
}

export async function fetchHubeauMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, FR_BOUNDS, 46.5, 2.5, 320)) return [];
  try {
    const stations = await hubeauStations(lat, lon, MAP_RADIUS_KM);
    const box = bbox(lat, lon, MAP_RADIUS_KM);
    const start = new Date(Date.now() - 3 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const url =
      `https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr` +
      `?bbox=${box.asQuery}&grandeur_hydro=H&date_debut_obs=${start}&size=2000&sort=desc`;
    const json = await fetchJson(url);
    const latest = new Map();
    for (const row of json.data || []) {
      const code = row.code_station;
      if (!code || latest.has(code)) continue;
      const mm = finite(row.resultat_obs);
      if (mm == null) continue;
      latest.set(code, { height: mm / 10, time: row.date_obs, lat: finite(row.latitude), lon: finite(row.longitude) });
    }
    const byCode = new Map(stations.map((s) => [s.code, s]));
    const out = [];
    for (const [code, obs] of latest) {
      const meta = /** @type {{ lat?: number, lon?: number, name?: string, river?: string } | undefined} */ (
        byCode.get(code)
      );
      const slat = meta?.lat ?? obs.lat;
      const slon = meta?.lon ?? obs.lon;
      if (slat == null || slon == null) continue;
      const dist = distanceKm(lat, lon, slat, slon);
      out.push(
        enrich({
          id: `hubeau-${code}`,
          name: meta?.name || code,
          river: meta?.river || '',
          lat: slat,
          lon: slon,
          height: obs.height,
          flow: null,
          time: obs.time,
          history: [],
          spa1: null,
          spa2: null,
          spa3: null,
          dry: null,
          source: 'hubeau',
          attribution: "Hub'Eau Hydrométrie",
          country: 'FR',
          _dist: dist,
        }),
      );
    }
    return out.filter((s) => s._dist <= MAP_RADIUS_KM).sort((a, b) => a._dist - b._dist).slice(0, MAP_MAX_MARKERS);
  } catch (e) {
    console.error('HubEau map error:', e.message);
    return [];
  }
}

// Environment Agency (UK) — level m→cm; typicalRangeHigh as SPA1 stand-in

function eaNotationFromMeasure(measureUri) {
  const m = String(measureUri || '').match(/\/measures\/([^/]+)/);
  if (!m) return null;
  // measure URI …/measures/2804TH-level-… → 2804TH
  return m[1].split('-')[0] || null;
}

async function getEaLatestByNotation() {
  if (eaReadingsCache && Date.now() - eaReadingsCacheAt < EA_READINGS_TTL) return eaReadingsCache;
  const json = await fetchJson('https://environment.data.gov.uk/flood-monitoring/data/readings?latest');
  const byNotation = new Map();
  for (const row of json.items || []) {
    const notation = eaNotationFromMeasure(row.measure);
    const value = finite(row.value);
    if (!notation || value == null) continue;
    const measure = String(row.measure || '');
    if (!measure.includes('-level-')) continue;
    if (byNotation.has(notation)) continue;
    byNotation.set(notation, { valueM: value, time: row.dateTime || null });
  }
  eaReadingsCache = byNotation;
  eaReadingsCacheAt = Date.now();
  return byNotation;
}

async function eaStationsNear(lat, lon, distKm) {
  const url =
    `https://environment.data.gov.uk/flood-monitoring/id/stations` +
    `?lat=${lat}&long=${lon}&dist=${distKm}&parameter=level`;
  const json = await fetchJson(url);
  return (json.items || [])
    .map((s) => {
      const slat = finite(s.lat);
      const slon = finite(s.long);
      if (slat == null || slon == null) return null;
      return {
        notation: s.notation || s.stationReference,
        name: s.label || s.notation,
        river: s.riverName || '',
        lat: slat,
        lon: slon,
        town: s.town || '',
        _dist: distanceKm(lat, lon, slat, slon),
        href: s['@id'],
      };
    })
    .filter(Boolean)
    .sort((a, b) => a._dist - b._dist);
}

async function eaEnrichDetail(station) {
  if (!station.href) return station;
  try {
    const json = await fetchJson(station.href);
    const item = json.items;
    const scale = item?.stageScale;
    const spa1 = scale?.typicalRangeHigh != null ? Number(scale.typicalRangeHigh) * 100 : null;
    const spa3 = scale?.maxOnRecord?.value != null ? Number(scale.maxOnRecord.value) * 100 : null;
    const dry = scale?.typicalRangeLow != null ? Number(scale.typicalRangeLow) * 100 : null;
    let history = [];
    const levelMeasure = (item?.measures || []).find(
      (m) => m.parameter === 'level' && m.latestReading,
    );
    if (levelMeasure?.['@id']) {
      const readings = await fetchJson(`${levelMeasure['@id']}/readings?_sorted&_limit=48`);
      history = mapHistory(
        (readings.items || [])
          .map((r) => ({ t: r.dateTime, value: finite(r.value) != null ? finite(r.value) * 100 : null }))
          .filter((r) => r.value != null)
          .reverse(),
      );
    }
    return { ...station, spa1, spa2: null, spa3, dry, history };
  } catch {
    return station;
  }
}

export async function fetchEaNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, UK_BOUNDS, 54.0, -2.5, 350)) return [];
  try {
    const [stations, readings] = await Promise.all([
      eaStationsNear(lat, lon, MAX_STATION_KM),
      getEaLatestByNotation(),
    ]);
    const top = stations.filter((s) => s._dist <= MAX_STATION_KM).slice(0, 8);
    const enriched = await Promise.all(top.map((s) => eaEnrichDetail(s)));
    return enriched
      .map((s) => {
        const reading = readings.get(s.notation);
        const height = reading ? reading.valueM * 100 : null;
        if (height == null) return null;
        return enrich({
          id: `ea-${s.notation}`,
          name: s.name,
          river: s.river,
          lat: s.lat,
          lon: s.lon,
          height,
          flow: null,
          time: reading?.time || null,
          history: s.history || [],
          spa1: s.spa1 ?? null,
          spa2: null,
          spa3: s.spa3 ?? null,
          dry: s.dry ?? null,
          refHigh: s.spa1 ?? null,
          source: 'ea',
          attribution: 'Environment Agency',
          country: 'UK',
          _dist: s._dist,
        });
      })
      .filter(Boolean);
  } catch (e) {
    console.error('EA nearby error:', e.message);
    return [];
  }
}

export async function fetchEaMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, UK_BOUNDS, 54.0, -2.5, 350)) return [];
  try {
    const [stations, readings] = await Promise.all([
      eaStationsNear(lat, lon, MAP_RADIUS_KM),
      getEaLatestByNotation(),
    ]);
    return stations
      .filter((s) => s._dist <= MAP_RADIUS_KM)
      .map((s) => {
        const reading = readings.get(s.notation);
        if (!reading) return null;
        return enrich({
          id: `ea-${s.notation}`,
          name: s.name,
          river: s.river,
          lat: s.lat,
          lon: s.lon,
          height: reading.valueM * 100,
          flow: null,
          time: reading.time,
          history: [],
          spa1: null,
          spa2: null,
          spa3: null,
          dry: null,
          source: 'ea',
          attribution: 'Environment Agency',
          country: 'UK',
          _dist: s._dist,
        });
      })
      .filter(Boolean)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, MAP_MAX_MARKERS);
  } catch (e) {
    console.error('EA map error:', e.message);
    return [];
  }
}

// USGS — 00065 ft→cm, 00060 cfs→m³/s

const FT_TO_CM = 30.48;
const CFS_TO_M3S = 0.0283168466;

function usgsParseIv(json, lat, lon) {
  const series = json?.value?.timeSeries || [];
  const bySite = new Map();
  for (const ts of series) {
    const site = ts.sourceInfo || {};
    const code = site.siteCode?.[0]?.value;
    if (!code) continue;
    const geo = site.geoLocation?.geogLocation || {};
    const slat = finite(geo.latitude);
    const slon = finite(geo.longitude);
    if (slat == null || slon == null) continue;
    const param = site && ts.variable?.variableCode?.[0]?.value;
    const values = ts.values?.[0]?.value || [];
    const latest = values[values.length - 1];
    if (!latest) continue;
    const raw = finite(latest.value);
    if (raw == null) continue;
    let entry = bySite.get(code);
    if (!entry) {
      entry = {
        code,
        name: site.siteName || code,
        lat: slat,
        lon: slon,
        _dist: distanceKm(lat, lon, slat, slon),
        height: null,
        flow: null,
        time: null,
        heightHistory: [],
      };
      bySite.set(code, entry);
    }
    if (param === '00065') {
      entry.height = raw * FT_TO_CM;
      entry.time = latest.dateTime || entry.time;
      entry.heightHistory = values.map((v) => ({
        t: v.dateTime,
        value: finite(v.value) != null ? finite(v.value) * FT_TO_CM : null,
      })).filter((v) => v.value != null);
    }
    if (param === '00060') {
      entry.flow = raw * CFS_TO_M3S;
      entry.time = entry.time || latest.dateTime;
    }
  }
  return [...bySite.values()];
}

function usgsRiverName(siteName) {
  const name = String(siteName || '');
  const at = name.split(/\s+AT\s+/i);
  if (at.length > 1) return at[0].trim();
  const nr = name.split(/\s+NR\s+/i);
  if (nr.length > 1) return nr[0].trim();
  return '';
}

async function usgsIvBBox(lat, lon, km) {
  const box = bbox(lat, lon, km);
  const url =
    `https://waterservices.usgs.gov/nwis/iv/?format=json` +
    `&bBox=${box.minLon.toFixed(4)},${box.minLat.toFixed(4)},${box.maxLon.toFixed(4)},${box.maxLat.toFixed(4)}` +
    `&parameterCd=00065,00060&siteStatus=active`;
  return fetchJson(url, {
    ...UA,
    'User-Agent': 'SmirkPocasi/1.0 (https://smirkhat.org; hydro)',
  });
}

export async function fetchUsgsNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, US_BOUNDS, 39.5, -98.0, 800)) return [];
  try {
    const json = await usgsIvBBox(lat, lon, MAX_STATION_KM);
    const sites = usgsParseIv(json, lat, lon)
      .filter((s) => s._dist <= MAX_STATION_KM && (s.height != null || s.flow != null))
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 8);
    return sites.map((s) =>
      enrich({
        id: `usgs-${s.code}`,
        name: s.name,
        river: usgsRiverName(s.name),
        lat: s.lat,
        lon: s.lon,
        height: s.height,
        flow: s.flow,
        time: s.time,
        history: mapHistory(s.heightHistory),
        spa1: null,
        spa2: null,
        spa3: null,
        dry: null,
        source: 'usgs',
        attribution: 'USGS',
        country: 'US',
        _dist: s._dist,
      }),
    );
  } catch (e) {
    console.error('USGS nearby error:', e.message);
    return [];
  }
}

export async function fetchUsgsMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, US_BOUNDS, 39.5, -98.0, 800)) return [];
  try {
    const json = await usgsIvBBox(lat, lon, MAP_RADIUS_KM);
    return usgsParseIv(json, lat, lon)
      .filter((s) => (s.height != null || s.flow != null) && s._dist <= MAP_RADIUS_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, MAP_MAX_MARKERS)
      .map((s) =>
        enrich({
          id: `usgs-${s.code}`,
          name: s.name,
          river: usgsRiverName(s.name),
          lat: s.lat,
          lon: s.lon,
          height: s.height,
          flow: s.flow,
          time: s.time,
          history: [],
          spa1: null,
          spa2: null,
          spa3: null,
          dry: null,
          source: 'usgs',
          attribution: 'USGS',
          country: 'US',
          _dist: s._dist,
        }),
      );
  } catch (e) {
    console.error('USGS map error:', e.message);
    return [];
  }
}

export function inIntlHydroCoverage(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    nearRegion(lat, lon, FR_BOUNDS, 46.5, 2.5, 320) ||
    nearRegion(lat, lon, UK_BOUNDS, 54.0, -2.5, 350) ||
    nearRegion(lat, lon, US_BOUNDS, 39.5, -98.0, 800) ||
    nearRegion(lat, lon, PL_BOUNDS, 52.0, 19.5, 320) ||
    nearRegion(lat, lon, IE_BOUNDS, 53.4, -8.0, 280) ||
    nearRegion(lat, lon, CA_BOUNDS, 56.0, -96.0, 1200) ||
    nearRegion(lat, lon, CH_BOUNDS, 46.8, 8.2, 180)
  );
}

// IMGW (PL) — stage cm, discharge m³/s, water temperature °C

let imgwCache = null;
let imgwCacheAt = 0;
const IMGW_TTL = 10 * 60 * 1000;

async function getImgwStations() {
  if (imgwCache && Date.now() - imgwCacheAt < IMGW_TTL) return imgwCache;
  const json = await fetchJson('https://danepubliczne.imgw.pl/api/data/hydro');
  imgwCache = Array.isArray(json) ? json : [];
  imgwCacheAt = Date.now();
  return imgwCache;
}

function mapImgwRow(row, lat, lon) {
  const slat = finite(row.lat);
  const slon = finite(row.lon);
  if (slat == null || slon == null) return null;
  const height = finite(row.stan_wody);
  const flow = finite(row.przeplyw);
  // IMGW often sends 0 without a timestamp as a missing placeholder.
  const rawTemp = finite(row.temperatura_wody);
  const waterTemperature =
    rawTemp != null && (rawTemp !== 0 || row.temperatura_wody_data_pomiaru) ? rawTemp : null;
  if (height == null && flow == null && waterTemperature == null) return null;
  return enrich({
    id: `imgw-${row.id_stacji}`,
    name: row.stacja || row.id_stacji,
    river: row.rzeka || '',
    lat: slat,
    lon: slon,
    height,
    flow,
    waterTemperature,
    time: row.stan_wody_data_pomiaru || row.temperatura_wody_data_pomiaru || null,
    history: [],
    spa1: null,
    spa2: null,
    spa3: null,
    dry: null,
    source: 'imgw',
    attribution: 'IMGW-PIB',
    country: 'PL',
    _dist: distanceKm(lat, lon, slat, slon),
  });
}

export async function fetchImgwNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, PL_BOUNDS, 52.0, 19.5, 320)) return [];
  try {
    const rows = await getImgwStations();
    return rows
      .map((row) => mapImgwRow(row, lat, lon))
      .filter((s) => s && s._dist <= MAX_STATION_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 8);
  } catch (e) {
    console.error('IMGW nearby error:', e.message);
    return [];
  }
}

export async function fetchImgwMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, PL_BOUNDS, 52.0, 19.5, 320)) return [];
  try {
    const rows = await getImgwStations();
    return rows
      .map((row) => mapImgwRow(row, lat, lon))
      .filter((s) => s && s._dist <= MAP_RADIUS_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, MAP_MAX_MARKERS);
  } catch (e) {
    console.error('IMGW map error:', e.message);
    return [];
  }
}

// Ireland OPW — value m→cm

let ieCache = null;
let ieCacheAt = 0;
const IE_TTL = 10 * 60 * 1000;

async function getIeFeatures() {
  if (ieCache && Date.now() - ieCacheAt < IE_TTL) return ieCache;
  const json = await fetchJson('https://waterlevel.ie/geojson/latest/');
  ieCache = json.features || [];
  ieCacheAt = Date.now();
  return ieCache;
}

function mapIeFeature(f, lat, lon) {
  const coords = f.geometry?.coordinates;
  const slon = finite(coords?.[0]);
  const slat = finite(coords?.[1]);
  if (slat == null || slon == null) return null;
  const heightM = finite(f.properties?.value);
  if (heightM == null) return null;
  const ref = f.properties?.station_ref || f.id;
  return enrich({
    id: `opw-${ref}`,
    name: f.properties?.station_name || String(ref),
    river: '',
    lat: slat,
    lon: slon,
    height: heightM * 100,
    flow: null,
    time: f.properties?.datetime || null,
    history: [],
    spa1: null,
    spa2: null,
    spa3: null,
    dry: null,
    source: 'opw',
    attribution: 'OPW waterlevel.ie',
    country: 'IE',
    _dist: distanceKm(lat, lon, slat, slon),
  });
}

export async function fetchOpwNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, IE_BOUNDS, 53.4, -8.0, 280)) return [];
  try {
    const features = await getIeFeatures();
    return features
      .map((f) => mapIeFeature(f, lat, lon))
      .filter((s) => s && s._dist <= MAX_STATION_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 8);
  } catch (e) {
    console.error('OPW nearby error:', e.message);
    return [];
  }
}

export async function fetchOpwMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, IE_BOUNDS, 53.4, -8.0, 280)) return [];
  try {
    const features = await getIeFeatures();
    return features
      .map((f) => mapIeFeature(f, lat, lon))
      .filter((s) => s && s._dist <= MAP_RADIUS_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, MAP_MAX_MARKERS);
  } catch (e) {
    console.error('OPW map error:', e.message);
    return [];
  }
}

// Canada WSC — LEVEL m→cm, DISCHARGE m³/s

function mapCaFeature(f, lat, lon) {
  const p = f.properties || {};
  const coords = f.geometry?.coordinates;
  const slon = finite(coords?.[0]);
  const slat = finite(coords?.[1]);
  if (slat == null || slon == null) return null;
  const heightM = finite(p.LEVEL);
  const flow = finite(p.DISCHARGE);
  if (heightM == null && flow == null) return null;
  const code = p.STATION_NUMBER || p.IDENTIFIER;
  const name = p.STATION_NAME || code;
  return enrich({
    id: `wsc-${code}`,
    name,
    river: usgsRiverName(name),
    lat: slat,
    lon: slon,
    height: heightM != null ? heightM * 100 : null,
    flow,
    time: p.DATETIME || null,
    history: [],
    spa1: null,
    spa2: null,
    spa3: null,
    dry: null,
    source: 'wsc',
    attribution: 'ECCC Water Survey of Canada',
    country: 'CA',
    _dist: distanceKm(lat, lon, slat, slon),
  });
}

async function fetchCaBBox(lat, lon, km) {
  const box = bbox(lat, lon, km);
  const url =
    `https://api.weather.gc.ca/collections/hydrometric-realtime/items` +
    `?bbox=${box.minLon.toFixed(3)},${box.minLat.toFixed(3)},${box.maxLon.toFixed(3)},${box.maxLat.toFixed(3)}` +
    `&limit=200&sortby=-DATETIME&f=json`;
  const json = await fetchJson(url);
  const latest = new Map();
  for (const f of json.features || []) {
    const code = f.properties?.STATION_NUMBER;
    if (!code || latest.has(code)) continue;
    latest.set(code, f);
  }
  return [...latest.values()];
}

export async function fetchWscNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, CA_BOUNDS, 56.0, -96.0, 1200)) return [];
  try {
    const features = await fetchCaBBox(lat, lon, MAX_STATION_KM);
    return features
      .map((f) => mapCaFeature(f, lat, lon))
      .filter((s) => s && s._dist <= MAX_STATION_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 8);
  } catch (e) {
    console.error('WSC nearby error:', e.message);
    return [];
  }
}

export async function fetchWscMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, CA_BOUNDS, 56.0, -96.0, 1200)) return [];
  try {
    const features = await fetchCaBBox(lat, lon, MAP_RADIUS_KM);
    return features
      .map((f) => mapCaFeature(f, lat, lon))
      .filter((s) => s && s._dist <= MAP_RADIUS_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, MAP_MAX_MARKERS);
  } catch (e) {
    console.error('WSC map error:', e.message);
    return [];
  }
}

// Switzerland (BAFU via Existenz) — relative stage, flow, temperature

let chCache = null;
let chCacheAt = 0;
const CH_TTL = 10 * 60 * 1000;

async function getChStations() {
  if (chCache && Date.now() - chCacheAt < CH_TTL) return chCache;
  const [locJson, latestJson] = await Promise.all([
    fetchJson('https://api.existenz.ch/apiv1/hydro/locations?app=SmirkPocasi&version=1.0'),
    fetchJson('https://api.existenz.ch/apiv1/hydro/latest?app=SmirkPocasi&version=1.0'),
  ]);
  const locations = locJson.payload || {};
  const byLoc = new Map();
  for (const row of latestJson.payload || []) {
    if (!byLoc.has(row.loc)) byLoc.set(row.loc, {});
    byLoc.get(row.loc)[row.par] = { val: finite(row.val), t: row.timestamp };
  }
  const out = [];
  for (const [id, meta] of Object.entries(locations)) {
    const details =
      /** @type {{ lat?: number, lon?: number, name?: string, 'water-body-name'?: string }} */ (
        meta?.details || {}
      );
    const slat = finite(details.lat);
    const slon = finite(details.lon);
    if (slat == null || slon == null) continue;
    const vals = byLoc.get(id) || {};
    const heightAbs = vals.height_abs?.val;
    const flow = vals.flow?.val;
    const waterTemperature = vals.temperature?.val;
    // Prefer relative stage (height_abs); skip absolute m a.s.l. and zero placeholders.
    const height = heightAbs != null && heightAbs > 0 ? heightAbs * 100 : null;
    if (height == null && flow == null && waterTemperature == null) continue;
    const ts = vals.height_abs?.t || vals.flow?.t || vals.temperature?.t;
    out.push({
      id,
      name: details.name || id,
      river: details['water-body-name'] || '',
      lat: slat,
      lon: slon,
      height,
      flow,
      waterTemperature,
      time: ts ? new Date(ts * 1000).toISOString() : null,
    });
  }
  chCache = out;
  chCacheAt = Date.now();
  return out;
}

function mapChStation(s, lat, lon) {
  return enrich({
    id: `bafu-${s.id}`,
    name: s.name,
    river: s.river,
    lat: s.lat,
    lon: s.lon,
    height: s.height,
    flow: s.flow,
    waterTemperature: s.waterTemperature,
    time: s.time,
    history: [],
    spa1: null,
    spa2: null,
    spa3: null,
    dry: null,
    source: 'bafu',
    attribution: 'BAFU/FOEN via Existenz',
    country: 'CH',
    _dist: distanceKm(lat, lon, s.lat, s.lon),
  });
}

export async function fetchBafuNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, CH_BOUNDS, 46.8, 8.2, 180)) return [];
  try {
    const stations = await getChStations();
    return stations
      .map((s) => mapChStation(s, lat, lon))
      .filter((s) => s._dist <= MAX_STATION_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 8);
  } catch (e) {
    console.error('BAFU nearby error:', e.message);
    return [];
  }
}

export async function fetchBafuMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!nearRegion(lat, lon, CH_BOUNDS, 46.8, 8.2, 180)) return [];
  try {
    const stations = await getChStations();
    return stations
      .map((s) => mapChStation(s, lat, lon))
      .filter((s) => s._dist <= MAP_RADIUS_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, MAP_MAX_MARKERS);
  } catch (e) {
    console.error('BAFU map error:', e.message);
    return [];
  }
}
