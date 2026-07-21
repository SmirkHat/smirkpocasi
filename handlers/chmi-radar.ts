const HISTORY_INDEX_URL = 'https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png_masked/';
const HISTORY_FILE_BASE = HISTORY_INDEX_URL;
const FORECAST_INDEX_URL = 'https://opendata.chmi.cz/meteorology/weather/radar/composite/fct_maxz/png_masked/';
const FORECAST_FILE_BASE = FORECAST_INDEX_URL;
const HISTORY_HOURS = 3;
const FILE_RE = /^pacz2gmaps3\.z_max3d\.(\d{8})\.(\d{4})\.0\.png$/;
const FORECAST_TAR_RE = /^pacz2gmaps3\.fct_z_max\.(\d{8})\.(\d{4})\.ft60s10\.tar$/;
const FORECAST_PNG_RE = /^pacz2gmaps3\.fct_z_max\.(\d{8})\.(\d{4})\.(\d+)\.png$/;

// Whole-image bounds from ČHMÚ radar documentation (EPSG:4326 for Leaflet ImageOverlay).
export const CHMI_RADAR_BOUNDS = [
  [48.047, 11.267],
  [52.167, 20.77]
];

let framesCache = null;
let framesCacheAt = 0;
const FRAMES_CACHE_TTL = 60 * 1000;

let forecastBundle = null;
let forecastBundleAt = 0;
const FORECAST_CACHE_TTL = 60 * 1000;

function parseTimestamp(datePart, timePart) {
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6)) - 1;
  const day = Number(datePart.slice(6, 8));
  const hour = Number(timePart.slice(0, 2));
  const minute = Number(timePart.slice(2, 4));
  return Date.UTC(year, month, day, hour, minute, 0);
}

function parseHistoryIndex(html) {
  const matches = [...html.matchAll(/href="(pacz2gmaps3\.z_max3d\.\d{8}\.\d{4}\.0\.png)"/g)];
  const seen = new Set();
  const frames = [];

  for (const match of matches) {
    const file = match[1];
    if (seen.has(file)) continue;
    seen.add(file);

    const parts = file.match(FILE_RE);
    if (!parts) continue;

    const timeMs = parseTimestamp(parts[1], parts[2]);
    frames.push({
      id: `h-${Math.floor(timeMs / 1000)}`,
      type: 'history',
      time: new Date(timeMs).toISOString(),
      lead: 0,
      file
    });
  }

  frames.sort((a, b) => a.time.localeCompare(b.time));
  return frames;
}

function latestForecastTar(html) {
  const matches = [...html.matchAll(/href="(pacz2gmaps3\.fct_z_max\.\d{8}\.\d{4}\.ft60s10\.tar)"/g)];
  const files = [...new Set(matches.map((match) => match[1]))].filter((file) => FORECAST_TAR_RE.test(file));
  files.sort();
  return files.at(-1) || null;
}

/** Minimal USTAR reader — enough for ČHMÚ forecast PNG bundles. */
function extractTarPngs(buffer) {
  const files = new Map();
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '').trim();
    if (!name) break;

    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeOctal, 8) || 0;
    offset += 512;

    if (size > 0 && offset + size <= buffer.length) {
      const baseName = name.split('/').pop();
      if (baseName && FORECAST_PNG_RE.test(baseName)) {
        files.set(baseName, Buffer.from(buffer.subarray(offset, offset + size)));
      }
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

function buildForecastFrames(pngFiles) {
  const frames = [];

  for (const file of pngFiles.keys()) {
    const parts = file.match(FORECAST_PNG_RE);
    if (!parts) continue;

    const lead = Number(parts[3]);
    if (!Number.isFinite(lead) || lead <= 0) continue;

    const timeMs = parseTimestamp(parts[1], parts[2]);
    frames.push({
      id: `f-${Math.floor(timeMs / 1000)}-${lead}`,
      type: 'nowcast',
      time: new Date(timeMs).toISOString(),
      lead,
      file
    });
  }

  frames.sort((a, b) => a.lead - b.lead || a.time.localeCompare(b.time));
  return frames.map((frame) => ({
    ...frame,
    // Lead-based URL survives tar rotation; exact filenames go stale within minutes.
    url: `/api/chmi-radar?action=image&lead=${frame.lead}`
  }));
}

async function loadForecastBundle({ force = false } = {}) {
  if (!force && forecastBundle && Date.now() - forecastBundleAt < FORECAST_CACHE_TTL) {
    return forecastBundle;
  }

  const indexResponse = await fetch(FORECAST_INDEX_URL, { cache: 'no-store' });
  if (!indexResponse.ok) throw new Error(`ČHMÚ forecast index ${indexResponse.status}`);

  const tarName = latestForecastTar(await indexResponse.text());
  if (!tarName) {
    forecastBundle = { tarName: null, files: new Map(), frames: [] };
    forecastBundleAt = Date.now();
    return forecastBundle;
  }

  if (!force && forecastBundle?.tarName === tarName && forecastBundle.files.size) {
    forecastBundleAt = Date.now();
    return forecastBundle;
  }

  const tarResponse = await fetch(`${FORECAST_FILE_BASE}${tarName}`, { cache: 'no-store' });
  if (!tarResponse.ok) throw new Error(`ČHMÚ forecast tar ${tarResponse.status}`);

  const files = extractTarPngs(Buffer.from(await tarResponse.arrayBuffer()));
  forecastBundle = {
    tarName,
    files,
    frames: buildForecastFrames(files)
  };
  forecastBundleAt = Date.now();
  return forecastBundle;
}

async function listHistoryFrames() {
  const response = await fetch(HISTORY_INDEX_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`ČHMÚ radar index ${response.status}`);

  const html = await response.text();
  const all = parseHistoryIndex(html);
  const cutoff = Date.now() - HISTORY_HOURS * 60 * 60 * 1000;
  const recent = all.filter((frame) => new Date(frame.time).getTime() >= cutoff);
  return (recent.length ? recent : all.slice(-24)).map((frame) => ({
    ...frame,
    url: `/api/chmi-radar?action=image&file=${encodeURIComponent(frame.file)}`
  }));
}

async function listFrames() {
  if (framesCache && Date.now() - framesCacheAt < FRAMES_CACHE_TTL) {
    return framesCache;
  }

  const [history, forecast] = await Promise.all([
    listHistoryFrames(),
    loadForecastBundle().then((bundle) => bundle.frames).catch(() => [])
  ]);

  const frames = [...history, ...forecast];
  framesCache = frames;
  framesCacheAt = Date.now();
  return frames;
}

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W3f0AAAAASUVORK5CYII=',
  'base64'
);

