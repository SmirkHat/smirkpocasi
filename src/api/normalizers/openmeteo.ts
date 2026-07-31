import { toLocalDayMinutes } from '../../utils/weatherMath.ts';

function hourlyValue(data, key, index = 0) {
  const values = data?.hourly?.[key];
  if (!Array.isArray(values) || index < 0 || index >= values.length) return null;
  return values[index] ?? null;
}

function firstHourly(data, key) {
  const values = data?.hourly?.[key];
  if (!Array.isArray(values)) return null;
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function pressureMslValue(data) {
  const value =
    data?.current?.pressure_msl ?? hourlyValue(data, 'pressure_msl') ?? firstHourly(data, 'pressure_msl');
  const number = Number(value);
  return Number.isFinite(number) && number >= 870 && number <= 1085 ? number : null;
}

function firstDaily(data, key) {
  const values = data?.daily?.[key];
  if (!Array.isArray(values) || !values.length) return null;
  return values[0] ?? null;
}

function pick(data, key) {
  const current = data?.current?.[key];
  if (current !== null && current !== undefined) return current;
  // AIFS / GraphCast often omit `current` — use the first hourly slot.
  return hourlyValue(data, key) ?? firstHourly(data, key);
}

export function normalizeOpenMeteo(data) {
  return {
    temperature: pick(data, 'temperature_2m'),
    apparentTemperature: pick(data, 'apparent_temperature'),
    dewPoint: pick(data, 'dew_point_2m'),
    precipitation: pick(data, 'precipitation'),
    precipitationProbability:
      pick(data, 'precipitation_probability') ?? firstDaily(data, 'precipitation_probability_max'),
    windSpeed: pick(data, 'wind_speed_10m') ?? pick(data, 'windspeed_10m'),
    windDirection: pick(data, 'wind_direction_10m') ?? pick(data, 'winddirection_10m'),
    windGust: pick(data, 'wind_gusts_10m') ?? pick(data, 'windgusts_10m'),
    humidity: pick(data, 'relative_humidity_2m'),
    pressure: pressureMslValue(data),
    cloudCover: pick(data, 'cloud_cover'),
    visibility: pick(data, 'visibility'),
    uvIndex: pick(data, 'uv_index') ?? firstDaily(data, 'uv_index_max'),
    weatherCode: pick(data, 'weather_code') ?? pick(data, 'weathercode'),
    temperatureSpread: pick(data, 'temperature_2m_spread'),
    sunrise: toLocalDayMinutes(firstDaily(data, 'sunrise')),
    sunset: toLocalDayMinutes(firstDaily(data, 'sunset')),
    raw: data,
  };
}
