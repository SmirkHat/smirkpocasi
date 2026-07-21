import {
  calculateDewPoint,
  metersPerSecondToKmh,
  openWeatherMapCodeToWeatherCode,
} from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function precipMm(obj) {
  if (!obj) return null;
  const rain = numberValue(obj.rain?.['1h'] ?? obj.rain?.['3h']);
  const snow = numberValue(obj.snow?.['1h'] ?? obj.snow?.['3h']);
  if (rain == null && snow == null) return null;
  return (rain || 0) + (snow || 0);
}

/**
 * Accepts either legacy current-only payload or the new bundle
 * `{ current, forecast, pollution, onecall }`.
 */
export function normalizeOpenWeatherMap(data) {
  const isBundle = Boolean(data?.current || data?.forecast || data?.onecall || data?.pollution);
  const current = isBundle ? data.current || {} : data || {};
  const onecallCurrent = data?.onecall?.current;
  const temperature = numberValue(current.main?.temp) ?? numberValue(onecallCurrent?.temp);
  const humidity = numberValue(current.main?.humidity) ?? numberValue(onecallCurrent?.humidity);
  const weather = current.weather?.[0] || onecallCurrent?.weather?.[0];

  return {
    id: 'openweathermap',
    temperature,
    apparentTemperature:
      numberValue(current.main?.feels_like) ?? numberValue(onecallCurrent?.feels_like),
    precipitation: precipMm(current) ?? precipMm(onecallCurrent) ?? 0,
    dewPoint:
      numberValue(onecallCurrent?.dew_point) ?? calculateDewPoint(temperature, humidity),
    windSpeed:
      metersPerSecondToKmh(current.wind?.speed) ?? metersPerSecondToKmh(onecallCurrent?.wind_speed),
    windDirection: numberValue(current.wind?.deg) ?? numberValue(onecallCurrent?.wind_deg),
    windGust:
      metersPerSecondToKmh(current.wind?.gust) ?? metersPerSecondToKmh(onecallCurrent?.wind_gust),
    humidity,
    pressure: numberValue(current.main?.pressure) ?? numberValue(onecallCurrent?.pressure),
    cloudCover: numberValue(current.clouds?.all) ?? numberValue(onecallCurrent?.clouds),
    visibility: numberValue(current.visibility) ?? numberValue(onecallCurrent?.visibility),
    uvIndex: numberValue(onecallCurrent?.uvi),
    weatherCode: openWeatherMapCodeToWeatherCode(weather?.id),
    iconName: weather?.description || weather?.main || null,
    raw: isBundle ? data : { current: data, forecast: null, pollution: null, onecall: null },
  };
}

/** Normalize OWM Air Pollution API payload → pollutant fields (μg/m³). */
export function normalizeOpenWeatherMapPollution(pollution) {
  const sample = pollution?.list?.[0];
  if (!sample) return null;
  const c = sample.components || {};
  return {
    aqi: numberValue(sample.main?.aqi), // 1–5 OWM scale — do not blend with EAQI
    pm25: numberValue(c.pm2_5),
    pm10: numberValue(c.pm10),
    no2: numberValue(c.no2),
    o3: numberValue(c.o3),
    so2: numberValue(c.so2),
    co: numberValue(c.co),
    nh3: numberValue(c.nh3),
    updatedAt: sample.dt ? new Date(sample.dt * 1000).toISOString() : null,
    scale: 'owm-1-5',
  };
}
