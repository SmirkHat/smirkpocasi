import { iconNameToWeatherCode, toLocalDayMinutes, wttrCodeToWeatherCode } from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeWttr(data) {
  const current = data?.current_condition?.[0] || {};
  const astro = data?.weather?.[0]?.astronomy?.[0] || {};
  const hour0 = data?.weather?.[0]?.hourly?.[0] || {};

  return {
    temperature: numberValue(current.temp_C),
    apparentTemperature: numberValue(current.FeelsLikeC),
    precipitation: numberValue(current.precipMM),
    precipitationProbability: numberValue(hour0.chanceofrain ?? hour0.chanceOfRain),
    dewPoint: numberValue(current.DewPointC),
    windSpeed: numberValue(current.windspeedKmph),
    windDirection: numberValue(current.winddirDegree),
    windGust: numberValue(current.WindGustKmph),
    humidity: numberValue(current.humidity),
    pressure: numberValue(current.pressure),
    cloudCover: numberValue(current.cloudcover),
    visibility: numberValue(current.visibility) !== null ? numberValue(current.visibility) * 1000 : null,
    uvIndex: numberValue(current.uvIndex),
    weatherCode: wttrCodeToWeatherCode(current.weatherCode) ?? iconNameToWeatherCode(current.weatherDesc?.[0]?.value),
    iconName: current.weatherDesc?.[0]?.value ?? null,
    sunrise: toLocalDayMinutes(astro.sunrise),
    sunset: toLocalDayMinutes(astro.sunset),
    raw: data
  };
}
