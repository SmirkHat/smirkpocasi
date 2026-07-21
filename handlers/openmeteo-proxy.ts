const ALLOWED_HOSTS = new Set(['api.open-meteo.com', 'ensemble-api.open-meteo.com']);

function proxyEnabled() {
  return process.env.VITE_ENABLE_OPEN_METEO_DEV_PROXY === 'true';
}

function proxyPrefix() {
  return process.env.VITE_OPEN_METEO_DEV_PROXY || 'https://xle.cz/';
}

function proxiedUrl(targetUrl) {
  const prefix = proxyPrefix();
  if (prefix.includes('{url}')) return prefix.replace('{url}', encodeURIComponent(targetUrl));
  if (prefix.endsWith('=') || /[?&][^=]+=$/u.test(prefix)) return `${prefix}${encodeURIComponent(targetUrl)}`;
  return `${prefix.replace(/\/?$/u, '/')}${targetUrl}`;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&Acirc;&deg;/giu, '\u00b0')
    .replace(/&deg;/giu, '\u00b0')
    .replace(/&quot;/giu, '"')
    .replace(/&#34;/giu, '"')
    .replace(/&#x22;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x27;/giu, "'")
    .replace(/&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&amp;/giu, '&')
    .replace(/&nbsp;/giu, ' ');
}

function extractJsonText(text) {
  const cleaned = decodeHtmlEntities(
    String(text || '')
      .replace(/<br\s*\/?>/giu, '')
      .replace(/<\/?p[^>]*>/giu, '')
      .trim()
  );

  const objectStart = cleaned.indexOf('{');
  const arrayStart = cleaned.indexOf('[');
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = Math.min(...startCandidates);

  if (!Number.isFinite(start)) {
    throw new Error('Proxy response did not contain JSON.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, index + 1);
    }
  }

  return cleaned.slice(start).trim();
}

function parseProxyJson(text) {
  return JSON.parse(extractJsonText(text));
}

export default async function handler(req, res) {
  if (!proxyEnabled()) {
    res.status(404).json({ error: 'Open-Meteo dev proxy is disabled.' });
    return;
  }

  const target = String(req.query.url || '');
  let url;
  try {
    url = new URL(target);
  } catch {
    res.status(400).json({ error: 'Invalid target URL.' });
    return;
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    res.status(400).json({ error: 'Target host is not allowed.' });
    return;
  }

  try {
    const response = await fetch(proxiedUrl(url.toString()));
    const text = await response.text();
    const data = parseProxyJson(text);

    if (!response.ok || data?.error) {
      res.status(response.ok ? 502 : response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Open-Meteo dev proxy failed.', detail: error.message });
  }
}
