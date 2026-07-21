import { fractionToPercent, iconNameToWeatherCode, kilometersToMeters, metersPerSecondToKmh } from '../../utils/weatherMath.ts';

export function normalizePirateWeather(data) {
  const current = data?.currently || {};

  return {
    temperature: current.temperature ?? null,
    apparentTemperature: current.apparentTemperature ?? null,
    precipitation: current.precipIntensity ?? null,
    dewPoint: current.dewPoint ?? null,
    windSpeed: metersPerSecondToKmh(current.windSpeed),
    windDirection: current.windBearing ?? null,
    windGust: metersPerSecondToKmh(current.windGust),
    humidity: fractionToPercent(current.humidity),
    pressure: current.pressure ?? null,
    cloudCover: fractionToPercent(current.cloudCover),
    visibility: kilometersToMeters(current.visibility),
    uvIndex: current.uvIndex ?? null,
    weatherCode: iconNameToWeatherCode(current.icon ?? current.summary),
    iconName: current.icon ?? current.summary ?? null,
    raw: data
  };
}
