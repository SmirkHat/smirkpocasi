import { metersPerSecondToKmh, numberOrNull } from '../../utils/weatherMath.ts';

const ICON_WEATHER_CODES = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  10: 2,
  11: 61,
  18: 3,
  19: 80,
  26: 3,
  27: 61,
  35: 80
};

const ICON_CLOUD_COVER = {
  0: 5,
  1: 25,
  2: 55,
  3: 90,
  10: 65,
  11: 90,
  18: 90,
  19: 80,
  26: 100,
  27: 100,
  35: 75
};

function currentBlock(data) {
  return data?.current || data?.current_aprox || {};
}

function iconNumber(value) {
  const icon = numberOrNull(value);
  return icon === null ? null : Math.round(icon);
}

export function normalizePocasiCz(data) {
  const current = currentBlock(data);
  const icon = iconNumber(current.icon);
  const daily = Array.isArray(data?.daily) ? data.daily[0] : null;

  return {
    id: 'pocasicz',
    temperature: numberOrNull(current.temp),
    apparentTemperature: numberOrNull(current.feelTemp),
    precipitation: numberOrNull(current.precip),
    precipitationDaily: numberOrNull(daily?.precip),
    windSpeed: metersPerSecondToKmh(current.wind),
    windDirection: numberOrNull(current.windDir),
    windGust: metersPerSecondToKmh(current.windGust),
    humidity: null,
    pressure: numberOrNull(current.pressure),
    cloudCover: icon === null ? null : ICON_CLOUD_COVER[icon] ?? null,
    visibility: null,
    uvIndex: numberOrNull(current.uv),
    weatherCode: icon === null ? null : ICON_WEATHER_CODES[icon] ?? null,
    symbolCode: icon === null ? null : `pocasicz:${icon}`,
    raw: data
  };
}