function sendPng(res, buffer, { cacheControl, source }) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Radar-Source', source);
  res.statusCode = 200;
  res.end(buffer);
}

async function findForecastByLead(lead, { force = false } = {}) {
  const bundle = await loadForecastBundle({ force });
  for (const [name, buffer] of bundle.files) {
    const parts = name.match(FORECAST_PNG_RE);
    if (parts && Number(parts[3]) === lead) return buffer;
  }
  return null;
}

async function proxyImage(req, res) {
  const lead = Number(req.query.lead);
  if (Number.isFinite(lead) && lead > 0) {
    let buffer = await findForecastByLead(lead);
    if (!buffer) buffer = await findForecastByLead(lead, { force: true });
    if (!buffer) {
      sendPng(res, TRANSPARENT_PNG, { cacheControl: 'no-store', source: 'chmi-opendata-fct-missing' });
      return;
    }
    sendPng(res, buffer, {
      cacheControl: 'public, max-age=120, s-maxage=180',
      source: 'chmi-opendata-fct'
    });
    return;
  }

  const file = String(req.query.file || '');

  if (FILE_RE.test(file)) {
    const upstream = await fetch(`${HISTORY_FILE_BASE}${file}`);
    if (!upstream.ok) {
      sendPng(res, TRANSPARENT_PNG, { cacheControl: 'no-store', source: 'chmi-opendata-missing' });
      return;
    }

    sendPng(res, Buffer.from(await upstream.arrayBuffer()), {
      cacheControl: 'public, max-age=300, s-maxage=600',
      source: 'chmi-opendata'
    });
    return;
  }

  if (FORECAST_PNG_RE.test(file)) {
    let bundle = await loadForecastBundle();
    let buffer = bundle.files.get(file);
    if (!buffer) {
      bundle = await loadForecastBundle({ force: true });
      buffer = bundle.files.get(file);
    }
    if (!buffer) {
      const parts = file.match(FORECAST_PNG_RE);
      const fileLead = parts ? Number(parts[3]) : NaN;
      if (Number.isFinite(fileLead) && fileLead > 0) {
        buffer = await findForecastByLead(fileLead, { force: true });
      }
    }
    if (!buffer) {
      sendPng(res, TRANSPARENT_PNG, { cacheControl: 'no-store', source: 'chmi-opendata-fct-missing' });
      return;
    }

    sendPng(res, buffer, {
      cacheControl: 'public, max-age=120, s-maxage=180',
      source: 'chmi-opendata-fct'
    });
    return;
  }

  res.status(400).json({ error: 'Neplatný název radarového souboru.' });
}

export default async function handler(req, res) {
  const action = req.query.action || 'frames';

  try {
    if (action === 'image') {
      await proxyImage(req, res);
      return;
    }

    if (action !== 'frames') {
      res.status(400).json({ error: 'Neznámá akce.' });
      return;
    }

    const frames = await listFrames();
    if (!frames.length) {
      res.status(502).json({ error: 'ČHMÚ neposkytlo žádný použitelný snímek.' });
      return;
    }

    const historyCount = frames.filter((frame) => frame.type === 'history').length;
    const nowcastCount = frames.length - historyCount;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      ok: true,
      source: 'chmi',
      generatedAt: new Date().toISOString(),
      historyHours: HISTORY_HOURS,
      forecastMinutes: nowcastCount ? 60 : 0,
      bounds: CHMI_RADAR_BOUNDS,
      attribution: 'Radar: ČHMÚ OpenData (MAX_Z + FCT_MAX_Z)',
      frames
    });
  } catch (error) {
    res.status(502).json({ error: 'Radar ČHMÚ je nedostupný.', detail: error.message });
  }
}
