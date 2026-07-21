import { readFileSync } from 'fs';
import { join } from 'path';
import https from 'node:https';

const STATIONS = JSON.parse(readFileSync(join(process.cwd(), 'data/shmu-stations.json'), 'utf8'));
const DATA_BASE = 'https://opendata.shmu.sk/meteorology/climate/now/data';
// SHMÚ OpenData presents a cert chain that some environments cannot verify.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

let snapshotCache = null;
let snapshotCacheAt = 0;
const SNAPSHOT_TTL = 5 * 60 * 1000;

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

function dayStamp(offsetDays = 0) {
  const date = new Date(Date.now() - offsetDays * 86400000);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function insecureGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent: insecureAgent }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          insecureGet(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            text: async () => body,
            json: async () => JSON.parse(body),
          });
        });
      })
      .on('error', reject);
  });
}

async function latestSnapshotUrl() {
  for (const offset of [0, 1]) {
    const day = dayStamp(offset);
    const indexHtml = await (await insecureGet(`${DATA_BASE}/${day}/`)).text();
    const files = [...indexHtml.matchAll(/href="(aws1min%20-%20[^"]+\.json)"/g)].map((m) => m[1]);
    if (!files.length) continue;
    return `${DATA_BASE}/${day}/${files[files.length - 1]}`;
  }
  throw new Error('No SHMÚ snapshot found');
}

async function getSnapshot() {
  if (snapshotCache && Date.now() - snapshotCacheAt < SNAPSHOT_TTL) return snapshotCache;
  const url = await latestSnapshotUrl();
  const json = await (await insecureGet(url)).json();
  const byStation = new Map();
  for (const row of json.data || []) {
    const id = String(row.ind_kli);
    const prev = byStation.get(id);
    if (!prev || String(row.minuta) > String(prev.minuta)) byStation.set(id, row);
  }
  snapshotCache = byStation;
  snapshotCacheAt = Date.now();
  return byStation;
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
    const byStation = await getSnapshot();
    const candidates = STATIONS
      .filter((s) => byStation.has(String(s.id)))
      .map((s) => ({ ...s, distance: distanceKm(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.distance - b.distance);

    const nearest = candidates[0];
    if (!nearest) throw new Error('Žádná SHMÚ stanice s daty v dosahu.');

    const row = byStation.get(String(nearest.id));
    return res.status(200).json({
      station: {
        id: nearest.id,
        name: nearest.name,
        distance: nearest.distance,
        lat: nearest.lat,
        lon: nearest.lon,
      },
      current: {
        time: row.minuta,
        temperature: row.t ?? null,
        humidity: row.vlh_rel ?? null,
        pressure: row.tlak ?? null,
        windSpeed: row.vie_pr_rych ?? null,
        windDirection: row.vie_pr_smer ?? null,
        windGust: row.vie_max_rych ?? null,
        precipitation: row.zra_uhrn ?? null,
      },
      attribution: 'SHMÚ Open Data (CC BY 4.0)',
    });
  } catch (error) {
    return res.status(502).json({ error: 'SHMÚ data jsou nedostupná.', detail: error.message });
  }
}
