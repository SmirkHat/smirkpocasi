import {
  iconNameToWeatherCode,
  kilometersToMeters,
  toLocalDayMinutes,
  weatherApiCodeToWeatherCode,
} from '../../utils/weatherMath.ts';

function pickNearestHour(hours) {
  if (!Array.isArray(hours) || !hours.length) return null;
  const now = Date.now();
  let best = hours[0];
  let bestDelta = Infinity;
  for (const hour of hours) {
    const t = Date.parse(hour?.time);
    if (Number.isNaN(t)) continue;
    const delta = Math.abs(t - now);
    if (delta < bestDelta) {
      best = hour;
      bestDelta = delta;
    }
  }
  return best;
}

export function normalizeWeatherApi(data) {
  const current = data?.current || {};
  const day0 = data?.forecast?.forecastday?.[0] || null;
  const hour = pickNearestHour(day0?.hour);
  const astro = day0?.astro || {};
  const chance =
    Number(hour?.chance_of_rain ?? hour?.chance_of_snow ?? day0?.day?.daily_chance_of_rain ?? day0?.day?.daily_chance_of_snow);

  return {
    temperature: current.temp_c ?? null,
    apparentTemperature: current.feelslike_c ?? null,
    precipitation: current.precip_mm ?? null,
    precipitationProbability: Number.isFinite(chance) ? chance : null,
    dewPoint: current.dewpoint_c ?? null,
    windSpeed: current.wind_kph ?? null,
    windDirection: current.wind_degree ?? null,
    windGust: current.gust_kph ?? null,
    humidity: current.humidity ?? null,
    pressure: current.pressure_mb ?? null,
    cloudCover: current.cloud ?? null,
    visibility: kilometersToMeters(current.vis_km),
    uvIndex: current.uv ?? hour?.uv ?? day0?.day?.uv ?? null,
    weatherCode:
      weatherApiCodeToWeatherCode(current.condition?.code) ??
      iconNameToWeatherCode(current.condition?.text),
    iconName: current.condition?.text ?? null,
    sunrise: toLocalDayMinutes(astro.sunrise),
    sunset: toLocalDayMinutes(astro.sunset),
    raw: data,
  };
}
