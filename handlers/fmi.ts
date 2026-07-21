/**
 * FMI open data WFS — Scandinavia point forecast (edited weather).
 * Server parses XML into hourly steps for the client.
 */
const WFS = 'https://opendata.fmi.fi/wfs';

function coord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : null;
}

function isoHoursFromNow(hours) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseNumber(value) {
  if (value == null || value === '' || value === 'NaN') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Group BsWfsElement ParameterName/Value rows by Time into step objects. */
function parseFmiXml(xml) {
  const byTime = new Map();
  const re =
    /<BsWfs:Time>([^<]+)<\/BsWfs:Time>\s*<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>\s*<BsWfs:ParameterValue>([^<]*)<\/BsWfs:ParameterValue>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const [, time, name, raw] = match;
    const step = byTime.get(time) || { time };
    step[name] = parseNumber(raw);
    byTime.set(time, step);
  }
  return [...byTime.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export default async function handler(req, res) {
  const lat = coord(req.query.lat);
  const lon = coord(req.query.lon);

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing or invalid lat/lon.' });
    return;
  }

  const start = isoHoursFromNow(-1);
  const end = isoHoursFromNow(72);
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::forecast::edited::weather::scandinavia::point::simple',
    latlon: `${lat},${lon}`,
    starttime: start,
    endtime: end,
  });

  try {
    const response = await fetch(`${WFS}?${params}`, {
      headers: { 'User-Agent': 'SmirkPocasi/2.0 (smirkhat.org)' },
    });
    const xml = await response.text();

    if (!response.ok) {
      res.status(response.status).json({
        error: 'FMI forecast unavailable.',
        detail: xml.slice(0, 400),
      });
      return;
    }

    const steps = parseFmiXml(xml);
    if (!steps.length) {
      res.status(404).json({ error: 'FMI returned no forecast steps for this point.' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({
      source: 'fmi',
      latlon: `${lat},${lon}`,
      steps,
    });
  } catch (error) {
    res.status(502).json({ error: 'FMI is unavailable.', detail: error.message });
  }
}
