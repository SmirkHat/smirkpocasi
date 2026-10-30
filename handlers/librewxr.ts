const LIBREWXR_URL = 'https://api.librewxr.net/public/weather-maps.json';
// New frames arrive every 10 minutes, so a minute of caching costs little freshness and spares the free public instance.
const CACHE_TTL_MS = 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 5000;
// A longer outage should move the client to another radar instead of an ageing frame list.
const STALE_LIMIT_MS = 30 * 60 * 1000;

let cachedPayload = null;
let cachedAt = 0;
let pendingRequest = null;

function fetchCatalog() {
  pendingRequest ||= fetch(LIBREWXR_URL, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`LibreWXR responded with ${response.status}.`);
      const { host, generated, radar } = await response.json();
      if (!radar?.past?.length) throw new Error('LibreWXR returned no radar frames.');
      return { host, generated, radar };
    })
    .finally(() => {
      pendingRequest = null;
    });
  return pendingRequest;
}

export default async function handler(req, res) {
  if (cachedPayload && Date.now() - cachedAt < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.status(200).json(cachedPayload);
    return;
  }

  try {
    cachedPayload = await fetchCatalog();
    cachedAt = Date.now();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.status(200).json(cachedPayload);
  } catch (error) {
    if (cachedPayload && Date.now() - cachedAt < STALE_LIMIT_MS) {
      res.setHeader('Cache-Control', 'public, s-maxage=30');
      res.status(200).json({ ...cachedPayload, stale: true });
      return;
    }

    res.status(502).json({ error: 'LibreWXR je dočasně nedostupný.', detail: error.message });
  }
}
