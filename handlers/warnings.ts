const CAP_URL = 'https://vystrahy-cr.chmi.cz/data/XOCZ50_OKPR.xml';
const CACHE_TTL = 5 * 60 * 1000;

let cache = null;
let cacheAt = 0;

// Coarse kraj bounding boxes for CAP area matching (not cadastral precision).
const KRAJ_BOXES = [
  { name: 'Hlavní město Praha', latMin: 49.94, latMax: 50.18, lonMin: 14.22, lonMax: 14.71 },
  { name: 'Středočeský kraj', latMin: 49.4, latMax: 50.6, lonMin: 13.4, lonMax: 15.6 },
  { name: 'Jihočeský kraj', latMin: 48.55, latMax: 49.6, lonMin: 13.5, lonMax: 15.6 },
  { name: 'Plzeňský kraj', latMin: 49.1, latMax: 50.15, lonMin: 12.4, lonMax: 13.9 },
  { name: 'Karlovarský kraj', latMin: 49.9, latMax: 50.45, lonMin: 12.35, lonMax: 13.35 },
  { name: 'Ústecký kraj', latMin: 50.2, latMax: 51.05, lonMin: 13.15, lonMax: 14.7 },
  { name: 'Liberecký kraj', latMin: 50.5, latMax: 51.05, lonMin: 14.4, lonMax: 15.6 },
  { name: 'Královéhradecký kraj', latMin: 50.05, latMax: 50.8, lonMin: 15.35, lonMax: 16.6 },
  { name: 'Pardubický kraj', latMin: 49.65, latMax: 50.25, lonMin: 15.5, lonMax: 16.9 },
  { name: 'Kraj Vysočina', latMin: 49.05, latMax: 49.75, lonMin: 15.1, lonMax: 16.45 },
  { name: 'Jihomoravský kraj', latMin: 48.6, latMax: 49.55, lonMin: 15.9, lonMax: 17.7 },
  { name: 'Olomoucký kraj', latMin: 49.2, latMax: 50.35, lonMin: 16.7, lonMax: 17.95 },
  { name: 'Zlínský kraj', latMin: 48.85, latMax: 49.5, lonMin: 17.15, lonMax: 18.45 },
  { name: 'Moravskoslezský kraj', latMin: 49.35, latMax: 50.35, lonMin: 17.4, lonMax: 18.85 }
];

const SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

function textOf(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function areaNames(block) {
  return [...block.matchAll(/<areaDesc>([\s\S]*?)<\/areaDesc>/gi)].map((match) => match[1].trim()).filter(Boolean);
}

function krajeForPoint(lat, lon) {
  return KRAJ_BOXES.filter(
    (box) => lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax
  ).map((box) => box.name);
}

function parseCapTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Keep only infos whose validity window covers "now" (same idea as the CHMI map current slice). */
function isCurrentlyValid(info, now = Date.now()) {
  const onsetMs = parseCapTime(textOf(info, 'onset'));
  const expiresMs = parseCapTime(textOf(info, 'expires'));
  if (onsetMs != null && onsetMs > now) return false;
  if (expiresMs != null && expiresMs <= now) return false;
  return true;
}

function isActiveWarning(info) {
  const event = textOf(info, 'event');
  const severity = textOf(info, 'severity') || 'Unknown';
  const certainty = textOf(info, 'certainty') || 'Unknown';

  if (!event) return false;
  if (/^žádn/i.test(event)) return false;
  if (severity === 'Minor' && (certainty === 'Unlikely' || certainty === 'Possible')) return false;
  return SEVERITY_RANK[severity] >= SEVERITY_RANK.Moderate || (severity === 'Minor' && certainty === 'Likely');
}

function coversLocation(areas, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;
  if (!areas.length) return true;

  const kraje = krajeForPoint(lat, lon);
  if (!kraje.length) return false;

  return areas.some((area) => kraje.some((kraj) => area === kraj || area.includes(kraj) || kraj.includes(area)));
}

function parseCap(xml) {
  const infos = [...xml.matchAll(/<info>([\s\S]*?)<\/info>/gi)].map((match) => match[1]);
  const warnings = [];
  const now = Date.now();

  for (const info of infos) {
    const language = textOf(info, 'language').toLowerCase();
    if (language && language !== 'cs') continue;
    if (!isActiveWarning(info)) continue;
    if (!isCurrentlyValid(info, now)) continue;

    const areas = areaNames(info);
    warnings.push({
      id: `${textOf(info, 'event')}-${textOf(info, 'onset')}-${areas[0] || 'cz'}`,
      event: textOf(info, 'event'),
      severity: textOf(info, 'severity') || 'Unknown',
      urgency: textOf(info, 'urgency') || null,
      certainty: textOf(info, 'certainty') || null,
      onset: textOf(info, 'onset') || null,
      expires: textOf(info, 'expires') || null,
      headline: textOf(info, 'headline') || textOf(info, 'event'),
      description: textOf(info, 'description') || null,
      instruction: textOf(info, 'instruction') || null,
      web: textOf(info, 'web') || 'https://vystrahy-cr.chmi.cz/',
      areas: [...new Set(areas)]
    });
  }

  warnings.sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
  return warnings;
}

async function loadWarnings() {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;

  const response = await fetch(CAP_URL, {
    cache: 'no-store',
    headers: { Accept: 'application/xml,text/xml,*/*', 'User-Agent': 'SmirkPocasi/1.0' }
  });
  if (!response.ok) throw new Error(`CAP fetch ${response.status}`);
  const xml = await response.text();
  cache = parseCap(xml);
  cacheAt = Date.now();
  return cache;
}

export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  try {
    const all = await loadWarnings();
    const warnings = all.filter((warning) => coversLocation(warning.areas, lat, lon));

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      attribution: 'Výstrahy: ČHMÚ SIVS (CAP)',
      count: warnings.length,
      warnings
    });
  } catch (error) {
    res.status(502).json({ error: 'Výstrahy ČHMÚ jsou nedostupné.', detail: error.message });
  }
}
