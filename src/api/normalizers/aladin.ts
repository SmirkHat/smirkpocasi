import { fractionToPercent, iconNameToWeatherCode, metersPerSecondToKmh, parsePragueTime } from '../../utils/weatherMath.ts';

const HOUR_MS = 60 * 60 * 1000;

/** Fractional index of `now`: the series starts at the model run, often hours in the past. */
function forecastPosition(data, now) {
  const start = parsePragueTime(data?.forecastTimeIso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, (now - start) / HOUR_MS);
}

function valueAt(values, position) {
  if (!Array.isArray(values) || !values.length) return null;
  const before = Math.min(Math.floor(position), values.length - 1);
  const after = Math.min(Math.ceil(position), values.length - 1);
  const low = values[before] ?? null;
  const high = values[after] ?? null;
  if (low === null || high === null) return low ?? high;
  return low + (high - low) * (position - before);
}

function nearestAt(values, position) {
  if (!Array.isArray(values) || !values.length) return null;
  return values[Math.min(Math.round(position), values.length - 1)] ?? null;
}

function firstAvailable(values, keys, position) {
  for (const key of keys) {
    const value = valueAt(values[key], position);
    if (value !== null) return value;
  }
  return null;
}

export function normalizeAladin(data, now = Date.now()) {
  const values = data?.parameterValues || {};
  const position = forecastPosition(data, now);
  const iconName = nearestAt(data?.weatherIconNames, position);
  const pressure = valueAt(values.PRESSURE, position);

  return {
    id: 'aladin',
    temperature: valueAt(values.TEMPERATURE, position),
    apparentTemperature: valueAt(values.APPARENT_TEMPERATURE, position),
    precipitation: nearestAt(values.PRECIPITATION_TOTAL, position),
    dewPoint: firstAvailable(values, ['DEW_POINT', 'DEWPOINT', 'DEW_POINT_TEMPERATURE'], position),
    windSpeed: metersPerSecondToKmh(valueAt(values.WIND_SPEED, position)),
    windDirection: nearestAt(values.WIND_DIRECTION, position),
    windGust: metersPerSecondToKmh(
      firstAvailable(values, ['WIND_GUST_SPEED', 'WIND_GUST', 'WIND_GUSTS', 'WIND_SPEED_GUST'], position),
    ),
    humidity: fractionToPercent(valueAt(values.HUMIDITY, position)),
    pressure: pressure !== null ? pressure / 100 : null,
    cloudCover: fractionToPercent(firstAvailable(values, ['CLOUD_COVER', 'CLOUDS_TOTAL', 'CLOUDINESS'], position)),
    visibility: firstAvailable(values, ['VISIBILITY'], position),
    uvIndex: firstAvailable(values, ['UV_INDEX', 'UV'], position),
    weatherCode: iconNameToWeatherCode(iconName),
    iconName: iconName || null,
    raw: data
  };
}
