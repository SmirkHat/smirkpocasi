/**
 * SMHI Metfcst snow1g (Nordic coverage). Point outside domain returns 404.
 * https://opendata.smhi.se/metfcst/snow1gv1/
 */
const BASE =
  'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point';

function coord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : null;
}

export default async function handler(req, res) {
  const { lat, lon } = req.query;
  const latitude = coord(lat);
  const longitude = coord(lon);

  if (!latitude || !longitude) {
    res.status(400).json({ error: 'Missing or invalid lat/lon.' });
    return;
  }

  try {
    const url = `${BASE}/lon/${longitude}/lat/${latitude}/data.json`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SmirkPocasi/2.0 (smirkhat.org)',
      },
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      res.status(response.status).json({
        error: 'SMHI forecast unavailable.',
        detail: data?.message || data || response.statusText,
      });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'SMHI is unavailable.', detail: error.message });
  }
}
