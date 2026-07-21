const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const CACHE_TTL = 10 * 60 * 1000;

let cachedPayload = null;
let cachedAt = 0;
let pendingRequest = null;

export default async function handler(req, res) {
  const now = Date.now();

  if (cachedPayload && now - cachedAt < CACHE_TTL) {
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json(cachedPayload);
    return;
  }

  try {
    pendingRequest ||= fetch(RAINVIEWER_URL).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error('RainViewer request failed.');
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    });

    const payload = await pendingRequest;
    cachedPayload = payload;
    cachedAt = Date.now();
    pendingRequest = null;

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json(payload);
  } catch (error) {
    pendingRequest = null;

    if (cachedPayload) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=1800');
      res.status(200).json({ ...cachedPayload, stale: true });
      return;
    }

    res.status(error.status || 502).json(error.payload || { error: 'RainViewer je dočasně nedostupný.', detail: error.message });
  }
}
