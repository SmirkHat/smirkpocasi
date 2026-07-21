import { knotsToKmh } from '../../utils/weatherMath.ts';

function aviationVisibilityToMeters(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace('+', '').trim();
  const miles = Number(text);
  return Number.isFinite(miles) ? miles * 1609.344 : null;
}

function metarCloudCoverToPercent(metar) {
  const cover = String(metar.cover || metar.clouds?.[0]?.cover || '').toUpperCase();
  if (cover === 'CLR' || cover === 'SKC' || cover === 'NSC' || cover === 'CAVOK') return 0;
  if (cover === 'FEW') return 20;
  if (cover === 'SCT') return 45;
  if (cover === 'BKN') return 80;
  if (cover === 'OVC') return 100;
  return null;
}

function formatTafSummary(taf, airport) {
  if (!taf) return null;
  const raw = taf.rawTAF || taf.rawOb || taf.raw || null;
  const station = airport?.id || taf.icaoId || '';
  const from = taf.validTimeFrom || taf.fcsts?.[0]?.timeFrom || null;
  const to = taf.validTimeTo || taf.fcsts?.[taf.fcsts.length - 1]?.timeTo || null;

  let validity = null;
  if (from && to) {
    const start = new Date(typeof from === 'number' ? from * 1000 : from);
    const end = new Date(typeof to === 'number' ? to * 1000 : to);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      validity = `${start.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  const parts = [
    station ? `TAF ${station}` : 'TAF',
    validity ? `platnost ${validity}` : null,
    raw
  ].filter(Boolean);

  return parts.join(' · ');
}

export function normalizeAviation(data) {
  const metar = data?.metar || {};
  const taf = data?.taf || null;
  const temperature = metar.temp ?? null;
  const tafSummary = formatTafSummary(taf, data?.airport);

  return {
    temperature,
    apparentTemperature: null,
    precipitation: null,
    dewPoint: metar.dewp ?? null,
    windSpeed: knotsToKmh(metar.wspd),
    windDirection: metar.wdir,
    windGust: knotsToKmh(metar.wgst),
    humidity: null,
    pressure: metar.altim,
    cloudCover: metarCloudCoverToPercent(metar),
    visibility: aviationVisibilityToMeters(metar.visib),
    uvIndex: null,
    weatherCode: null,
    tafSummary,
    attribution: [data?.attribution, tafSummary].filter(Boolean).join(' · ') || undefined,
    raw: data
  };
}
