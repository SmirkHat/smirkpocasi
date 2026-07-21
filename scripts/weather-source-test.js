#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { normalizeAladin } from '../src/api/normalizers/aladin.ts';
import { normalizeAviation } from '../src/api/normalizers/aviation.ts';
import { normalizeBrightsky } from '../src/api/normalizers/brightsky.ts';
import { normalizeCHMI } from '../src/api/normalizers/chmi.ts';
import { normalizeOpenMeteo } from '../src/api/normalizers/openmeteo.ts';
import { normalizeOpenWeatherMap } from '../src/api/normalizers/openweathermap.ts';
import { normalizePirateWeather } from '../src/api/normalizers/pirateweather.ts';
import { normalizePocasiCz } from '../src/api/normalizers/pocasicz.ts';
import { normalizeVisualCrossing } from '../src/api/normalizers/visualcrossing.ts';
import { normalizeWeatherApi } from '../src/api/normalizers/weatherapi.ts';
import { normalizeWttr } from '../src/api/normalizers/wttr.ts';
import { normalizeYr } from '../src/api/normalizers/yr.ts';
import { calculateDewPoint, numberOrNull } from '../src/utils/weatherMath.ts';

const VERSION = '1.0.0';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_SOURCE_RPS = 2;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_DELAY_MS = 1000;
const USER_AGENT = 'SmirkPocasiWeatherSourceTest/1.0 smirkhat.org';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const METRICS = [
  'temperature',
  'feels_like',
  'humidity',
  'pressure',
  'wind_speed',
  'wind_gusts',
  'wind_direction',
  'precipitation',
  'cloud_cover',
  'visibility',
  'dew_point',
  'weather_condition'
];

const METRIC_LIMITS = {
  temperature: [-90, 60],
  feels_like: [-110, 80],
  humidity: [0, 100],
  pressure: [870, 1085],
  wind_speed: [0, 250],
  wind_gusts: [0, 350],
  wind_direction: [0, 360],
  precipitation: [0, 500],
  cloud_cover: [0, 100],
  visibility: [0, 200],
  dew_point: [-100, 50]
};

const SECRET_ENV_KEYS = [
  'OPENWEATHERMAP_KEY',
  'WEATHERAPI_KEY',
  'PIRATEWEATHER_KEY',
  'VISUALCROSSING_KEY'
];

const OPEN_METEO_CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'surface_pressure',
  'cloud_cover',
  'visibility'
].join(',');

const OPEN_METEO_ENSEMBLE_FIELDS = [
  'temperature_2m',
  'temperature_2m_spread',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'surface_pressure',
  'cloud_cover',
  'visibility',
  'uv_index'
].join(',');

const LOCATIONS = [
  { id: 'praha', name: 'Praha', country: 'CZ', climate: 'continental city', lat: 50.0755, lon: 14.4378 },
  { id: 'brno', name: 'Brno', country: 'CZ', climate: 'urban basin', lat: 49.1951, lon: 16.6068 },
  { id: 'ostrava', name: 'Ostrava', country: 'CZ', climate: 'industrial lowland', lat: 49.8209, lon: 18.2625 },
  { id: 'plzen', name: 'Plzeň', country: 'CZ', climate: 'western bohemian basin', lat: 49.7384, lon: 13.3736 },
  { id: 'liberec', name: 'Liberec', country: 'CZ', climate: 'mountain foothills', lat: 50.7663, lon: 15.0543 },
  { id: 'ceske_budejovice', name: 'České Budějovice', country: 'CZ', climate: 'south bohemian basin', lat: 48.9745, lon: 14.4743 },
  { id: 'hradec_kralove', name: 'Hradec Králové', country: 'CZ', climate: 'elbe lowland', lat: 50.2092, lon: 15.8328 },
  { id: 'olomouc', name: 'Olomouc', country: 'CZ', climate: 'moravian lowland', lat: 49.5938, lon: 17.2509 },
  { id: 'klatovy', name: 'Klatovy', country: 'CZ', climate: 'inland basin', lat: 49.3952, lon: 13.2934 },
  { id: 'susice', name: 'Sušice', country: 'CZ', climate: 'šumava foothills', lat: 49.2311, lon: 13.5202 },
  { id: 'karlovy_vary', name: 'Karlovy Vary', country: 'CZ', climate: 'western bohemian valley', lat: 50.2319, lon: 12.8712 },
  { id: 'usti_nad_labem', name: 'Ústí nad Labem', country: 'CZ', climate: 'elbe valley', lat: 50.6611, lon: 14.0327 },
  { id: 'zlin', name: 'Zlín', country: 'CZ', climate: 'carpathian foothills', lat: 49.2244, lon: 17.6628 },
  { id: 'jihlava', name: 'Jihlava', country: 'CZ', climate: 'highland city', lat: 49.3961, lon: 15.5912 },
  { id: 'mikulov', name: 'Mikulov', country: 'CZ', climate: 'warm dry lowland', lat: 48.8056, lon: 16.6378 },
  { id: 'spindleruv_mlyn', name: 'Špindlerův Mlýn', country: 'CZ', climate: 'mountain resort', lat: 50.7262, lon: 15.6094 },
  { id: 'jesenik', name: 'Jeseník', country: 'CZ', climate: 'mountain valley', lat: 50.2294, lon: 17.2046 },
  { id: 'cheb', name: 'Cheb', country: 'CZ', climate: 'western border basin', lat: 50.0796, lon: 12.3739 },
  { id: 'tabor', name: 'Tábor', country: 'CZ', climate: 'south bohemian upland', lat: 49.4144, lon: 14.6578 },
  { id: 'znojmo', name: 'Znojmo', country: 'CZ', climate: 'warm dry river valley', lat: 48.8555, lon: 16.0488 },
  { id: 'reykjavik', name: 'Reykjavík', country: 'IS', climate: 'subpolar oceanic', lat: 64.1466, lon: -21.9426 },
  { id: 'singapore', name: 'Singapur', country: 'SG', climate: 'tropical maritime', lat: 1.3521, lon: 103.8198 },
  { id: 'anchorage', name: 'Anchorage', country: 'US', climate: 'subarctic coastal', lat: 61.2176, lon: -149.8997 },
  { id: 'cairo', name: 'Cairo', country: 'EG', climate: 'hot desert', lat: 30.0444, lon: 31.2357 },
  { id: 'cape_town', name: 'Cape Town', country: 'ZA', climate: 'mediterranean coastal', lat: -33.9249, lon: 18.4241 },
  { id: 'longyearbyen', name: 'Longyearbyen', country: 'SJ', climate: 'arctic', lat: 78.2232, lon: 15.6267 },
  { id: 'nuuk', name: 'Nuuk', country: 'GL', climate: 'polar maritime', lat: 64.1835, lon: -51.7216 },
  { id: 'ushuaia', name: 'Ushuaia', country: 'AR', climate: 'subpolar oceanic', lat: -54.8019, lon: -68.303 },
  { id: 'mcmurdo', name: 'McMurdo Station', country: 'AQ', climate: 'antarctic polar', lat: -77.8419, lon: 166.6863 },
  { id: 'la_paz', name: 'La Paz', country: 'BO', climate: 'high mountain city', lat: -16.4897, lon: -68.1193 },
  { id: 'manaus', name: 'Manaus', country: 'BR', climate: 'tropical rainforest', lat: -3.119, lon: -60.0217 },
  { id: 'san_pedro_atacama', name: 'San Pedro de Atacama', country: 'CL', climate: 'high desert', lat: -22.9087, lon: -68.1997 },
  { id: 'miami', name: 'Miami', country: 'US', climate: 'tropical coastal', lat: 25.7617, lon: -80.1918 },
  { id: 'vancouver', name: 'Vancouver', country: 'CA', climate: 'marine west coast', lat: 49.2827, lon: -123.1207 },
  { id: 'san_francisco', name: 'San Francisco', country: 'US', climate: 'cool coastal', lat: 37.7749, lon: -122.4194 },
  { id: 'denver', name: 'Denver', country: 'US', climate: 'semi-arid high plains', lat: 39.7392, lon: -104.9903 },
  { id: 'honolulu', name: 'Honolulu', country: 'US', climate: 'tropical island', lat: 21.3099, lon: -157.8581 },
  { id: 'tokyo', name: 'Tokyo', country: 'JP', climate: 'humid subtropical coastal', lat: 35.6762, lon: 139.6503 },
  { id: 'seoul', name: 'Seoul', country: 'KR', climate: 'continental monsoon', lat: 37.5665, lon: 126.978 },
  { id: 'ulaanbaatar', name: 'Ulaanbaatar', country: 'MN', climate: 'cold semi-arid', lat: 47.8864, lon: 106.9057 },
  { id: 'delhi', name: 'Delhi', country: 'IN', climate: 'hot semi-arid monsoon', lat: 28.6139, lon: 77.209 },
  { id: 'kathmandu', name: 'Kathmandu', country: 'NP', climate: 'mountain valley', lat: 27.7172, lon: 85.324 },
  { id: 'dubai', name: 'Dubai', country: 'AE', climate: 'hot desert coastal', lat: 25.2048, lon: 55.2708 },
  { id: 'nairobi', name: 'Nairobi', country: 'KE', climate: 'tropical highland', lat: -1.2921, lon: 36.8219 },
  { id: 'lagos', name: 'Lagos', country: 'NG', climate: 'tropical coastal', lat: 6.5244, lon: 3.3792 },
  { id: 'london', name: 'London', country: 'GB', climate: 'marine west coast', lat: 51.5072, lon: -0.1276 },
  { id: 'zurich', name: 'Zurich', country: 'CH', climate: 'alpine foreland', lat: 47.3769, lon: 8.5417 },
  { id: 'chamonix', name: 'Chamonix', country: 'FR', climate: 'alpine valley', lat: 45.9237, lon: 6.8694 },
  { id: 'sydney', name: 'Sydney', country: 'AU', climate: 'humid subtropical coastal', lat: -33.8688, lon: 151.2093 },
  { id: 'auckland', name: 'Auckland', country: 'NZ', climate: 'oceanic island', lat: -36.8509, lon: 174.7645 }
];

