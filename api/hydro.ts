import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  fetchEaMapStations,
  fetchEaNearby,
  fetchHubeauMapStations,
  fetchHubeauNearby,
  fetchUsgsMapStations,
  fetchUsgsNearby,
  fetchImgwMapStations,
  fetchImgwNearby,
  fetchOpwMapStations,
  fetchOpwNearby,
  fetchWscMapStations,
  fetchWscNearby,
  fetchBafuMapStations,
  fetchBafuNearby,
  FR_BOUNDS,
  UK_BOUNDS,
  US_BOUNDS,
  PL_BOUNDS,
  IE_BOUNDS,
  CA_BOUNDS,
  CH_BOUNDS,
} from './hydroIntl';

const ALL_PROFILES = JSON.parse(readFileSync(join(process.cwd(), 'data/hydro-stations.json'), 'utf8'));
const OPENDATA_META_URL = 'https://opendata.chmi.cz/hydrology/now/metadata/meta1.json';
const OPENDATA_DATA_BASE = 'https://opendata.chmi.cz/hydrology/now/data/';
const INPOCASI_HYDRO_URL = 'https://www.in-pocasi.cz/stavy-rek/ajax/stations.json.php';
const PEGEL_STATIONS_URL =
  'https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true';
const PEGEL_BASE = 'https://www.pegelonline.wsv.de/webservices/rest-api/v2';
const SHMU_GEOJSON_URL = 'https://www.shmu.sk/popups/hydro/vodne_toky/hydro_stations_geojson.php';
const SHMU_OVERVIEW_URL = 'https://www.shmu.sk/sk/?page=1&id=hydro_vod_all';
const SHMU_TOOLTIP_URL = 'https://www.shmu.sk/popups/hydro/vodne_toky/tooltip.php';
const SHMU_DETAIL_URL = 'https://www.shmu.sk/sk/?page=1&id=hydro_vod_all&station_id=';
const SHMU_UA = { 'User-Agent': 'SmirkPocasi/1.0', Accept: 'text/html,application/json' };

let metaCache = null;
let metaCacheAt = 0;
const META_CACHE_TTL = 60 * 60 * 1000;

let inpocasiCache = null;
let inpocasiCacheAt = 0;
const INPOCASI_TTL = 5 * 60 * 1000;

let pegelCache = null;
let pegelCacheAt = 0;
const PEGEL_TTL = 15 * 60 * 1000;

let shmuGeoCache = null;
let shmuGeoCacheAt = 0;
const SHMU_GEO_TTL = 60 * 60 * 1000;

let shmuLevelsCache = null;
let shmuLevelsCacheAt = 0;
const SHMU_LEVELS_TTL = 5 * 60 * 1000;

const MAX_STATION_KM = 150;
const HISTORY_POINTS = 24;

/** Approximate Germany bbox — PEGELONLINE federal gauges. */
const DE_BOUNDS = { latMin: 47.2, latMax: 55.2, lonMin: 5.7, lonMax: 15.1 };
/** Czechia + small border margin. */
const CZ_BOUNDS = { latMin: 48.0, latMax: 51.6, lonMin: 11.5, lonMax: 19.6 };
/** Slovakia. */
const SK_BOUNDS = { latMin: 47.7, latMax: 49.7, lonMin: 16.8, lonMax: 22.6 };

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

