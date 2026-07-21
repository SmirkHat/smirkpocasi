function hourlyValue(data, key) {
  const values = data?.hourly?.[key];
  if (!Array.isArray(values)) return null;
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function pressureMslValue(data) {
  const value = data?.current?.pressure_msl ?? hourlyValue(data, 'pressure_msl');
  const number = Number(value);
  return Number.isFinite(number) && number >= 870 && number <= 1085 ? number : null;
}

export function normalizeOpenMeteo(data) {
  const current = data?.current || {};

  return {
    temperature: current.temperature_2m ?? hourlyValue(data, 'temperature_2m'),
    apparentTemperature: current.apparent_temperature ?? hourlyValue(data, 'apparent_temperature'),
    dewPoint: current.dew_point_2m ?? hourlyValue(data, 'dew_point_2m'),
    precipitation: current.precipitation ?? hourlyValue(data, 'precipitation'),
    precipitationProbability: hourlyValue(data, 'precipitation_probability'),
    windSpeed: current.wind_speed_10m ?? current.windspeed_10m ?? hourlyValue(data, 'wind_speed_10m'),
    windDirection: current.wind_direction_10m ?? current.winddirection_10m ?? hourlyValue(data, 'wind_direction_10m'),
    windGust: current.wind_gusts_10m ?? current.windgusts_10m ?? hourlyValue(data, 'wind_gusts_10m'),
    humidity: current.relative_humidity_2m ?? hourlyValue(data, 'relative_humidity_2m'),
    pressure: pressureMslValue(data),
    cloudCover: current.cloud_cover ?? hourlyValue(data, 'cloud_cover'),
    visibility: current.visibility ?? hourlyValue(data, 'visibility'),
    uvIndex: current.uv_index ?? hourlyValue(data, 'uv_index'),
    weatherCode: current.weather_code ?? current.weathercode ?? hourlyValue(data, 'weather_code'),
    temperatureSpread: hourlyValue(data, 'temperature_2m_spread'),
    raw: data
  };
}
