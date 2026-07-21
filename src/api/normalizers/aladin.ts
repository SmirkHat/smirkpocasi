import { iconNameToWeatherCode } from '../../utils/weatherMath.ts';

function firstValue(values) {
  return Array.isArray(values) && values.length ? values[0] : null;
}

function valueAtNow(values, nowIdx) {
  if (!Array.isArray(values)) return null;
  return values[nowIdx] ?? values[0] ?? null;
}

function firstAvailable(values, keys) {
  for (const key of keys) {
    const value = firstValue(values[key]);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function normalizeHumidity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 0 && number <= 1 ? number * 100 : number;
}

export function normalizeAladin(data) {
  const values = data?.parameterValues || {};
  const nowIdx = data?.nowCasting?.nowIdx ?? 0;

  return {
    id: 'aladin',
    temperature: firstValue(values.TEMPERATURE),
    apparentTemperature: firstValue(values.APPARENT_TEMPERATURE),
    precipitation: valueAtNow(values.PRECIPITATION_TOTAL, nowIdx),
    dewPoint: firstAvailable(values, ['DEW_POINT', 'DEWPOINT', 'DEW_POINT_TEMPERATURE']),
    windSpeed: firstValue(values.WIND_SPEED),
    windDirection: firstValue(values.WIND_DIRECTION),
    windGust: firstAvailable(values, ['WIND_GUST', 'WIND_GUSTS', 'WIND_SPEED_GUST']),
    humidity: normalizeHumidity(firstValue(values.HUMIDITY)),
    pressure: firstValue(values.PRESSURE) !== null ? firstValue(values.PRESSURE) / 100 : null,
    cloudCover: firstAvailable(values, ['CLOUD_COVER', 'CLOUDS_TOTAL', 'CLOUDINESS']),
    visibility: firstAvailable(values, ['VISIBILITY']),
    uvIndex: firstAvailable(values, ['UV_INDEX', 'UV']),
    weatherCode: iconNameToWeatherCode(data?.weatherIconNames?.[0]),
    iconName: data?.weatherIconNames?.[0] || null,
    raw: data
  };
}
