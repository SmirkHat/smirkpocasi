import {
  iconNameToWeatherCode,
  kilometersToMeters,
  weatherComIconCodeToWeatherCode,
} from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Normalize weather.com (The Weather Channel) unofficial web API payload.
 * Expects { current, hourly } from our /api/weathercom proxy (units=m).
 */
export function normalizeWeatherCom(data) {
  const current = data?.current || data || {};
  const phrase = current.wxPhraseLong || current.wxPhraseMedium || current.cloudCoverPhrase || null;

  return {
    id: 'weathercom',
    temperature: numberValue(current.temperature),
    apparentTemperature: numberValue(current.temperatureFeelsLike),
    precipitation: numberValue(current.precip1Hour),
    dewPoint: numberValue(current.temperatureDewPoint),
    windSpeed: numberValue(current.windSpeed),
    windDirection: numberValue(current.windDirection),
    windGust: numberValue(current.windGust),
    humidity: numberValue(current.relativeHumidity),
    pressure: numberValue(current.pressureMeanSeaLevel),
    cloudCover: numberValue(current.cloudCover),
    visibility: kilometersToMeters(current.visibility),
    uvIndex: numberValue(current.uvIndex),
    weatherCode:
      weatherComIconCodeToWeatherCode(current.iconCode) ?? iconNameToWeatherCode(phrase),
    iconName: phrase,
    raw: data,
  };
}
