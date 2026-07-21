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
 * Weatherbit weather.code → WMO (codes align closely with OpenWeather-style codes).
 * https://www.weatherbit.io/api/codes
 */
export function weatherbitCodeToWmo(code) {
  const id = Number(code);
  if (!Number.isFinite(id)) return null;
  if (id === 800) return 0;
  if (id === 801) return 1;
  if (id === 802) return 2;
  if (id === 803 || id === 804) return 3;
  if (id === 741 || id === 751 || id === 761 || id === 771) return 45;
  if (id >= 200 && id < 300) return 95;
  if (id >= 300 && id < 400) return 51;
  if (id === 500 || id === 520) return 61;
  if (id === 501 || id === 521) return 63;
  if (id >= 502 && id < 600) return 65;
  if (id === 600 || id === 620) return 71;
  if (id === 601 || id === 621) return 73;
  if (id >= 602 && id < 700) return 75;
  return null;
}

export function normalizeWeatherbit(data) {
  const current = data?.current || {};
  const temperature = numberValue(current.temp);
  const humidity = numberValue(current.rh);
  const phrase = current.weather?.description || current.weather?.code || null;

  return {
    id: 'weatherbit',
    temperature,
    apparentTemperature: numberValue(current.app_temp),
    precipitation: numberValue(current.precip),
    precipitationProbability: numberValue(current.pop),
    dewPoint: numberValue(current.dewpt) ?? calculateDewPoint(temperature, humidity),
    windSpeed: metersPerSecondToKmh(current.wind_spd),
    windDirection: numberValue(current.wind_dir),
    windGust: metersPerSecondToKmh(current.gust ?? current.wind_gust_spd),
    humidity,
    pressure: numberValue(current.slp ?? current.pres),
    cloudCover: numberValue(current.clouds),
    visibility: kilometersToMeters(current.vis),
    uvIndex: numberValue(current.uv),
    weatherCode:
      weatherbitCodeToWmo(current.weather?.code) ?? iconNameToWeatherCode(phrase),
    iconName: phrase,
    symbolCode: current.weather?.code ?? current.weather?.icon ?? null,
    raw: data,
  };
}