const CZECH_AIRPORTS = [
  { id: 'LKPR', name: 'Praha Ruzyně', lat: 50.1008, lon: 14.26 },
  { id: 'LKTB', name: 'Brno Tuřany', lat: 49.1514, lon: 16.6939 },
  { id: 'LKMT', name: 'Ostrava Mošnov', lat: 49.6961, lon: 18.1111 },
  { id: 'LKKU', name: 'Kunovice', lat: 49.0294, lon: 17.4397 },
  { id: 'LKKV', name: 'Karlovy Vary', lat: 50.2031, lon: 12.915 },
  { id: 'LKPD', name: 'Pardubice', lat: 50.015, lon: 15.7397 }
];

const CHMI_METADATA_BASE = 'https://opendata.chmi.cz/meteorology/climate/now/metadata/';
const CHMI_DATA_BASE = 'https://opendata.chmi.cz/meteorology/climate/now/data/';
let chmiMetadataCache = null;

class RequestError extends Error {
  constructor(message, { status = null, body = null, url = null } = {}) {
    super(message);
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    sourceRps: DEFAULT_SOURCE_RPS,
    batchSize: DEFAULT_BATCH_SIZE,
    batchDelayMs: DEFAULT_BATCH_DELAY_MS,
    outputBase: PROJECT_ROOT,
    sourceIds: null,
    forceRegional: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force-regional') options.forceRegional = true;
    else if (arg === '--timeout-ms' && next) options.timeoutMs = Number(next);
    else if (arg === '--source-rps' && next) options.sourceRps = Number(next);
    else if (arg === '--batch-size' && next) options.batchSize = Number(next);
    else if (arg === '--batch-delay-ms' && next) options.batchDelayMs = Number(next);
    else if (arg === '--output-base' && next) options.outputBase = path.resolve(next);
    else if (arg === '--sources' && next) options.sourceIds = next.split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      continue;
    }

    if (next && arg !== '--dry-run' && arg !== '--force-regional') index += 1;
  }

  return options;
}

function printHelp() {
  console.log(`Weather source data-quality test

Usage:
  npm run test:weather-sources -- [options]
  node scripts/weather-source-test.js [options]

Options:
  --dry-run              Run only 3 locations and 3 global Open-Meteo sources.
  --sources a,b,c        Limit source ids.
  --timeout-ms 10000     Timeout per source request.
  --source-rps 2         Max starts per second per source and per service group.
  --batch-size 5         Number of locations scheduled per batch.
  --batch-delay-ms 1000  Delay between location batches.
  --force-regional       Call regional CZ sources even outside their coverage.
  --output-base ./path   Parent directory for weather_test_YYYYMMDD_HHMMSS.
`);
}

async function loadEnvFiles() {
  const files = ['.env.local', '.env'];
  for (const file of files) {
    const fullPath = path.join(PROJECT_ROOT, file);
    let content;
    try {
      content = await fs.readFile(fullPath, 'utf8');
    } catch {
      continue;
    }

    content.split(/\r?\n/u).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const equalsAt = trimmed.indexOf('=');
      if (equalsAt === -1) return;
      const key = trimmed.slice(0, equalsAt).trim();
      let value = trimmed.slice(equalsAt + 1).trim();
      if (!key || process.env[key] !== undefined) return;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function timestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[-:]/gu, '').replace('T', '_');
}

function safeNumber(value) {
  const number = numberOrNull(value);
  return number === null ? null : number;
}

function normalizeDirection(value) {
  const number = safeNumber(value);
  if (number === null) return null;
  return ((number % 360) + 360) % 360;
}

function metersToKm(value) {
  const number = safeNumber(value);
  return number === null ? null : number / 1000;
}

