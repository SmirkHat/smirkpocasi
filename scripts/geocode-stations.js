import { readFileSync, writeFileSync } from 'fs';

const API_KEY = 'KXqueQE33ZzscasXIR8M216wL2l1-tNzIKZbC2XSUVA';
const BASE_URL = 'https://api.mapy.cz/v1/geocode';

async function geocode(station) {
  // Include river name to disambiguate (e.g. "Sušice" alone returns wrong location)
  const query = `${station.name}, ${station.river}, Česko`;
  const params = new URLSearchParams({ query, lang: 'cs', limit: '1' });
  try {
    const res = await fetch(`${BASE_URL}?${params}`, { headers: { 'X-Mapy-Api-Key': API_KEY } });
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return { lat: item.position.lat, lon: item.position.lon };
    }
  } catch {
    // Ignore
  }
  return null;
}

const stations = JSON.parse(readFileSync('data/hydro-stations.json', 'utf8'));
const missing = stations.filter(s => !s.lat || !s.lon);
console.log(`Geocoding ${missing.length} stations with Mapy.cz API...`);

let count = 0;
for (let i = 0; i < missing.length; i++) {
  const station = missing[i];
  const coords = await geocode(station);
  if (coords) {
    station.lat = coords.lat;
    station.lon = coords.lon;
    count++;
    process.stdout.write('.');
  } else {
    process.stdout.write('x');
  }
  if (i % 10 === 0) await new Promise(r => setTimeout(r, 150));
  if (i % 50 === 0) {
    writeFileSync('data/hydro-stations.json', JSON.stringify(stations, null, 2));
  }
}

writeFileSync('data/hydro-stations.json', JSON.stringify(stations, null, 2));
console.log(`\nDone! ${count}/${missing.length} stations geocoded.`);
