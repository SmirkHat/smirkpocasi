import { toLocalDayMinutes } from '../../utils/weatherMath.ts';

/** AIFS-style models publish 6-hourly, so a gap this wide is still a real neighbour to interpolate from. */
const MAX_HOURLY_GAP = 6;

/** Fractional index of `now` in the hourly arrays (times are local to `utc_offset_seconds`). */
function hourlyPosition(data, now) {
  const times = data?.hourly?.time;
  if (!Array.isArray(times) || times.length < 2) return null;
  const first = Date.parse(`${times[0]}Z`);
  const step = Date.parse(`${times[1]}Z`) - first;
  if (!Number.isFinite(first) || !(step > 0)) return null;
  return (now - (first - (Number(data.utc_offset_seconds) || 0) * 1000)) / step;
}

function interpolatedAt(values, position) {
  const start = Math.floor(position);
  const end = Math.ceil(position);
  let before = start;
  let after = end;
  while (before >= 0 && start - before <= MAX_HOURLY_GAP && values[before] == null) before -= 1;
  while (after < values.length && after - end <= MAX_HOURLY_GAP && values[after] == null) after += 1;

  const low = values[before] ?? null;
  const high = values[after] ?? null;
  if (low === null || high === null) return low ?? high;
  if (before === after) return low;
  return low + (high - low) * ((position - before) / (after - before));
}

function nearestAt(values, position) {
  return values[Math.round(position)] ?? null;
}

/** Hourly precipitation and its probability describe the hour ending at the slot. */
function currentHourAt(values, position) {
  return values[Math.ceil(position)] ?? null;
}

function pick(data, key, position, readHourly = interpolatedAt) {
  const current = data?.current?.[key];
  if (current !== null && current !== undefined) return current;
  // ECMWF, AIFS and every ensemble endpoint have no `current` block at all.
  const values = data?.hourly?.[key];
  if (position === null || !Array.isArray(values)) return null;
  return readHourly(values, position);
}

function firstDaily(data, key) {
  const values = data?.daily?.[key];
  if (!Array.isArray(values) || !values.length) return null;
  return values[0] ?? null;
}

function pressureMslValue(data, position) {
  const value = pick(data, 'pressure_msl', position);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 870 && number <= 1085 ? number : null;
}

/** `current` sums rain over its own interval (usually 15 min), hourly slots over one hour. */
function precipitationIntervalMinutes(data) {
  if (data?.current?.precipitation == null) return 60;
  return (Number(data.current.interval) || 3600) / 60;
}

export function normalizeOpenMeteo(data, now = Date.now()) {
  const position = hourlyPosition(data, now);

  return {
    temperature: pick(data, 'temperature_2m', position),
    apparentTemperature: pick(data, 'apparent_temperature', position),
    dewPoint: pick(data, 'dew_point_2m', position),
    precipitation: pick(data, 'precipitation', position, currentHourAt),
    precipitationIntervalMinutes: precipitationIntervalMinutes(data),
    precipitationProbability: pick(data, 'precipitation_probability', position, currentHourAt),
    windSpeed: pick(data, 'wind_speed_10m', position) ?? pick(data, 'windspeed_10m', position),
    windDirection: pick(data, 'wind_direction_10m', position, nearestAt) ?? pick(data, 'winddirection_10m', position, nearestAt),
    windGust: pick(data, 'wind_gusts_10m', position) ?? pick(data, 'windgusts_10m', position),
    humidity: pick(data, 'relative_humidity_2m', position),
    pressure: pressureMslValue(data, position),
    cloudCover: pick(data, 'cloud_cover', position),
    visibility: pick(data, 'visibility', position),
    uvIndex: pick(data, 'uv_index', position),
    weatherCode: pick(data, 'weather_code', position, nearestAt) ?? pick(data, 'weathercode', position, nearestAt),
    temperatureSpread: pick(data, 'temperature_2m_spread', position),
    sunrise: toLocalDayMinutes(firstDaily(data, 'sunrise')),
    sunset: toLocalDayMinutes(firstDaily(data, 'sunset')),
    raw: data,
  };
}