function numberFrom(text) {
  const match = String(text || '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Treat non-positive SPA thresholds as missing. */
function spaLevel(value) {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
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

function mapHeightHistory(raw) {
  return downsampleSeries(
    (raw || [])
      .map((row) => {
        const value = finite(row.value);
        const t = row.dt || row.timestamp;
        if (value == null || !t) return null;
        return { t, v: value };
      })
      .filter(Boolean),
  );
}

/** % of SPA1 (or DE MW/MHW reference). */
function computeSpaPct(height, spa1, refHigh = null) {
  const h = finite(height);
  if (h == null) return null;
  const denom = finite(spa1) ?? finite(refHigh);
  if (denom == null || denom <= 0) return null;
  return Math.round((h / denom) * 1000) / 10;
}

function enrichMetrics(station) {
  const height = finite(station.height);
  const flow = (() => {
    const n = finite(station.flow);
    if (n == null) return null;
    const abs = Math.abs(n);
    if (abs >= 100) return Math.round(n);
    if (abs >= 10) return Math.round(n * 10) / 10;
    if (abs >= 1) return Math.round(n * 100) / 100;
    return Math.round(n * 1000) / 1000;
  })();
  const spa1 = spaLevel(station.spa1);
  const spa2 = spaLevel(station.spa2);
  const spa3 = spaLevel(station.spa3);
  const dry = spaLevel(station.dry) ?? finite(station.dry);
  const refHigh = spaLevel(station.refHigh);
  const spaPct = computeSpaPct(height, spa1, refHigh);
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
    flow,
    spa1,
    spa2,
    spa3,
    dry,
    spaPct,
    trend,
    history,
  };
}

async function getMetadata() {
  if (metaCache && Date.now() - metaCacheAt < META_CACHE_TTL) return metaCache;
  try {
    const response = await fetch(OPENDATA_META_URL);
    if (!response.ok) throw new Error('Metadata fetch failed');
    const json = await response.json();
    const values = json.data?.data?.values || [];
    const byKey = new Map();
    const stations = values.map((v) => {
      const station = {
        objID: v[0],
        dbc: v[1],
        name: v[2],
        river: v[3],
        lat: Number(v[4]),
        lon: Number(v[5]),
        spaLimits: {
          spa1: spaLevel(v[10]),
          spa2: spaLevel(v[11]),
          spa3: spaLevel(v[12]),
          spa4: spaLevel(v[13]),
          dry: spaLevel(v[9]) ?? finite(v[9]),
        },
      };
      const key = `${String(v[2]).toLowerCase().trim()}|${String(v[3]).toLowerCase().trim()}`;
      byKey.set(key, station);
      return station;
    });
    metaCache = { byKey, stations };
    metaCacheAt = Date.now();
    return metaCache;
  } catch (e) {
    console.error('Hydro metadata error:', e.message);
    return { byKey: new Map(), stations: [] };
  }
}

function parseSpaLimitsHTML(root) {
  const limits = { spa1: null, spa2: null, spa3: null, spa4: null, dry: null };
  const rows = root.querySelectorAll('tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    if (cells.length < 2) continue;
    const label = (cells[0].text || '').toLowerCase();
    const value = numberFrom(cells[1].text);
    if (label.includes('1. spa') || label.includes('spa1') || label.includes('bd1')) limits.spa1 = value;
    else if (label.includes('2. spa') || label.includes('spa2') || label.includes('bd2')) limits.spa2 = value;
    else if (label.includes('3. spa') || label.includes('spa3') || label.includes('bd3')) limits.spa3 = value;
    else if (label.includes('4. spa') || label.includes('spa4') || label.includes('bd4')) limits.spa4 = value;
    else if (label.includes('sucho') || label.includes('dry')) limits.dry = value;
  }
  return limits;
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

async function fetchOpenDataStation(station) {
  try {
    const response = await fetch(`${OPENDATA_DATA_BASE}${station.objID}.json`);
    if (!response.ok) return null;
    const json = await response.json();
    const series = json.objList?.[0]?.tsList || [];
    const heightSeries = series.find((s) => s.tsConID === 'H')?.tsData || [];
    const flowSeries = series.find((s) => s.tsConID === 'Q')?.tsData || [];
    const tempSeries = series.find((s) => s.tsConID === 'TH')?.tsData || [];
    if (!heightSeries.length && !flowSeries.length && !tempSeries.length) return null;

    const latestHeight = heightSeries[heightSeries.length - 1];
    const latestFlow = flowSeries[flowSeries.length - 1];
    const latestTemp = tempSeries[tempSeries.length - 1];
    const height = latestHeight?.value != null ? Number(latestHeight.value) : null;
    const flow = latestFlow?.value != null ? Number(latestFlow.value) : null;
    const waterTemperature = latestTemp?.value != null ? Number(latestTemp.value) : null;
    const time = latestHeight?.dt || latestFlow?.dt || latestTemp?.dt || null;
    const spa = station.spaLimits || {};

    return enrichMetrics({
      id: station.objID,
      name: station.name,
      river: station.river,
      lat: finite(station.lat),
      lon: finite(station.lon),
      height,
      flow,
      waterTemperature: Number.isFinite(waterTemperature) ? waterTemperature : null,
      time,
      floodLevel: computeFloodLevel(height, spa),
      spa1: spa.spa1,
      spa2: spa.spa2,
      spa3: spa.spa3,
      dry: spa.dry,
      history: mapHeightHistory(heightSeries),
      source: 'opendata',
      attribution: 'ČHMÚ OpenData HPPS',
      country: 'CZ',
    });
  } catch {
    return null;
  }
}

async function scrapeStation(profile, metaByKey) {
  const response = await fetch(`https://hydro.chmi.cz/hpps/hpps_prfbk_detail.php?seq=${profile.seq}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SmirkPocasi/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const root = parse(html);

  let height = null;
  let flow = null;
  let waterTemperature = null;
  let time = null;

  const rows = root.querySelectorAll('tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    if (cells.length < 2) continue;
    const label = (cells[0].text || '').toLowerCase();
    if (label.includes('vodní stav') || label.includes('vodni stav') || label.includes('výška') || label.includes('vyska')) {
      height = numberFrom(cells[1].text);
      if (cells.length > 2) time = (cells[2].text || '').trim() || time;
    }
    if (label.includes('průtok') || label.includes('prutok') || label.includes('flow')) {
      flow = numberFrom(cells[1].text);
    }
    if (label.includes('teplota')) {
      waterTemperature = numberFrom(cells[1].text);
    }
  }

  if (height == null) {
    const pageText = root.text || '';
    const heightMatch = pageText.match(/vodn[ií]\s*stav[^0-9-]*(-?\d+[.,]?\d*)/i);
    if (heightMatch) height = numberFrom(heightMatch[1]);
    const flowMatch = pageText.match(/pr[uů]tok[^0-9-]*(-?\d+[.,]?\d*)/i);
    if (flowMatch) flow = numberFrom(flowMatch[1]);
  }

  if (waterTemperature == null) {
    const pageText = root.text || '';
    const tempMatch = pageText.match(/teplot[ay]\s*vody[^0-9-]*(-?\d+[.,]?\d*)/i);
    if (tempMatch) waterTemperature = numberFrom(tempMatch[1]);
  }

  const key = `${profile.name.toLowerCase().trim()}|${profile.river.toLowerCase().trim()}`;
  const meta = metaByKey.get(key);
  const spa = meta?.spaLimits || parseSpaLimitsHTML(root);

  return enrichMetrics({
    id: String(profile.seq),
    name: profile.name,
    river: profile.river,
    lat: finite(meta?.lat ?? profile.lat),
    lon: finite(meta?.lon ?? profile.lon),
    height,
    flow,
    waterTemperature: Number.isFinite(waterTemperature) ? waterTemperature : null,
    time,
    floodLevel: computeFloodLevel(height, spa),
    spa1: spa.spa1,
    spa2: spa.spa2,
    spa3: spa.spa3,
    dry: spa.dry,
    history: [],
    source: 'hpps-scrape',
    attribution: 'ČHMÚ HPPS',
    country: 'CZ',
  });
}

function selectStations(lat, lon, meta) {
  if (Number.isFinite(lat) && Number.isFinite(lon) && meta.stations.length) {
    return meta.stations
      .map((s) => ({ ...s, distance: distanceKm(lat, lon, s.lat, s.lon) }))
      .filter((s) => Number.isFinite(s.distance) && s.distance <= MAX_STATION_KM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
  }
  return ALL_PROFILES.slice(0, 8).map((p) => {
    const key = `${p.name.toLowerCase().trim()}|${p.river.toLowerCase().trim()}`;
    const metaStation = meta.byKey.get(key);
    return metaStation || { ...p, objID: null, spaLimits: {} };
  });
}

async function ensureInpocasiCache() {
  if (inpocasiCache && Date.now() - inpocasiCacheAt < INPOCASI_TTL) return inpocasiCache;
  const response = await fetch(INPOCASI_HYDRO_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'SmirkPocasi/1.0' },
  });
  if (!response.ok) return [];
  const json = await response.json();
  inpocasiCache = Array.isArray(json.points) ? json.points : [];
  inpocasiCacheAt = Date.now();
  return inpocasiCache;
}

function parseInpocasiPoint(p, lat, lon) {
  const slat = finite(p.lat);
  const slon = finite(p.lng);
  if (slat == null || slon == null) return null;
  const rawName = String(p.name || '');
  const parts = rawName.split(':').map((s) => s.trim());
  const river = parts.length > 1 ? parts[0] : '';
  const name = parts.length > 1 ? parts.slice(1).join(':') : rawName;
  const height = p.h != null ? Number(p.h) : null;
  const flow = p.p != null ? Number(p.p) : null;
  if (height == null && flow == null) return null;
  const dist =
    Number.isFinite(lat) && Number.isFinite(lon) ? distanceKm(lat, lon, slat, slon) : null;
  return enrichMetrics({
    id: `inpocasi-${p.id}`,
    name,
    river,
    lat: slat,
    lon: slon,
    height,
    flow,
    time: null,
    floodLevel: Number.isFinite(Number(p.z)) ? Number(p.z) : 0,
    spa1: null,
    spa2: null,
    spa3: null,
    dry: null,
    history: [],
    waterTemperature: p.t != null ? Number(p.t) : null,
    source: 'in-pocasi',
    attribution: 'In-počasí (stavy řek)',
    country: 'CZ',
    _dist: dist,
  });
}

async function fetchInpocasiHydro(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  try {
    const points = await ensureInpocasiCache();
    return points
      .map((p) => parseInpocasiPoint(p, lat, lon))
      .filter(Boolean)
      .filter((s) => s._dist != null && s._dist <= MAX_STATION_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 12);
  } catch {
    return [];
  }
}

/** CZ In-počasí gauges for the map. */
async function fetchInpocasiMapStations(lat, lon) {
  try {
    const points = await ensureInpocasiCache();
    return points.map((p) => parseInpocasiPoint(p, lat, lon)).filter(Boolean);
  } catch {
    return [];
  }
}

async function getPegelStations() {
  if (pegelCache && Date.now() - pegelCacheAt < PEGEL_TTL) return pegelCache;
  const response = await fetch(PEGEL_STATIONS_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'SmirkPocasi/1.0' },
  });
  if (!response.ok) throw new Error(`PEGELONLINE HTTP ${response.status}`);
  const json = await response.json();
  pegelCache = Array.isArray(json) ? json : [];
  pegelCacheAt = Date.now();
  return pegelCache;
}

function pegelChar(timeseries, shortname) {
  const chars = timeseries?.characteristicValues || [];
  const hit = chars.find((c) => c.shortname === shortname);
  return finite(hit?.value);
}

function pegelFloodLevel(height, wSeries) {
  const mhw = pegelChar(wSeries, 'MHW');
  const state = String(wSeries?.currentMeasurement?.stateMnwMhw || '').toLowerCase();
  const nsw = String(wSeries?.currentMeasurement?.stateNswHsw || '').toLowerCase();
  if (nsw.includes('high') || nsw === 'hsw' || nsw === 'above') return 2;
  if (mhw != null && height != null && height >= mhw) return 2;
  if (state === 'high' || state === 'above') return 1;
  return 0;
}

async function fetchPegelHistory(uuid) {
  try {
    const response = await fetch(`${PEGEL_BASE}/stations/${uuid}/W/measurements.json?start=P1D`, {
      headers: { Accept: 'application/json', 'User-Agent': 'SmirkPocasi/1.0' },
    });
    if (!response.ok) return [];
    const json = await response.json();
    return mapHeightHistory(Array.isArray(json) ? json : []);
  } catch {
    return [];
  }
}

function mapPegelStation(s, lat, lon) {
  const slat = finite(s.latitude);
  const slon = finite(s.longitude);
  if (slat == null || slon == null) return null;
  const wSeries = (s.timeseries || []).find((t) => t.shortname === 'W');
  const height = finite(wSeries?.currentMeasurement?.value);
  if (height == null) return null;
  const dist =
    Number.isFinite(lat) && Number.isFinite(lon) ? distanceKm(lat, lon, slat, slon) : null;
  const mhw = pegelChar(wSeries, 'MHW');
  const mnw = pegelChar(wSeries, 'MNW');
  const hhw = pegelChar(wSeries, 'HHW');
  const flowSeries = (s.timeseries || []).find((t) => t.shortname === 'Q');
  const tempSeries = (s.timeseries || []).find((t) => t.shortname === 'WT');
  return {
    uuid: s.uuid,
    name: s.longname || s.shortname,
    river: s.water?.longname || s.water?.shortname || '',
    lat: slat,
    lon: slon,
    height,
    flow: finite(flowSeries?.currentMeasurement?.value),
    waterTemperature: finite(tempSeries?.currentMeasurement?.value),
    time: wSeries?.currentMeasurement?.timestamp || null,
    floodLevel: pegelFloodLevel(height, wSeries),
    spa1: mhw,
    spa2: hhw,
    spa3: null,
    dry: mnw,
    refHigh: mhw,
    source: 'pegelonline',
    attribution: 'PEGELONLINE (WSV)',
    country: 'DE',
    _dist: dist,
  };
}

async function fetchPegelonlineNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!inBounds(lat, lon, DE_BOUNDS) && distanceKm(lat, lon, 51.0, 10.5) > 280) return [];

  try {
    const all = await getPegelStations();
    const nearby = all
      .map((s) => mapPegelStation(s, lat, lon))
      .filter(Boolean)
      .filter((s) => s._dist != null && s._dist <= MAX_STATION_KM)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 8);

    const withHistory = await Promise.all(
      nearby.map(async (station) => {
        const history = await fetchPegelHistory(station.uuid);
        return enrichMetrics({ ...station, id: `pegel-${station.uuid}`, history });
      }),
    );
    return withHistory;
  } catch (e) {
    console.error('PEGELONLINE error:', e.message);
    return [];
  }
}

const MAP_PEGEL_MAX_KM = 450;

/** PEGELONLINE gauges for the map (no per-station history). */
async function fetchPegelMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!inBounds(lat, lon, DE_BOUNDS) && distanceKm(lat, lon, 51.0, 10.5) > 280) return [];
  try {
    const all = await getPegelStations();
    return all
      .map((s) => {
        const raw = mapPegelStation(s, lat, lon);
        if (!raw) return null;
        if (raw._dist != null && raw._dist > MAP_PEGEL_MAX_KM) return null;
        return enrichMetrics({ ...raw, id: `pegel-${raw.uuid}`, history: [] });
      })
      .filter(Boolean);
  } catch (e) {
    console.error('PEGELONLINE map error:', e.message);
    return [];
  }
}

async function getShmuGeojson() {
  if (shmuGeoCache && Date.now() - shmuGeoCacheAt < SHMU_GEO_TTL) return shmuGeoCache;
  const response = await fetch(`${SHMU_GEOJSON_URL}?ac=${Math.floor(Date.now() / 60000)}`, {
    headers: SHMU_UA,
  });
  if (!response.ok) throw new Error(`SHMÚ GeoJSON HTTP ${response.status}`);
  const json = await response.json();
  const byId = new Map();
  for (const feature of json.features || []) {
    const id = String(feature.id ?? feature.properties?.id ?? '');
    const coords = feature.geometry?.coordinates;
    if (!id || !Array.isArray(coords) || coords.length < 2) continue;
    const lon = finite(coords[0]);
    const lat = finite(coords[1]);
    if (lat == null || lon == null) continue;
    const rawName = String(feature.properties?.name || '');
    const parts = rawName.split(' - ').map((s) => s.trim());
    const name = parts.length > 1 ? parts[0] : rawName;
    const river = parts.length > 1 ? parts.slice(1).join(' - ') : '';
    byId.set(id, {
      id,
      name,
      river,
      lat,
      lon,
      floodLevel: Number(feature.properties?.pa) || 0,
      status: Number(feature.properties?.status) || 0,
    });
  }
  shmuGeoCache = byId;
  shmuGeoCacheAt = Date.now();
  return byId;
}

async function getShmuOverviewLevels() {
  if (shmuLevelsCache && Date.now() - shmuLevelsCacheAt < SHMU_LEVELS_TTL) return shmuLevelsCache;
  const response = await fetch(SHMU_OVERVIEW_URL, { headers: SHMU_UA });
  if (!response.ok) throw new Error(`SHMÚ overview HTTP ${response.status}`);
  const html = await response.text();
  const byId = new Map();
  const rowRe =
    /id="lsid_(\d+)"[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/g;
  let match;
  while ((match = rowRe.exec(html))) {
    const id = match[1];
    const height = numberFrom(match[5]);
    if (height == null) continue;
    byId.set(id, {
      name: match[2].trim(),
      river: match[3].trim(),
      time: match[4].trim() || null,
      height,
    });
  }
  shmuLevelsCache = byId;
  shmuLevelsCacheAt = Date.now();
  return byId;
}

function parseShmuSpaFromHtml(html) {
  const spa = { spa1: null, spa2: null, spa3: null };
  const patterns = [
    [/1\.\s*stupeň\s*PA[^0-9]{0,120}?(\d+)\s*cm/i, 'spa1'],
    [/2\.\s*stupeň\s*PA[^0-9]{0,120}?(\d+)\s*cm/i, 'spa2'],
    [/3\.\s*stupeň\s*PA[^0-9]{0,120}?(\d+)\s*cm/i, 'spa3'],
  ];
  for (const [re, key] of patterns) {
    const m = html.match(re);
    if (m) spa[key] = spaLevel(m[1]);
  }
  return spa;
}

function parseShmuHistoryFromTooltip(html) {
  const serie = html.match(/var\s+base_serie\s*=\s*\{([\s\S]*?)\};/);
  if (!serie) return [];
  const dataMatch = serie[1].match(/data:(\[[\s\S]*\])/);
  if (!dataMatch) return [];
  const pairs = [];
  const pairRe = /\[(\d+),(-?\d+(?:\.\d+)?)\]/g;
  let m;
  while ((m = pairRe.exec(dataMatch[1]))) {
    pairs.push({ timestamp: new Date(Number(m[1])).toISOString(), value: Number(m[2]) });
  }
  return mapHeightHistory(pairs);
}

function parseShmuTempFromDetail(html) {
  const m = html.match(
    /headers="h_vodny_stav"\s*>\s*[^<]*<\/td>\s*<td[^>]*headers="h_teplota_vody"\s*>\s*([^<]+)/,
  );
  return m ? numberFrom(m[1]) : null;
}

async function enrichShmuStation(base) {
  const id = base.shmuId || String(base.id).replace(/^shmu-/, '');
  let spa = { spa1: null, spa2: null, spa3: null };
  let history = [];
  let waterTemperature = null;

  try {
    const [tipRes, detailRes] = await Promise.all([
      fetch(`${SHMU_TOOLTIP_URL}?id=${id}&ac=${Math.floor(Date.now() / 60000)}`, { headers: SHMU_UA }),
      fetch(`${SHMU_DETAIL_URL}${id}`, { headers: SHMU_UA }),
    ]);
    if (tipRes.ok) {
      history = parseShmuHistoryFromTooltip(await tipRes.text());
    }
    if (detailRes.ok) {
      const detailHtml = await detailRes.text();
      spa = parseShmuSpaFromHtml(detailHtml);
      waterTemperature = parseShmuTempFromDetail(detailHtml);
    }
  } catch (e) {
    console.error('SHMÚ enrich error:', e.message);
  }

  const height = finite(base.height);
  return enrichMetrics({
    ...base,
    id: `shmu-${id}`,
    spa1: spa.spa1,
    spa2: spa.spa2,
    spa3: spa.spa3,
    dry: null,
    history,
    waterTemperature,
    floodLevel: base.floodLevel || computeFloodLevel(height, spa),
    source: 'shmu',
    attribution: 'SHMÚ',
    country: 'SK',
  });
}

async function fetchShmuNearby(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (!inBounds(lat, lon, SK_BOUNDS) && distanceKm(lat, lon, 48.7, 19.5) > 220) return [];

  try {
    const [geo, levels] = await Promise.all([getShmuGeojson(), getShmuOverviewLevels()]);
    const nearby = [];
    for (const [id, station] of geo) {
      const dist = distanceKm(lat, lon, station.lat, station.lon);
      if (!Number.isFinite(dist) || dist > MAX_STATION_KM) continue;
      const level = levels.get(id);
      const height = level?.height ?? null;
      if (height == null) continue;
      nearby.push({
        shmuId: id,
        name: level?.name || station.name,
        river: level?.river || station.river,
        lat: station.lat,
        lon: station.lon,
        height,
        flow: null,
        time: level?.time || null,
        floodLevel: station.floodLevel || 0,
        _dist: dist,
      });
    }
    nearby.sort((a, b) => a._dist - b._dist);
    const top = nearby.slice(0, 8);
    return Promise.all(top.map((s) => enrichShmuStation(s)));
  } catch (e) {
    console.error('SHMÚ nearby error:', e.message);
    return [];
  }
}

async function fetchShmuMapStations(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  // Full SK network when the user is in CZ/SK coverage.
  if (
    !inBounds(lat, lon, SK_BOUNDS) &&
    !inBounds(lat, lon, CZ_BOUNDS) &&
    distanceKm(lat, lon, 48.7, 19.5) > 220
  ) {
    return [];
  }

  try {
    const [geo, levels] = await Promise.all([getShmuGeojson(), getShmuOverviewLevels()]);
    const out = [];
    for (const [id, station] of geo) {
      const level = levels.get(id);
      const height = level?.height ?? null;
      const dist = distanceKm(lat, lon, station.lat, station.lon);
      out.push(
        enrichMetrics({
          id: `shmu-${id}`,
          name: level?.name || station.name,
          river: level?.river || station.river,
          lat: station.lat,
          lon: station.lon,
          height,
          flow: null,
          time: level?.time || null,
          floodLevel: station.floodLevel || 0,
          spa1: null,
          spa2: null,
          spa3: null,
          dry: null,
          history: [],
          source: 'shmu',
          attribution: 'SHMÚ',
          country: 'SK',
          _dist: Number.isFinite(dist) ? dist : null,
        }),
      );
    }
    return out;
  } catch (e) {
    console.error('SHMÚ map error:', e.message);
    return [];
  }
}

function stationKey(s) {
  return `${String(s.name || '').toLowerCase()}|${String(s.river || '').toLowerCase()}`;
}

function mergeStations(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const s of list) {
      if (!s) continue;
      const key = stationKey(s);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.sort((a, b) => (a._dist ?? 999) - (b._dist ?? 999));
}

function toMapMarker(s) {
  const lat = finite(s.lat);
  const lon = finite(s.lon);
  if (lat == null || lon == null) return null;
  return {
    id: s.id,
    name: s.name,
    river: s.river || '',
    lat,
    lon,
    height: finite(s.height),
    flow: finite(s.flow),
    floodLevel: Number(s.floodLevel) || 0,
    spaPct: finite(s.spaPct),
    source: s.source || '',
    country: s.country || '',
  };
}

function buildAttribution(stations) {
  const sources = new Set(stations.map((s) => s.source).filter(Boolean));
  const parts = [];
  if (sources.has('opendata') || sources.has('hpps-scrape')) parts.push('ČHMÚ OpenData HPPS');
  if (sources.has('in-pocasi')) parts.push('In-počasí');
  if (sources.has('pegelonline')) parts.push('PEGELONLINE (WSV)');
  if (sources.has('shmu')) parts.push('SHMÚ');
  if (sources.has('hubeau')) parts.push("Hub'Eau");
  if (sources.has('ea')) parts.push('Environment Agency');
  if (sources.has('usgs')) parts.push('USGS');
  if (sources.has('imgw')) parts.push('IMGW-PIB');
  if (sources.has('opw')) parts.push('OPW');
  if (sources.has('wsc')) parts.push('Water Survey of Canada');
  if (sources.has('bafu')) parts.push('BAFU/FOEN');
  return parts.join(' / ') || 'Hydrologie';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, 'http://localhost');
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const wantCz = !Number.isFinite(lat) || !Number.isFinite(lon) || inBounds(lat, lon, CZ_BOUNDS);
    const wantDe = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, DE_BOUNDS) || distanceKm(lat, lon, 51.0, 10.5) <= 280
    );
    const wantSk = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, SK_BOUNDS) ||
      inBounds(lat, lon, CZ_BOUNDS) ||
      distanceKm(lat, lon, 48.7, 19.5) <= 220
    );
    const wantFr = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, FR_BOUNDS) || distanceKm(lat, lon, 46.5, 2.5) <= 320
    );
    const wantUk = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, UK_BOUNDS) || distanceKm(lat, lon, 54.0, -2.5) <= 350
    );
    const wantUs = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, US_BOUNDS) || distanceKm(lat, lon, 39.5, -98.0) <= 800
    );
    const wantPl = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, PL_BOUNDS) ||
      inBounds(lat, lon, CZ_BOUNDS) ||
      distanceKm(lat, lon, 52.0, 19.5) <= 320
    );
    const wantIe = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, IE_BOUNDS) || distanceKm(lat, lon, 53.4, -8.0) <= 280
    );
    const wantCa = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, CA_BOUNDS) || distanceKm(lat, lon, 56.0, -96.0) <= 1200
    );
    const wantCh = Number.isFinite(lat) && Number.isFinite(lon) && (
      inBounds(lat, lon, CH_BOUNDS) || distanceKm(lat, lon, 46.8, 8.2) <= 180
    );

    let valid = [];
    const mapLists = [];

    if (wantCz) {
      const meta = await getMetadata();
      const selected = selectStations(lat, lon, meta);

      const stations = await Promise.all(
        selected.map(async (station) => {
          if (station.objID) {
            const openData = await fetchOpenDataStation(station);
            if (openData) {
              return { ...openData, _dist: station.distance ?? null };
            }
          }

          const local = ALL_PROFILES.find(
            (p) =>
              p.name.toLowerCase() === String(station.name || '').toLowerCase() &&
              p.river.toLowerCase() === String(station.river || '').toLowerCase(),
          );
          if (local) {
            try {
              const scraped = await scrapeStation(local, meta.byKey);
              return { ...scraped, _dist: station.distance ?? null };
            } catch {
              return null;
            }
          }
          return null;
        }),
      );

      valid = stations.filter(Boolean);

      const extras = await fetchInpocasiHydro(lat, lon);
      if (extras.length) {
        valid = mergeStations(valid, extras).slice(0, 12);
      }

      mapLists.push(await fetchInpocasiMapStations(lat, lon));
    }

    if (wantDe) {
      const pegel = await fetchPegelonlineNearby(lat, lon);
      if (pegel.length) {
        valid = mergeStations(valid, pegel).slice(0, 16);
      }
      mapLists.push(await fetchPegelMapStations(lat, lon));
    }

    if (wantSk) {
      const shmu = await fetchShmuNearby(lat, lon);
      if (shmu.length) {
        valid = mergeStations(valid, shmu).slice(0, 20);
      }
      mapLists.push(await fetchShmuMapStations(lat, lon));
    }

    if (wantFr) {
      const fr = await fetchHubeauNearby(lat, lon);
      if (fr.length) valid = mergeStations(valid, fr).slice(0, 24);
      mapLists.push(await fetchHubeauMapStations(lat, lon));
    }

    if (wantUk) {
      const uk = await fetchEaNearby(lat, lon);
      if (uk.length) valid = mergeStations(valid, uk).slice(0, 24);
      mapLists.push(await fetchEaMapStations(lat, lon));
    }

    if (wantUs) {
      const us = await fetchUsgsNearby(lat, lon);
      if (us.length) valid = mergeStations(valid, us).slice(0, 24);
      mapLists.push(await fetchUsgsMapStations(lat, lon));
    }

    if (wantPl) {
      const pl = await fetchImgwNearby(lat, lon);
      if (pl.length) valid = mergeStations(valid, pl).slice(0, 24);
      mapLists.push(await fetchImgwMapStations(lat, lon));
    }

    if (wantIe) {
      const ie = await fetchOpwNearby(lat, lon);
      if (ie.length) valid = mergeStations(valid, ie).slice(0, 24);
      mapLists.push(await fetchOpwMapStations(lat, lon));
    }

    if (wantCa) {
      const ca = await fetchWscNearby(lat, lon);
      if (ca.length) valid = mergeStations(valid, ca).slice(0, 24);
      mapLists.push(await fetchWscMapStations(lat, lon));
    }

    if (wantCh) {
      const ch = await fetchBafuNearby(lat, lon);
      if (ch.length) valid = mergeStations(valid, ch).slice(0, 24);
      mapLists.push(await fetchBafuMapStations(lat, lon));
    }

    if (!valid.length && !mapLists.some((list) => list.length)) {
      return res.status(502).json({ error: 'Hydro data unavailable' });
    }

    // Prefer detailed profiles on the map when they overlap bulk markers.
    const mapStations = mergeStations(valid, ...mapLists)
      .map(toMapMarker)
      .filter(Boolean);

    const attributionSources = [...valid, ...mapStations];

    return res.status(200).json({
      profiles: valid,
      stations: valid,
      mapStations,
      attribution: buildAttribution(attributionSources),
      updated: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Hydro fetch failed' });
  }
}
