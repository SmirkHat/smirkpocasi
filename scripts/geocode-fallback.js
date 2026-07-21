import { readFileSync, writeFileSync } from 'fs';

const API_KEY = 'KXqueQE33ZzscasXIR8M216wL2l1-tNzIKZbC2XSUVA';
const BASE_URL = 'https://api.mapy.cz/v1/geocode';

async function geocode(query) {
  try {
    const url = `${BASE_URL}?${new URLSearchParams({ query, lang: 'cs', limit: '1' })}`;
    const res = await fetch(url, { headers: { 'X-Mapy-Api-Key': API_KEY } });
    const data = await res.json();
    if (data.items?.length > 0) {
      return { lat: data.items[0].position.lat, lon: data.items[0].position.lon };
    }
  } catch {
    // Ignore failed requests.
  }
  return null;
}

const stations = JSON.parse(readFileSync('data/hydro-stations.json', 'utf8'));
const failed = stations.filter(s => !s.lat || !s.lon);
console.log(`Fallback geocoding ${failed.length} stations...`);
let count = 0;

for (let i = 0; i < failed.length; i++) {
  const station = failed[i];
  let coords = await geocode(`${station.name}, Česko`);
  if (!coords && station.name.includes('pod')) {
    const short = station.name.replace(/\s*pod.*$/, '');
    coords = await geocode(`${short}, Česko`);
  }
  if (!coords && station.name.includes('nad')) {
    const short = station.name.replace(/\s*nad.*$/, '');
    coords = await geocode(`${short}, Česko`);
  }
  if (coords) {
    station.lat = coords.lat;
    station.lon = coords.lon;
    count++;
    process.stdout.write('.');
  } else {
    process.stdout.write('x');
  }
  if (i % 10 === 0) await new Promise(r => setTimeout(r, 150));
  if (i % 50 === 0) writeFileSync('data/hydro-stations.json', JSON.stringify(stations, null, 2));
}

writeFileSync('data/hydro-stations.json', JSON.stringify(stations, null, 2));
console.log(`\nFallback done: ${count}/${failed.length} with coords now.`);
console.log(`Still missing: ${failed.length - count}`);
