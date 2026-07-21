import { iconNameToWeatherCode } from '../../utils/weatherMath.ts';

export function normalizeVisualCrossing(data) {
  const current = data?.currentConditions || {};

  return {
    temperature: current.temp ?? null,
    apparentTemperature: current.feelslike ?? null,
    precipitation: current.precip ?? null,
    dewPoint: current.dew ?? null,
    windSpeed: current.windspeed ?? null,
    windDirection: current.winddir ?? null,
    windGust: current.windgust ?? null,
    humidity: current.humidity ?? null,
    pressure: current.pressure ?? null,
    cloudCover: current.cloudcover ?? null,
    visibility: current.visibility !== undefined ? current.visibility * 1000 : null,
    uvIndex: current.uvindex ?? null,
    weatherCode: iconNameToWeatherCode(current.icon ?? current.conditions),
    iconName: current.conditions ?? current.icon ?? null,
    raw: data
  };
}
