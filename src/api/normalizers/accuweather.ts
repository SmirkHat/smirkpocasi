import { kilometersToMeters } from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricValue(obj) {
  if (obj == null) return null;
  if (typeof obj === 'number') return obj;
  return numberValue(obj.Metric?.Value ?? obj.Value);
}

/** AccuWeather WeatherIcon → WMO. */
export function accuIconToWeatherCode(id) {
  const code = Number(id);
  if (!Number.isFinite(code)) return null;
  if (code === 1 || code === 33) return 0;
  if (code === 2 || code === 34) return 1;
  if ([3, 4, 35, 36].includes(code)) return 2;
  if ([5, 11, 37].includes(code)) return 45;
  if ([6, 7, 8, 38].includes(code)) return 3;
  if ([12, 18].includes(code)) return 63;
  if ([13, 14, 39, 40].includes(code)) return 61;
  if ([15, 16, 17, 41, 42].includes(code)) return 95;
  if ([19, 20, 21, 23, 43, 44].includes(code)) return 71;
  if ([22, 24, 25, 26, 29].includes(code)) return 73;
  return null;
}

function currentPrecipitationMm(current) {
  const pastHour = metricValue(current?.PrecipitationSummary?.PastHour);
  if (pastHour != null) return pastHour;
  const summary = metricValue(current?.PrecipitationSummary?.Precipitation);
  if (summary != null) return summary;
  if (current?.HasPrecipitation) return 0.1;
  return 0;
}

function nextHourPrecipitationProbability(hourly) {
  if (!Array.isArray(hourly) || !hourly.length) return null;
  const now = Date.now();
  const upcoming = hourly.find((hour) => {
    const epoch = numberValue(hour.EpochDateTime);
    return epoch == null || epoch * 1000 >= now - 30 * 60 * 1000;
  });
  const row = upcoming || hourly[0];
  return numberValue(row?.PrecipitationProbability);
}

export function normalizeAccuweather(data) {
  const current = data?.current || {};
  const hourly = data?.hourly || [];
  const temperature = metricValue(current.Temperature);
  const visibilityKm = metricValue(current.Visibility);
  const precipitationProbability = nextHourPrecipitationProbability(hourly);

  return {
    id: 'accuweather',
    temperature,
    apparentTemperature: metricValue(current.RealFeelTemperature),
    precipitation: currentPrecipitationMm(current),
    precipitationProbability,
    dewPoint: metricValue(current.DewPoint),
    windSpeed: metricValue(current.Wind?.Speed),
    windDirection: numberValue(current.Wind?.Direction?.Degrees),
    windGust: metricValue(current.WindGust?.Speed),
    humidity: numberValue(current.RelativeHumidity),
    pressure: metricValue(current.Pressure),
    cloudCover: numberValue(current.CloudCover),
    visibility: kilometersToMeters(visibilityKm),
    uvIndex: numberValue(current.UVIndexFloat ?? current.UVIndex),
    weatherCode: accuIconToWeatherCode(current.WeatherIcon),
    iconName: current.WeatherText || data?.locationName || null,
    symbolCode: current.WeatherIcon ?? null,
    raw: data,
  };
}
