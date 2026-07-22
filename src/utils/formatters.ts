export function formatTemperature(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value)} °C`;
}

export function formatWind(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value)} km/h`;
}

export function formatPressure(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value)} hPa`;
}

export function formatPrecipitation(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)} mm`;
}

export function formatPercent(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value)} %`;
}

export function formatCloudCover(value) {
  return formatPercent(value);
}

export function formatUvIndex(value) {
  return value === null || value === undefined ? '—' : Number(value).toFixed(1).replace(/\.0$/, '');
}

export function formatVaporPressureDeficit(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(2).replace(/\.00$/, '')} kPa`;
}

export function formatAbsoluteHumidity(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(1).replace(/\.0$/, '')} g/m³`;
}

export function formatVisibility(value) {
  if (value === null || value === undefined) return '—';
  const meters = Number(value);
  if (!Number.isFinite(meters)) return '—';
  if (meters >= 10000) return `${Math.round(meters / 1000)} km`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')} km`;
  return `${Math.round(meters)} m`;
}

export function formatWindDirection(value) {
  if (value === null || value === undefined) return '—';
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) return '—';

  const directions = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
  const normalized = ((degrees % 360) + 360) % 360;
  const direction = directions[Math.round(normalized / 45) % directions.length];
  return `${direction} ${Math.round(normalized)}°`;
}

export function formatTime(value) {
  if (!value) return '—';
  const date = parseDate(value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatDay(value) {
  if (!value) return '—';
  const date = parseDate(value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(date);
}

function parseDate(value) {
  if (!value || value instanceof Date) return new Date(value);
  const str = String(value).trim();
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
  // Czech format: DD.MM.YYYY HH:MM or DD.MM.YYYY HH:MM:SS
  const czMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (czMatch) {
    return new Date(czMatch[3], czMatch[2] - 1, czMatch[1], czMatch[4], czMatch[5], czMatch[6] || 0);
  }
  return new Date(str);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = parseDate(value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/** Full stamp with seconds — for data-freshness footers. */
export function formatDateTimeDetailed(value) {
  if (!value) return '—';
  const date = parseDate(value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/**
 * UI-only place label: drop trailing parentheticals like "Lípa (okres Zlín)".
 * Keep the full `location.name` in store/APIs for disambiguation.
 */
export function formatPlaceName(value) {
  if (value == null) return '';
  let text = String(value).trim();
  if (!text) return '';
  // Strip one or more trailing " (...)" groups; leave mid-string parens alone.
  let previous;
  do {
    previous = text;
    text = text.replace(/\s*\([^()]*\)\s*$/u, '').trim();
  } while (text !== previous);
  return text || String(value).trim();
}

export function formatFlow(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 100) return `${Math.round(n)}`;
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(3);
  if (abs === 0) return '0';
  return n.toFixed(4);
}

/** Title-case ALL-CAPS station names (e.g. PEGELONLINE); leave mixed case alone. */
export function formatHydroName(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return text;

  let upper = 0;
  for (const ch of letters) {
    if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper += 1;
  }
  if (upper / letters.length < 0.8) return text;

  return text
    .toLocaleLowerCase('de-DE')
    .split(/([^\p{L}]+)/u)
    .map((part) => {
      if (!part || !/\p{L}/u.test(part)) return part;
      return part.charAt(0).toLocaleUpperCase('de-DE') + part.slice(1);
    })
    .join('');
}
