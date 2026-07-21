import { calculateDewPoint, iconNameToWeatherCode } from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** BMKG weather code → WMO (subset used by WeatherMaster). */
export function bmkgWeatherToWeatherCode(code) {
  const id = Number(code);
  if (!Number.isFinite(id)) return null;
  if (id === 0 || id === 1) return 0;
  if (id === 2) return 2;
  if (id === 3 || id === 4) return 3;
  if (id === 10 || id === 45) return 45;
  if (id === 60 || id === 61) return 61;
  if (id === 63) return 63;
  if (id === 65) return 65;
  if (id === 17 || id === 95 || id === 96 || id === 99) return 95;
  return null;
}

export function normalizeBmkg(data) {
  const cuaca = data?.current?.data?.cuaca || data?.current?.cuaca || {};
  const temperature = numberValue(cuaca.t);
  const humidity = numberValue(cuaca.hu);
  const phrase = cuaca.weather_desc_en || cuaca.weather_desc || null;

  return {
    id: 'bmkg',
    temperature,
    apparentTemperature: null,
    precipitation: null,
    precipitationProbability: null,
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: numberValue(cuaca.ws) == null ? null : numberValue(cuaca.ws) * 3.6,
    windDirection: numberValue(cuaca.wd_deg),
    windGust: null,
    humidity,
    pressure: null,
    cloudCover: numberValue(cuaca.tcc),
    visibility: numberValue(cuaca.vs),
    uvIndex: null,
    weatherCode:
      bmkgWeatherToWeatherCode(cuaca.weather) ?? iconNameToWeatherCode(phrase),
    iconName: phrase,
    symbolCode: cuaca.weather ?? null,
    raw: data,
  };
}
