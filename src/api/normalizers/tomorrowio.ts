import { kilometersToMeters, metersPerSecondToKmh } from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Tomorrow.io weatherCode → WMO.
 * https://docs.tomorrow.io/reference/data-layers-core
 */
export function tomorrowWeatherCodeToWmo(code) {
  const id = Number(code);
  if (!Number.isFinite(id)) return null;
  const map = {
    1000: 0,
    1100: 1,
    1101: 2,
    1102: 2,
    1001: 3,
    2000: 45,
    2100: 45,
    4000: 51,
    4001: 63,
    4200: 61,
    4201: 65,
    5000: 73,
    5001: 71,
    5100: 71,
    5101: 75,
    6000: 56,
    6001: 66,
    6200: 66,
    6201: 67,
    7000: 77,
    7101: 77,
    7102: 77,
    8000: 95,
  };
  return map[id] ?? null;
}

function precipMmFromValues(values) {
  if (!values) return null;
  const rain = numberValue(values.rainIntensity);
  const snow = numberValue(values.snowIntensity);
  const sleet = numberValue(values.sleetIntensity);
  const freezing = numberValue(values.freezingRainIntensity);
  const parts = [rain, snow, sleet, freezing].filter((v) => v != null);
  if (!parts.length) return numberValue(values.precipitationIntensity);
  return parts.reduce((sum, v) => sum + v, 0);
}

function pickCurrentHour(hourly) {
  if (!Array.isArray(hourly) || !hourly.length) return null;
  const now = Date.now();
  let best = hourly[0];
  let bestDelta = Infinity;
  for (const step of hourly) {
    const t = Date.parse(step?.time);
    if (Number.isNaN(t)) continue;
    const delta = Math.abs(t - now);
    if (delta < bestDelta) {
      best = step;
      bestDelta = delta;
    }
  }
  return best;
}

export function normalizeTomorrowio(data) {
  const hourly = data?.timelines?.hourly;
  const step = pickCurrentHour(hourly);
  const values = step?.values || {};
  const visibilityKm = numberValue(values.visibility);

  return {
    id: 'tomorrowio',
    temperature: numberValue(values.temperature),
    apparentTemperature: numberValue(values.temperatureApparent),
    precipitation: precipMmFromValues(values),
    precipitationProbability: numberValue(values.precipitationProbability),
    dewPoint: numberValue(values.dewPoint),
    windSpeed: metersPerSecondToKmh(values.windSpeed),
    windDirection: numberValue(values.windDirection),
    windGust: metersPerSecondToKmh(values.windGust),
    humidity: numberValue(values.humidity),
    pressure: numberValue(values.pressureSeaLevel ?? values.pressureSurfaceLevel),
    cloudCover: numberValue(values.cloudCover),
    visibility: kilometersToMeters(visibilityKm),
    uvIndex: numberValue(values.uvIndex),
    weatherCode: tomorrowWeatherCodeToWmo(values.weatherCode),
    symbolCode: values.weatherCode ?? null,
    raw: data,
  };
}