function standardMetrics(value) {
  const weatherCondition = safeNumber(value?.weatherCode) ?? value?.symbolCode ?? value?.iconName ?? null;

  return {
    temperature: safeNumber(value?.temperature),
    feels_like: safeNumber(value?.apparentTemperature),
    humidity: safeNumber(value?.humidity),
    pressure: safeNumber(value?.pressure),
    wind_speed: safeNumber(value?.windSpeed),
    wind_gusts: safeNumber(value?.windGust),
    wind_direction: normalizeDirection(value?.windDirection),
    precipitation: safeNumber(value?.precipitation),
    cloud_cover: safeNumber(value?.cloudCover),
    visibility: metersToKm(value?.visibility),
    dew_point: safeNumber(value?.dewPoint),
    weather_condition: weatherCondition
  };
}

function comparableMetrics(metrics) {
  const comparable = { ...metrics };
  const qualityFlags = [];

  Object.entries(METRIC_LIMITS).forEach(([metric, [min, max]]) => {
    const value = metrics[metric];
    if (value === null || value === undefined) return;
    if (!Number.isFinite(value) || value < min || value > max) {
      comparable[metric] = null;
      qualityFlags.push(`${metric}:out_of_range:${value}`);
    }
  });

  return { comparable, qualityFlags };
}

function coordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : String(value);
}

function dayStamp(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().split('T')[0].replace(/-/gu, '');
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function czechCoverage(location) {
  const inside = location.lat >= 48.3 && location.lat <= 51.2 && location.lon >= 11.8 && location.lon <= 19.1;
  return {
    ok: inside,
    reason: inside ? null : 'Regional Czech source; location is outside Czech coverage.'
  };
}

function bboxCoverage(label, bbox) {
  return (location) => {
    const inside = (
      location.lat >= bbox.latMin &&
      location.lat <= bbox.latMax &&
      location.lon >= bbox.lonMin &&
      location.lon <= bbox.lonMax
    );

    return {
      ok: inside,
      reason: inside ? null : `${label} source; location is outside coverage.`
    };
  };
}

function createLimiter(requestsPerSecond) {
  const spacingMs = Math.ceil(1000 / Math.max(0.1, requestsPerSecond));
  let chain = Promise.resolve();
  let lastStart = 0;

  return (task) => {
    const run = chain.then(async () => {
      const waitMs = Math.max(0, lastStart + spacingMs - Date.now());
      if (waitMs > 0) await sleep(waitMs);
      lastStart = Date.now();
      return task();
    });
    chain = run.catch(() => {});
    return run;
  };
}

function requestTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

async function fetchJson(url, { headers = {}, timeoutMs }) {
  const { controller, timeoutId } = requestTimeout(timeoutMs);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new RequestError('Response was not valid JSON.', {
          status: response.status,
          body: text.slice(0, 1000),
          url
        });
      }
    }

    if (!response.ok) {
      throw new RequestError(`HTTP ${response.status} ${response.statusText}`.trim(), {
        status: response.status,
        body: data ?? text.slice(0, 1000),
        url
      });
    }

    return { data, status: response.status, url };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new RequestError(`Timeout after ${timeoutMs} ms.`, { url });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function envKey(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function redactSecrets(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return text;

  SECRET_ENV_KEYS.forEach((key) => {
    const secret = envKey(key);
    if (secret) text = text.split(secret).join(`[REDACTED:${key}]`);
  });

  return text
    .replace(/([?&](?:key|appid)=)[^&\s"]+/giu, '$1[REDACTED]')
    .replace(/(api\.pirateweather\.net\/forecast\/)[^/]+/giu, '$1[REDACTED]');
}

function openMeteoUrl(location, source) {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    current: OPEN_METEO_CURRENT_FIELDS,
    hourly: OPEN_METEO_CURRENT_FIELDS,
    timezone: 'UTC',
    forecast_hours: '1'
  });

  if (source.model) params.set('models', source.model);
  return `https://api.open-meteo.com${source.endpoint}?${params}`;
}

function openMeteoEnsembleUrl(location, source) {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    models: source.model,
    hourly: OPEN_METEO_ENSEMBLE_FIELDS,
    timezone: 'UTC',
    forecast_hours: '1'
  });

  return `https://ensemble-api.open-meteo.com/v1/ensemble?${params}`;
}

async function fetchOpenMeteoSource(location, source, options) {
  const url = source.ensemble ? openMeteoEnsembleUrl(location, source) : openMeteoUrl(location, source);
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  return { url, httpStatus: status, raw: data, normalized: normalizeOpenMeteo(data) };
}

async function fetchYrSource(location, source, options) {
  const params = new URLSearchParams({ lat: coordinate(location.lat), lon: coordinate(location.lon) });
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs, headers: { 'User-Agent': USER_AGENT } });
  return { url, httpStatus: status, raw: data, normalized: normalizeYr(data) };
}

async function fetchBrightskySource(location, source, options) {
  const params = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon) });
  const url = `https://api.brightsky.dev/current_weather?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  return { url, httpStatus: status, raw: data, normalized: normalizeBrightsky(data) };
}

async function fetchWttrSource(location, source, options) {
  const url = `https://wttr.in/${location.lat},${location.lon}?format=j1`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs, headers: { 'User-Agent': USER_AGENT } });
  return { url, httpStatus: status, raw: data, normalized: normalizeWttr(data) };
}

async function fetchPocasiCzSource(location, source, options) {
  const params = new URLSearchParams({
    lat: coordinate(location.lat),
    lon: coordinate(location.lon),
    include: 'current,place,entries,daily'
  });
  const url = `https://wapi.pocasi.seznam.cz/v2/forecast?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs, headers: { 'User-Agent': USER_AGENT } });
  return { url, httpStatus: status, raw: data, normalized: normalizePocasiCz(data) };
}

async function fetchAladinSource(location, source, options) {
  const params = new URLSearchParams({ latitude: String(location.lat), longitude: String(location.lon) });
  const url = `https://aladinonline.oblacno.cz/get_data.php?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  return { url, httpStatus: status, raw: data, normalized: normalizeAladin(data) };
}

async function fetchOpenWeatherMapSource(location, source, options) {
  const key = envKey('OPENWEATHERMAP_KEY');
  if (!key) throw new RequestError('OPENWEATHERMAP_KEY is not configured.');

  const params = new URLSearchParams({
    appid: key,
    lat: String(location.lat),
    lon: String(location.lon),
    units: 'metric',
    lang: 'cz'
  });
  const url = `https://api.openweathermap.org/data/2.5/weather?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  return { url, httpStatus: status, raw: data, normalized: normalizeOpenWeatherMap(data) };
}

async function fetchWeatherApiSource(location, source, options) {
  const key = envKey('WEATHERAPI_KEY');
  if (!key) throw new RequestError('WEATHERAPI_KEY is not configured.');

  const params = new URLSearchParams({ key, q: `${location.lat},${location.lon}`, aqi: 'no', lang: 'cs' });
  const url = `https://api.weatherapi.com/v1/current.json?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  return { url, httpStatus: status, raw: data, normalized: normalizeWeatherApi(data) };
}

