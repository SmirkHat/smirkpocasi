const ALADIN_URL = 'https://aladinonline.oblacno.cz/get_data.php';
const USER_AGENT = 'SmirkPocasi/1.0 (https://smirkhat.org; weather app)';

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Missing lat or lon.' });
    return;
  }

  const params = new URLSearchParams({ latitude: lat, longitude: lon });

  try {
    // The upstream answers Node's default fetch User-Agent with a 401 HTML page.
    const response = await fetch(`${ALADIN_URL}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Aladin is unavailable.', detail: error.message });
  }
}
