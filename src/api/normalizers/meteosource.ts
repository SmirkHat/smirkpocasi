import {
  calculateDewPoint,
  iconNameToWeatherCode,
  kilometersToMeters,
  metersPerSecondToKmh,
} from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Meteosource icon_num → WMO.
 * https://www.meteosource.com/documentation (description of variables)
 */
export function meteosourceIconToWeatherCode(icon) {
  const id = Number(icon);
  if (!Number.isFinite(id)) return null;
  if ([2, 26].includes(id)) return 0;
  if ([3, 27].includes(id)) return 1;
  if ([4, 5, 28, 29].includes(id)) return 2;
  if ([6, 7, 8, 30, 31].includes(id)) return 3;
  if (id === 9) return 45;
  if ([10, 12].includes(id)) return 61;
  if ([11, 13, 32].includes(id)) return 63;
  if ([14, 15, 33].includes(id)) return 95;
  if ([16, 18].includes(id)) return 71;
  if ([17, 19, 34].includes(id)) return 73;
  if ([20, 21, 22, 35].includes(id)) return 68;
  if ([23, 24, 36].includes(id)) return 66;
  if (id === 25) return 96;
  return null;
}

export function normalizeMeteosource(data) {
  const current = data?.current || {};
  const temperature = numberValue(current.temperature);
  const humidity = numberValue(current.humidity);
  const windMps = numberValue(current.wind?.speed);
  const precip = numberValue(current.precipitation?.total);
  const visibilityKm = numberValue(current.visibility);
  const phrase = current.summary || current.icon || null;

  return {
    id: 'meteosource',
    temperature,
    apparentTemperature: numberValue(current.feels_like ?? current.wind_chill),
    precipitation: precip,
    precipitationProbability: numberValue(current.probability?.precipitation),
    dewPoint: numberValue(current.dew_point) ?? calculateDewPoint(temperature, humidity),
    windSpeed: metersPerSecondToKmh(windMps),
    windDirection: numberValue(current.wind?.angle),
    windGust: metersPerSecondToKmh(current.wind?.gusts),
    humidity,
    pressure: numberValue(current.pressure),
    cloudCover: numberValue(
      typeof current.cloud_cover === 'object'
        ? current.cloud_cover?.total
        : current.cloud_cover
    ),
    visibility: kilometersToMeters(visibilityKm),
    uvIndex: numberValue(current.uv_index),
    weatherCode:
      meteosourceIconToWeatherCode(current.icon_num ?? current.icon) ??
      iconNameToWeatherCode(phrase),
    iconName: phrase,
    symbolCode: current.icon_num ?? current.icon ?? null,
    raw: data,
  };
}
