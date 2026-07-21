const AIRPORTS = [
  { id: 'LKPR', name: 'Praha Ruzyně', lat: 50.1008, lon: 14.2600 },
  { id: 'LKTB', name: 'Brno Tuřany', lat: 49.1514, lon: 16.6939 },
  { id: 'LKMT', name: 'Ostrava Mošnov', lat: 49.6961, lon: 18.1111 },
  { id: 'LKKU', name: 'Kunovice', lat: 49.0294, lon: 17.4397 },
  { id: 'LKKV', name: 'Karlovy Vary', lat: 50.2031, lon: 12.9150 },
  { id: 'LKPD', name: 'Pardubice', lat: 50.0150, lon: 15.7397 }
];

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

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    res.status(400).json({ error: 'Chybí lat nebo lon.' });
    return;
  }

  try {
    const userLat = Number(lat);
    const userLon = Number(lon);

    const nearest = AIRPORTS
      .map(a => ({ ...a, dist: distanceKm(userLat, userLon, a.lat, a.lon) }))
      .sort((a, b) => a.dist - b.dist)[0];

    // Fetch METAR and TAF
    const [metarRes, tafRes] = await Promise.all([
      fetch(`https://aviationweather.gov/api/data/metar?ids=${nearest.id}&format=json`),
      fetch(`https://aviationweather.gov/api/data/taf?ids=${nearest.id}&format=json`)
    ]);

    const metar = await metarRes.json();
    const taf = await tafRes.json();

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({
      airport: nearest,
      metar: metar[0] || null,
      taf: taf[0] || null,
      attribution: 'Data: NOAA Aviation Weather'
    });
  } catch (error) {
    res.status(502).json({ error: 'Letecká data jsou nedostupná.', detail: error.message });
  }
}