async function fetchPirateWeatherSource(location, source, options) {
  const key = envKey('PIRATEWEATHER_KEY');
  if (!key) throw new RequestError('PIRATEWEATHER_KEY is not configured.');

  const params = new URLSearchParams({ units: 'si', exclude: 'minutely,hourly,daily,alerts' });
  const url = `https://api.pirateweather.net/forecast/${key}/${location.lat},${location.lon}?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  return { url, httpStatus: status, raw: data, normalized: normalizePirateWeather(data) };
}

async function fetchVisualCrossingSource(location, source, options) {
  const key = envKey('VISUALCROSSING_KEY');
  if (!key) throw new RequestError('VISUALCROSSING_KEY is not configured.');

  const params = new URLSearchParams({ key, unitGroup: 'metric', include: 'current', lang: 'cs' });
  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${location.lat},${location.lon}/today?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  return { url, httpStatus: status, raw: data, normalized: normalizeVisualCrossing(data) };
}

function openSenseSensorValue(box, title) {
  const sensor = box.sensors?.find((item) => item.title?.toLowerCase().includes(title));
  const value = Number(sensor?.lastMeasurement?.value);
  return Number.isFinite(value) ? value : null;
}

function openSenseLatestTimestamp(box) {
  const timestamps = (box.sensors || [])
    .map((sensor) => sensor.lastMeasurement?.createdAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

async function fetchOpenSenseMapSource(location, source, options) {
  const params = new URLSearchParams({
    near: `${location.lon},${location.lat}`,
    maxDistance: '50000',
    full: 'true'
  });
  const url = `https://api.opensensemap.org/boxes?${params}`;
  const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
  const recentBoxes = (Array.isArray(data) ? data : [])
    .filter((box) => openSenseSensorValue(box, 'temperatur') !== null)
    .filter((box) => Date.now() - openSenseLatestTimestamp(box) < 6 * 60 * 60 * 1000)
    .slice(0, 8);

  if (!recentBoxes.length) throw new RequestError('No recent openSenseMap temperature stations nearby.', { status, url });

  const temperature = average(recentBoxes.map((box) => openSenseSensorValue(box, 'temperatur')));
  const humidity = average(recentBoxes.map((box) => openSenseSensorValue(box, 'luftfeuchte')));
  const normalized = {
    temperature,
    apparentTemperature: null,
    precipitation: null,
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: average(recentBoxes.map((box) => openSenseSensorValue(box, 'wind'))),
    windDirection: null,
    windGust: null,
    humidity,
    pressure: average(recentBoxes.map((box) => openSenseSensorValue(box, 'luftdruck')).map((value) => value && value > 2000 ? value / 100 : value)),
    cloudCover: null,
    visibility: null,
    weatherCode: null,
    raw: recentBoxes
  };

  return { url, httpStatus: status, raw: recentBoxes, normalized };
}

async function fetchChmiMetadata(options) {
  if (chmiMetadataCache) return chmiMetadataCache;

  for (const day of [dayStamp(), dayStamp(1)]) {
    const url = `${CHMI_METADATA_BASE}meta1-${day}.json`;
    try {
      const { data } = await fetchJson(url, { timeoutMs: options.timeoutMs });
      const values = data?.data?.data?.values || [];
      if (values.length) {
        chmiMetadataCache = values.map((value) => ({
          wsi: value[0],
          id: value[1],
          name: value[2],
          lon: value[3],
          lat: value[4],
          elevation: value[5]
        }));
        return chmiMetadataCache;
      }
    } catch {
      continue;
    }
  }

  throw new RequestError('CHMI station metadata is unavailable.');
}

async function fetchChmiStationValues(station, day, options) {
  const url = `${CHMI_DATA_BASE}10m-${station.wsi}-${day}.json`;
  try {
    const { data, status } = await fetchJson(url, { timeoutMs: options.timeoutMs });
    const values = data?.data?.data?.values || [];
    return values.length ? { values, status, url } : null;
  } catch {
    return null;
  }
}

function chmiMeasurementsFromValues(values) {
  const measurements = {};
  values.forEach((value) => {
    const [, element, dt, val] = value;
    if (!measurements[dt]) measurements[dt] = { dt };
    measurements[dt][element] = val;
  });
  return measurements;
}

