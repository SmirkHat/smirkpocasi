import { iconNameToWeatherCode, kilometersToMeters, weatherApiCodeToWeatherCode } from '../../utils/weatherMath.ts';

export function normalizeWeatherApi(data) {
  const current = data?.current || {};

  return {
    temperature: current.temp_c ?? null,
    apparentTemperature: current.feelslike_c ?? null,
    precipitation: current.precip_mm ?? null,
    dewPoint: current.dewpoint_c ?? null,
    windSpeed: current.wind_kph ?? null,
    windDirection: current.wind_degree ?? null,
    windGust: current.gust_kph ?? null,
    humidity: current.humidity ?? null,
    pressure: current.pressure_mb ?? null,
    cloudCover: current.cloud ?? null,
    visibility: kilometersToMeters(current.vis_km),
    uvIndex: current.uv ?? null,
    weatherCode: weatherApiCodeToWeatherCode(current.condition?.code) ?? iconNameToWeatherCode(current.condition?.text),
    iconName: current.condition?.text ?? null,
    raw: data
  };
}
