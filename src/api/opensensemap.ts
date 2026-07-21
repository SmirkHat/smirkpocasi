import { calculateDewPoint } from '../utils/weatherMath';

const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LOCAL_RADIUS_KM = 20;
const SEARCH_RADIUS_METERS = 50000;

function distanceKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function boxDistanceKm(box, location) {
  const [lon, lat] = box.currentLocation?.coordinates || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return distanceKm(location.lat, location.lon, lat, lon);
}

function sensorValue(box, title) {
  const sensor = box.sensors?.find((item) => item.title?.toLowerCase().includes(title));
  const value = Number(sensor?.lastMeasurement?.value);
  return Number.isFinite(value) ? value : null;
}

function latestTimestamp(box) {
  const timestamps = (box.sensors || [])
    .map((sensor) => sensor.lastMeasurement?.createdAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

export async function fetchOpenSenseMap(location) {
  const params = new URLSearchParams({
    near: `${location.lon},${location.lat}`,
    maxDistance: String(SEARCH_RADIUS_METERS),
    full: 'true'
  });
  const response = await fetch(`https://api.opensensemap.org/boxes?${params}`);

  if (!response.ok) throw new Error('openSenseMap request failed.');

  const boxes = await response.json();
  const recentBoxes = boxes
    .filter((box) => box.exposure === 'outdoor')
    .filter((box) => sensorValue(box, 'temperatur') !== null)
    .filter((box) => Date.now() - latestTimestamp(box) < MAX_AGE_MS)
    .map((box) => ({ ...box, distanceKm: boxDistanceKm(box, location) }))
    .filter((box) => box.distanceKm !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!recentBoxes.length) throw new Error('No recent openSenseMap temperature stations nearby.');

  const localBoxes = recentBoxes.filter((box) => box.distanceKm <= LOCAL_RADIUS_KM).slice(0, 8);
  const measurementBoxes = localBoxes.length ? localBoxes : recentBoxes.slice(0, 1);
  const nearestDistance = recentBoxes[0].distanceKm;

  const temperature = average(measurementBoxes.map((box) => sensorValue(box, 'temperatur')));
  const humidity = average(measurementBoxes.map((box) => sensorValue(box, 'luftfeuchte')));

  return {
    temperature,
    apparentTemperature: null,
    precipitation: null,
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: average(measurementBoxes.map((box) => sensorValue(box, 'wind'))),
    windDirection: null,
    windGust: null,
    humidity,
    pressure: average(measurementBoxes.map((box) => sensorValue(box, 'luftdruck')).map((value) => value && value > 2000 ? value / 100 : value)),
    cloudCover: null,
    visibility: null,
    uvIndex: null,
    weatherCode: null,
    distanceKm: nearestDistance,
    qualityIssues: localBoxes.length ? [] : [`nejbližší stanice ${Math.round(nearestDistance)} km od místa`],
    raw: measurementBoxes
  };
}