async function fetchChmiSource(location, source, options) {
  const stations = await fetchChmiMetadata(options);
  const nearestStations = stations
    .map((station) => ({ ...station, dist: distanceKm(location.lat, location.lon, station.lat, station.lon) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 12);

  for (const day of [dayStamp(), dayStamp(1)]) {
    for (const station of nearestStations) {
      const stationData = await fetchChmiStationValues(station, day, options);
      if (!stationData) continue;

      const measurements = chmiMeasurementsFromValues(stationData.values);
      const sortedTimes = Object.keys(measurements).sort().reverse();
      const latest = measurements[sortedTimes[0]];
      if (!latest) continue;

      const raw = {
        station: {
          id: station.id,
          wsi: station.wsi,
          name: station.name,
          distance: station.dist,
          elevation: station.elevation
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
        attribution: 'Data: ČHMÚ (OpenData)'
      };
      return { url: stationData.url, httpStatus: stationData.status, raw, normalized: normalizeCHMI(raw) };
    }
  }

  throw new RequestError('No usable CHMI station data found near location.');
}

async function fetchAviationSource(location, source, options) {
  const nearest = CZECH_AIRPORTS
    .map((airport) => ({ ...airport, dist: distanceKm(location.lat, location.lon, airport.lat, airport.lon) }))
    .sort((a, b) => a.dist - b.dist)[0];
  const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${nearest.id}&format=json`;
  const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${nearest.id}&format=json`;
  const [metar, taf] = await Promise.all([
    fetchJson(metarUrl, { timeoutMs: options.timeoutMs }),
    fetchJson(tafUrl, { timeoutMs: options.timeoutMs })
  ]);
  const raw = {
    airport: nearest,
    metar: Array.isArray(metar.data) ? metar.data[0] || null : null,
    taf: Array.isArray(taf.data) ? taf.data[0] || null : null,
    attribution: 'Data: NOAA Aviation Weather'
  };

  return { url: metarUrl, httpStatus: metar.status, raw, normalized: normalizeAviation(raw) };
}

function openMeteoSource(id, name, endpoint, model = null, weight = 1, coverage = null) {
  return {
    id,
    name,
    type: 'Open-Meteo model',
    serviceGroup: 'openmeteo',
    endpointFormat: `GET https://api.open-meteo.com${endpoint}?latitude={lat}&longitude={lon}&current=${OPEN_METEO_CURRENT_FIELDS}&hourly=${OPEN_METEO_CURRENT_FIELDS}&timezone=UTC&forecast_hours=1${model ? `&models=${model}` : ''}`,
    model,
    endpoint,
    weight,
    coverage,
    fetch: fetchOpenMeteoSource
  };
}

function openMeteoEnsembleSource(id, name, model, weight = 1, coverage = null) {
  return {
    id,
    name,
    type: 'Open-Meteo ensemble mean',
    serviceGroup: 'openmeteo',
    endpointFormat: `GET https://ensemble-api.open-meteo.com/v1/ensemble?latitude={lat}&longitude={lon}&models=${model}&hourly=${OPEN_METEO_ENSEMBLE_FIELDS}&timezone=UTC&forecast_hours=1`,
    model,
    ensemble: true,
    weight,
    coverage,
    fetch: fetchOpenMeteoSource
  };
}

const EUROPE_MODEL_COVERAGE = bboxCoverage('European limited-area model', { latMin: 34, latMax: 72, lonMin: -12, lonMax: 45 });
const ARPEGE_COVERAGE = bboxCoverage('ARPEGE Europe model', { latMin: 20, latMax: 75, lonMin: -20, lonMax: 50 });
const BRIGHTSKY_COVERAGE = bboxCoverage('DWD Brightsky station', { latMin: 47, latMax: 55.5, lonMin: 5.5, lonMax: 15.5 });

const SOURCES = [
  openMeteoSource('openmeteo_forecast', 'Open-Meteo Forecast', '/v1/forecast', null, 3),
  openMeteoSource('ecmwf_ifs', 'ECMWF IFS', '/v1/ecmwf', null, 5),
  openMeteoSource('icon_eu', 'DWD ICON-EU', '/v1/dwd-icon', null, 5),
  openMeteoSource('ecmwf_aifs', 'ECMWF AIFS', '/v1/ecmwf', 'ecmwf_aifs025', 4),
  openMeteoSource('icon_d2', 'DWD ICON-D2', '/v1/dwd-icon', 'icon_d2', 5, EUROPE_MODEL_COVERAGE),
  openMeteoEnsembleSource('icon_eu_eps_mean', 'DWD ICON-EU EPS Mean', 'dwd_icon_eu_eps_ensemble_mean', 4, EUROPE_MODEL_COVERAGE),
  openMeteoSource('arome', 'Météo-France AROME', '/v1/meteofrance', null, 4),
  openMeteoSource('arpege', 'Météo-France ARPEGE', '/v1/meteofrance', 'arpege_europe', 3, ARPEGE_COVERAGE),
  openMeteoSource('gfs', 'NOAA GFS', '/v1/gfs', null, 3),
  openMeteoSource('graphcast', 'AI GFS GraphCast', '/v1/gfs', 'gfs_graphcast025', 1),
  openMeteoEnsembleSource('gefs025_mean', 'NOAA GEFS 0.25° Mean', 'ncep_gefs025_ensemble_mean', 2),
  openMeteoSource('gem', 'GEM Global', '/v1/gem', null, 2),
  openMeteoEnsembleSource('gem_geps_mean', 'GEM GEPS Mean', 'cmc_gem_geps_ensemble_mean', 2),
  openMeteoEnsembleSource('ecmwf_ifs_eps_mean', 'ECMWF IFS EPS Mean', 'ecmwf_ifs025_ensemble_mean', 3),
  openMeteoSource('jma', 'JMA GSM/MSM', '/v1/jma', null, 2),
  openMeteoSource('cma', 'CMA GRAPES', '/v1/cma', null, 2),
  {
    id: 'yr',
    name: 'Yr.no Locationforecast',
    type: 'Model/API',
    serviceGroup: 'metno',
    endpointFormat: 'GET https://api.met.no/weatherapi/locationforecast/2.0/complete?lat={lat}&lon={lon}',
    weight: 3,
    fetch: fetchYrSource
  },
  {
    id: 'brightsky',
    name: 'DWD Brightsky',
    type: 'Observation/API',
    serviceGroup: 'brightsky',
    endpointFormat: 'GET https://api.brightsky.dev/current_weather?lat={lat}&lon={lon}',
    weight: 0,
    coverage: BRIGHTSKY_COVERAGE,
    fetch: fetchBrightskySource
  },
  {
    id: 'wttr',
    name: 'wttr.in',
    type: 'Aggregator/API',
    serviceGroup: 'wttr',
    endpointFormat: 'GET https://wttr.in/{lat},{lon}?format=j1',
    weight: 1,
    fetch: fetchWttrSource
  },
  {
    id: 'pocasicz',
    name: 'Počasí.cz / Seznam',
    type: 'Experimental/API',
    serviceGroup: 'pocasicz',
    endpointFormat: 'GET https://wapi.pocasi.seznam.cz/v2/forecast?lat={lat}&lon={lon}&include=current,place,entries,daily',
    weight: 1,
    fetch: fetchPocasiCzSource
  },
  {
    id: 'opensensemap',
    name: 'openSenseMap',
    type: 'Citizen observations',
    serviceGroup: 'opensensemap',
    endpointFormat: 'GET https://api.opensensemap.org/boxes?near={lon},{lat}&maxDistance=50000&full=true',
    weight: 1,
    fetch: fetchOpenSenseMapSource
  },
  {
    id: 'openweathermap',
    name: 'OpenWeatherMap',
    type: 'Keyed API',
    serviceGroup: 'openweathermap',
    endpointFormat: 'GET https://api.openweathermap.org/data/2.5/weather?appid=$OPENWEATHERMAP_KEY&lat={lat}&lon={lon}&units=metric&lang=cz',
    requiredEnv: 'OPENWEATHERMAP_KEY',
    weight: 1,
    fetch: fetchOpenWeatherMapSource
  },
  {
    id: 'weatherapi',
    name: 'WeatherAPI.com',
    type: 'Keyed API',
    serviceGroup: 'weatherapi',
    endpointFormat: 'GET https://api.weatherapi.com/v1/current.json?key=$WEATHERAPI_KEY&q={lat},{lon}&aqi=no&lang=cs',
    requiredEnv: 'WEATHERAPI_KEY',
    weight: 2,
    fetch: fetchWeatherApiSource
  },
  {
    id: 'pirateweather',
    name: 'Pirate Weather',
    type: 'Keyed API',
    serviceGroup: 'pirateweather',
    endpointFormat: 'GET https://api.pirateweather.net/forecast/$PIRATEWEATHER_KEY/{lat},{lon}?units=si&exclude=minutely,hourly,daily,alerts',
    requiredEnv: 'PIRATEWEATHER_KEY',
    weight: 2,
    fetch: fetchPirateWeatherSource
  },
  {
    id: 'visualcrossing',
    name: 'Visual Crossing',
    type: 'Keyed API',
    serviceGroup: 'visualcrossing',
    endpointFormat: 'GET https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{lat},{lon}/today?key=$VISUALCROSSING_KEY&unitGroup=metric&include=current&lang=cs',
    requiredEnv: 'VISUALCROSSING_KEY',
    weight: 1,
    fetch: fetchVisualCrossingSource
  },
  {
    id: 'chmi',
    name: 'ČHMÚ Stanice',
    type: 'Regional observations',
    serviceGroup: 'chmi',
    endpointFormat: 'GET https://opendata.chmi.cz/meteorology/climate/now/metadata/meta1-{YYYYMMDD}.json + GET https://opendata.chmi.cz/meteorology/climate/now/data/10m-{stationWsi}-{YYYYMMDD}.json',
    coverage: czechCoverage,
    weight: 0,
    fetch: fetchChmiSource
  },
  {
    id: 'aviation',
    name: 'Letecké METAR',
    type: 'Regional observations',
    serviceGroup: 'aviationweather',
    endpointFormat: 'GET https://aviationweather.gov/api/data/metar?ids={nearestCzechAirport}&format=json',
    coverage: czechCoverage,
    weight: 0,
    fetch: fetchAviationSource
  },
  {
    id: 'aladin',
    name: 'Aladin (ČHMÚ)',
    type: 'Regional model',
    serviceGroup: 'aladin',
    endpointFormat: 'GET https://aladinonline.oblacno.cz/get_data.php?latitude={lat}&longitude={lon}',
    coverage: czechCoverage,
    weight: 5,
    fetch: fetchAladinSource
  }
];

function selectedSources(options) {
  let sources = SOURCES;
  if (options.sourceIds?.length) {
    const allowed = new Set(options.sourceIds);
    sources = sources.filter((source) => allowed.has(source.id));
  }
  return options.dryRun ? sources.slice(0, 3) : sources;
}

function selectedLocations(options) {
  return options.dryRun ? LOCATIONS.slice(0, 3) : LOCATIONS;
}

function sourceConfig(source) {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    weight: source.weight,
    serviceGroup: source.serviceGroup,
    endpointFormat: source.endpointFormat,
    requiredEnv: source.requiredEnv || null,
    configured: source.requiredEnv ? Boolean(envKey(source.requiredEnv)) : true,
    coverage: source.coverage ? 'regional' : 'global_or_provider_defined'
  };
}

async function requestSource(location, source, options, limiter) {
  if (!options.forceRegional && source.coverage) {
    const coverage = source.coverage(location);
    if (!coverage.ok) {
      return {
        locationId: location.id,
        sourceId: source.id,
        status: 'not_applicable',
        latency_ms: null,
        http_status: null,
        url: null,
        normalized: null,
        metrics: emptyMetrics(),
        comparison_metrics: emptyMetrics(),
        quality_flags: [],
        raw: null,
        error: coverage.reason
      };
    }
  }

  if (source.requiredEnv && !envKey(source.requiredEnv)) {
    return {
      locationId: location.id,
      sourceId: source.id,
      status: 'not_configured',
      latency_ms: null,
      http_status: null,
      url: null,
      normalized: null,
      metrics: emptyMetrics(),
      comparison_metrics: emptyMetrics(),
      quality_flags: [],
      raw: null,
      error: `${source.requiredEnv} is not configured.`
    };
  }

  return limiter(async () => {
    const started = performance.now();

    try {
      const result = await source.fetch(location, source, options);
      const latencyMs = Math.round(performance.now() - started);
      const metrics = standardMetrics(result.normalized);
      const { comparable, qualityFlags } = comparableMetrics(metrics);
      const hasAnyMetric = METRICS.some((metric) => metrics[metric] !== null && metrics[metric] !== undefined);

      return {
        locationId: location.id,
        sourceId: source.id,
        status: hasAnyMetric ? 'ok' : 'no_data',
        latency_ms: latencyMs,
        http_status: result.httpStatus ?? null,
        url: redactSecrets(result.url),
        normalized: result.normalized,
        metrics,
        comparison_metrics: comparable,
        quality_flags: qualityFlags,
        raw: result.raw,
        error: hasAnyMetric ? null : 'Source returned no comparable weather metrics.'
      };
    } catch (error) {
      return {
        locationId: location.id,
        sourceId: source.id,
        status: error.message?.includes('not configured') ? 'not_configured' : 'error',
        latency_ms: Math.round(performance.now() - started),
        http_status: error.status ?? null,
        url: error.url ? redactSecrets(error.url) : null,
        normalized: null,
        metrics: emptyMetrics(),
        comparison_metrics: emptyMetrics(),
        quality_flags: [],
        raw: error.body ? safeJsonBody(error.body) : null,
        error: redactSecrets(error.message || 'Request failed.')
      };
    }
  });
}

function safeJsonBody(body) {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return redactSecrets(body);
  return JSON.parse(redactSecrets(body));
}

function emptyMetrics() {
  return Object.fromEntries(METRICS.map((metric) => [metric, null]));
}

function createLimiters(sources, options) {
  const sourceLimiters = new Map();
  const serviceLimiters = new Map();

  sources.forEach((source) => {
    sourceLimiters.set(source.id, createLimiter(options.sourceRps));
    if (!serviceLimiters.has(source.serviceGroup)) {
      serviceLimiters.set(source.serviceGroup, createLimiter(options.sourceRps));
    }
  });

  return (source, task) => sourceLimiters.get(source.id)(() => serviceLimiters.get(source.serviceGroup)(task));
}

async function collectLocation(location, sources, options, limiters) {
  const entries = await Promise.all(sources.map((source) => requestSource(
    location,
    source,
    options,
    (task) => limiters(source, task)
  )));

  return {
    location,
    sources: Object.fromEntries(entries.map((entry) => [entry.sourceId, entry]))
  };
}

async function collectAll(locations, sources, options) {
  const limiters = createLimiters(sources, options);
  const results = [];

  for (let start = 0; start < locations.length; start += options.batchSize) {
    const batch = locations.slice(start, start + options.batchSize);
    console.log(`Batch ${Math.floor(start / options.batchSize) + 1}: ${batch.map((location) => location.name).join(', ')}`);
    const batchResults = await Promise.all(batch.map((location) => collectLocation(location, sources, options, limiters)));
    results.push(...batchResults);
    if (start + options.batchSize < locations.length && options.batchDelayMs > 0) {
      await sleep(options.batchDelayMs);
    }
  }

  return results;
}

function valuesForMetric(locationResult, metric) {
  return Object.values(locationResult.sources)
    .filter((entry) => entry.status === 'ok')
    .map((entry) => ({ sourceId: entry.sourceId, value: (entry.comparison_metrics || entry.metrics)[metric] }))
    .filter((entry) => entry.value !== null && entry.value !== undefined && entry.value !== '');
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function numericMetricStats(entries) {
  const values = entries.map((entry) => Number(entry.value)).filter(Number.isFinite);
  if (!values.length) {
    return { count: 0, mean: null, median: null, std_dev: null, min: null, max: null, outliers: [], agreement_score: null };
  }

  const center = median(values);
  const deviation = stdDev(values);
  const outliers = deviation > 0
    ? entries.filter((entry) => Math.abs(Number(entry.value) - center) > 2 * deviation).map((entry) => entry.sourceId)
    : [];
  const agreementHits = deviation === 0
    ? entries.filter((entry) => Number(entry.value) === center).length
    : entries.filter((entry) => Math.abs(Number(entry.value) - center) <= deviation).length;

  return {
    count: values.length,
    mean: mean(values),
    median: center,
    std_dev: deviation,
    min: Math.min(...values),
    max: Math.max(...values),
    outliers,
    agreement_score: agreementHits / values.length
  };
}

function categoricalMetricStats(entries) {
  if (!entries.length) {
    return { count: 0, mode: null, outliers: [], agreement_score: null };
  }

  const counts = new Map();
  entries.forEach((entry) => {
    const key = String(entry.value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const [mode, modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return {
    count: entries.length,
    mode,
    outliers: entries.filter((entry) => String(entry.value) !== mode).map((entry) => entry.sourceId),
    agreement_score: modeCount / entries.length
  };
}

function compareResults(results) {
  const byLocation = {};
  results.forEach((locationResult) => {
    byLocation[locationResult.location.id] = {
      location: locationResult.location,
      metrics: Object.fromEntries(METRICS.map((metric) => [
        metric,
        metric === 'weather_condition'
          ? categoricalMetricStats(valuesForMetric(locationResult, metric))
          : numericMetricStats(valuesForMetric(locationResult, metric))
      ]))
    };
  });
  return byLocation;
}

function aggregateAnalysis(results, comparisons, sources) {
  const sourceStats = Object.fromEntries(sources.map((source) => [source.id, {
    id: source.id,
    name: source.name,
    ok: 0,
    errors: 0,
    missing: 0,
    outliers: 0,
    agreement_hits: 0,
    agreement_total: 0,
    latencies: []
  }]));
  const metricSpread = Object.fromEntries(METRICS.map((metric) => [metric, []]));
  const locationDisagreement = [];

  results.forEach((locationResult) => {
    Object.values(locationResult.sources).forEach((entry) => {
      const stats = sourceStats[entry.sourceId];
      if (!stats) return;
      if (entry.status === 'ok') stats.ok += 1;
      else if (['not_configured', 'not_applicable', 'no_data'].includes(entry.status)) stats.missing += 1;
      else stats.errors += 1;
      if (Number.isFinite(entry.latency_ms)) stats.latencies.push(entry.latency_ms);
    });
  });

  Object.values(comparisons).forEach((locationComparison) => {
    const disagreementScores = [];

    Object.entries(locationComparison.metrics).forEach(([metric, stats]) => {
      if (stats.agreement_score !== null) disagreementScores.push(1 - stats.agreement_score);
      if (Number.isFinite(stats.std_dev)) metricSpread[metric].push(stats.std_dev);

      const outlierSet = new Set(stats.outliers || []);
      outlierSet.forEach((sourceId) => {
        if (sourceStats[sourceId]) sourceStats[sourceId].outliers += 1;
      });

      valuesForMetric(
        results.find((item) => item.location.id === locationComparison.location.id),
        metric
      ).forEach((entry) => {
        const source = sourceStats[entry.sourceId];
        if (!source) return;
        source.agreement_total += 1;
        if (!outlierSet.has(entry.sourceId)) source.agreement_hits += 1;
      });
    });

    locationDisagreement.push({
      id: locationComparison.location.id,
      name: locationComparison.location.name,
      disagreement: disagreementScores.length ? mean(disagreementScores) : null
    });
  });

  const sourceSummary = Object.values(sourceStats).map((source) => ({
    ...source,
    average_latency_ms: source.latencies.length ? Math.round(mean(source.latencies)) : null,
    agreement_score: source.agreement_total ? source.agreement_hits / source.agreement_total : null
  }));

  return {
    sourceSummary,
    topOutlierSources: [...sourceSummary].sort((a, b) => b.outliers - a.outliers).slice(0, 5),
    topDisagreementLocations: locationDisagreement
      .filter((item) => item.disagreement !== null)
      .sort((a, b) => b.disagreement - a.disagreement)
      .slice(0, 5),
    topSpreadMetrics: Object.entries(metricSpread)
      .map(([metric, values]) => ({ metric, average_std_dev: values.length ? mean(values) : null }))
      .filter((item) => item.average_std_dev !== null)
      .sort((a, b) => b.average_std_dev - a.average_std_dev)
      .slice(0, 5),
    topMissingSources: [...sourceSummary].sort((a, b) => b.missing + b.errors - (a.missing + a.errors)).slice(0, 5)
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function makeSummaryCsv(results) {
  const headers = [
    'location',
    'location_id',
    'country',
    'lat',
    'lon',
    'source',
    'status',
    'temp',
    'feels_like',
    'humidity',
    'pressure',
    'wind_speed',
    'wind_gusts',
    'wind_direction',
    'precipitation',
    'cloud_cover',
    'visibility',
    'dew_point',
    'weather_condition',
    'quality_flags',
    'latency_ms',
    'http_status',
    'error'
  ];
  const rows = [headers.join(',')];

  results.forEach((locationResult) => {
    Object.values(locationResult.sources).forEach((entry) => {
      const row = [
        locationResult.location.name,
        locationResult.location.id,
        locationResult.location.country,
        locationResult.location.lat,
        locationResult.location.lon,
        entry.sourceId,
        entry.status,
        entry.metrics.temperature,
        entry.metrics.feels_like,
        entry.metrics.humidity,
        entry.metrics.pressure,
        entry.metrics.wind_speed,
        entry.metrics.wind_gusts,
        entry.metrics.wind_direction,
        entry.metrics.precipitation,
        entry.metrics.cloud_cover,
        entry.metrics.visibility,
        entry.metrics.dew_point,
        entry.metrics.weather_condition,
        entry.quality_flags?.join('|') || '',
        entry.latency_ms,
        entry.http_status,
        entry.error
      ];
      rows.push(row.map(csvEscape).join(','));
    });
  });

  return `${rows.join('\n')}\n`;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function barRows(items, valueKey, labelKey = 'name', maxValue = null) {
  const max = maxValue ?? Math.max(1, ...items.map((item) => Number(item[valueKey]) || 0));
  return items.map((item) => {
    const value = Number(item[valueKey]) || 0;
    const width = max ? Math.max(2, (value / max) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-label">${htmlEscape(item[labelKey])}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      <div class="bar-value">${htmlEscape(formatNumber(value, value % 1 ? 1 : 0))}</div>
    </div>`;
  }).join('\n');
}

function comparisonTable(comparisons) {
  const rows = [];
  Object.values(comparisons).forEach((locationComparison) => {
    METRICS.forEach((metric) => {
      const stats = locationComparison.metrics[metric];
      const agreement = stats.agreement_score;
      const cls = agreement === null ? 'neutral' : agreement >= 0.75 ? 'good' : agreement >= 0.5 ? 'warn' : 'bad';
      rows.push(`<tr class="${cls}">
        <td>${htmlEscape(locationComparison.location.name)}</td>
        <td>${htmlEscape(metric)}</td>
        <td>${htmlEscape(stats.count ?? 0)}</td>
        <td>${htmlEscape(formatPercent(agreement))}</td>
        <td>${htmlEscape(formatNumber(stats.mean, 2))}</td>
        <td>${htmlEscape(formatNumber(stats.median, 2))}</td>
        <td>${htmlEscape(formatNumber(stats.std_dev, 2))}</td>
        <td>${htmlEscape(stats.mode ?? '—')}</td>
        <td>${htmlEscape((stats.outliers || []).join(', ') || '—')}</td>
      </tr>`);
    });
  });

  return `<table>
    <thead>
      <tr>
        <th>Location</th>
        <th>Metric</th>
        <th>Sources</th>
        <th>Agreement</th>
        <th>Mean</th>
        <th>Median</th>
        <th>Std dev</th>
        <th>Mode</th>
        <th>Outliers</th>
      </tr>
    </thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>`;
}

function sourceAgreementTable(sourceSummary) {
  const rows = [...sourceSummary]
    .sort((a, b) => (b.agreement_score ?? -1) - (a.agreement_score ?? -1))
    .map((source) => `<tr>
      <td>${htmlEscape(source.name)}</td>
      <td>${htmlEscape(source.id)}</td>
      <td>${source.ok}</td>
      <td>${source.errors}</td>
      <td>${source.missing}</td>
      <td>${source.outliers}</td>
      <td>${htmlEscape(formatPercent(source.agreement_score))}</td>
      <td>${htmlEscape(source.average_latency_ms ?? '—')}</td>
    </tr>`);

  return `<table>
    <thead>
      <tr>
        <th>Source</th>
        <th>ID</th>
        <th>OK</th>
        <th>Errors</th>
        <th>Missing</th>
        <th>Outliers</th>
        <th>Agreement</th>
        <th>Avg latency ms</th>
      </tr>
    </thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>`;
}

function makeHtmlReport(runConfig, comparisons, analysis) {
  const outlierItems = analysis.sourceSummary
    .map((source) => ({ name: source.id, value: source.outliers }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
  const latencyItems = analysis.sourceSummary
    .filter((source) => Number.isFinite(source.average_latency_ms))
    .map((source) => ({ name: source.id, value: source.average_latency_ms }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weather Source Test ${htmlEscape(runConfig.timestamp)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #172033; }
    main { max-width: 1440px; margin: 0 auto; padding: 32px; }
    h1, h2 { margin: 0 0 12px; letter-spacing: 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 20px; margin-top: 32px; }
    .meta, .grid { display: grid; gap: 12px; }
    .meta { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 20px 0; }
    .card { background: #fff; border: 1px solid #d9dee8; border-radius: 8px; padding: 16px; }
    .label { color: #607089; font-size: 12px; text-transform: uppercase; font-weight: 700; }
    .value { margin-top: 6px; font-size: 18px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9dee8; border-radius: 8px; overflow: hidden; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #e6eaf0; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #eef2f7; font-size: 12px; text-transform: uppercase; color: #485871; }
    tr.good td { background: #edf9f0; }
    tr.warn td { background: #fff8e7; }
    tr.bad td { background: #fff0f0; }
    tr.neutral td { background: #fafafa; color: #6b7280; }
    .scroll { overflow-x: auto; border-radius: 8px; }
    .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .bar-row { display: grid; grid-template-columns: 130px 1fr 70px; align-items: center; gap: 10px; margin: 8px 0; font-size: 13px; }
    .bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { height: 12px; background: #e7ebf1; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; background: #315f9e; }
    .bar-value { text-align: right; font-variant-numeric: tabular-nums; }
    code { background: #eef2f7; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Weather API Data Quality Report</h1>
    <div class="meta">
      <div class="card"><div class="label">Timestamp</div><div class="value">${htmlEscape(runConfig.timestamp)}</div></div>
      <div class="card"><div class="label">Locations</div><div class="value">${runConfig.locations.length}</div></div>
      <div class="card"><div class="label">Sources</div><div class="value">${runConfig.sources.length}</div></div>
      <div class="card"><div class="label">Dry run</div><div class="value">${runConfig.dryRun ? 'yes' : 'no'}</div></div>
    </div>

    <h2>Source Agreement Summary</h2>
    <div class="scroll">${sourceAgreementTable(analysis.sourceSummary)}</div>

    <h2>Charts</h2>
    <div class="charts">
      <div class="card">
        <h3>Sources Most Often Marked Outlier</h3>
        ${barRows(outlierItems, 'value')}
      </div>
      <div class="card">
        <h3>Average Latency By Source</h3>
        ${barRows(latencyItems, 'value')}
      </div>
    </div>

    <h2>Agreement Per Location And Metric</h2>
    <div class="scroll">${comparisonTable(comparisons)}</div>

    <h2>Run Config</h2>
    <div class="scroll"><pre>${htmlEscape(JSON.stringify({
      version: runConfig.version,
      timeoutMs: runConfig.timeoutMs,
      sourceRps: runConfig.sourceRps,
      batchSize: runConfig.batchSize,
      batchDelayMs: runConfig.batchDelayMs,
      forceRegional: runConfig.forceRegional,
      sources: runConfig.sources.map((source) => ({ id: source.id, endpointFormat: source.endpointFormat, configured: source.configured }))
    }, null, 2))}</pre></div>
  </main>
</body>
</html>`;
}

async function writeOutputs(outputDir, runConfig, results, comparisons, analysis) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'results_raw.json'), `${JSON.stringify({ run_config: runConfig, results }, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'results_summary.csv'), makeSummaryCsv(results));
  await fs.writeFile(path.join(outputDir, 'results_report.html'), makeHtmlReport(runConfig, comparisons, analysis));
  await fs.writeFile(path.join(outputDir, 'run_config.json'), `${JSON.stringify(runConfig, null, 2)}\n`);
}

function printAnalysis(analysis) {
  console.log('\nTop 5 zdrojů s nejvíce odchylkami:');
  analysis.topOutlierSources.forEach((source, index) => {
    console.log(`${index + 1}. ${source.id}: ${source.outliers}`);
  });

  console.log('\nTop 5 míst s největší neshodou:');
  analysis.topDisagreementLocations.forEach((location, index) => {
    console.log(`${index + 1}. ${location.name}: ${formatPercent(1 - location.disagreement)} agreement`);
  });

  console.log('\nMetriky s největším průměrným rozptylem:');
  analysis.topSpreadMetrics.forEach((metric, index) => {
    console.log(`${index + 1}. ${metric.metric}: std_dev ${formatNumber(metric.average_std_dev, 2)}`);
  });

  console.log('\nZdroje, které nejčastěji chyběly nebo timeoutovaly:');
  analysis.topMissingSources.forEach((source, index) => {
    console.log(`${index + 1}. ${source.id}: missing/errors ${source.missing + source.errors}`);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadEnvFiles();

  const sources = selectedSources(options);
  const locations = selectedLocations(options);
  const runTimestamp = new Date().toISOString();
  const outputDir = path.join(options.outputBase, `weather_test_${timestamp()}`);
  const runConfig = {
    version: VERSION,
    timestamp: runTimestamp,
    dryRun: options.dryRun,
    timeoutMs: options.timeoutMs,
    sourceRps: options.sourceRps,
    batchSize: options.batchSize,
    batchDelayMs: options.batchDelayMs,
    forceRegional: options.forceRegional,
    outputDir,
    metrics: METRICS,
    locations,
    sources: sources.map(sourceConfig)
  };

  console.log(`Starting weather source test: ${locations.length} locations × ${sources.length} sources`);
  console.log(`Output: ${outputDir}`);
  const results = await collectAll(locations, sources, options);
  const comparisons = compareResults(results);
  const analysis = aggregateAnalysis(results, comparisons, sources);
  await writeOutputs(outputDir, runConfig, results, comparisons, analysis);
  printAnalysis(analysis);
  console.log(`\nDone. Results written to ${outputDir}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
