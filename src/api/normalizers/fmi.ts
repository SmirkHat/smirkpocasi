import { metersPerSecondToKmh } from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** FMI WeatherSymbol3 → WMO (rough). */
export function fmiSymbolToWeatherCode(code) {
  const id = Math.round(Number(code));
  if (!Number.isFinite(id)) return null;
  if (id === 1) return 0;
  if (id === 2) return 2;
  if (id === 3) return 3;
  if ([21, 22, 23, 31, 32, 33].includes(id)) return 63;
  if ([41, 42, 43, 51, 52, 53].includes(id)) return 73;
  if ([61, 62, 63, 64].includes(id)) return 95;
  if ([71, 72, 73, 81, 82, 83].includes(id)) return 73;
  if ([91, 92].includes(id)) return 45;
  return null;
}

function pickCurrentStep(steps) {
  if (!Array.isArray(steps) || !steps.length) return null;
  const now = Date.now();
  let best = steps[0];
  let bestDelta = Infinity;
  for (const step of steps) {
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

export function normalizeFmi(data) {
  const step = pickCurrentStep(data?.steps);
  if (!step) {
    return {
      id: 'fmi',
      temperature: null,
      apparentTemperature: null,
      precipitation: null,
      precipitationProbability: null,
      dewPoint: null,
      windSpeed: null,
      windDirection: null,
      windGust: null,
      humidity: null,
      pressure: null,
      cloudCover: null,
      visibility: null,
      uvIndex: null,
      weatherCode: null,
      raw: data,
    };
  }

  return {
    id: 'fmi',
    temperature: numberValue(step.Temperature),
    apparentTemperature: null,
    precipitation: numberValue(step.Precipitation1h),
    precipitationProbability: numberValue(step.PoP),
    dewPoint: numberValue(step.DewPoint),
    windSpeed: metersPerSecondToKmh(step.WindSpeedMS),
    windDirection: numberValue(step.WindDirection),
    windGust: metersPerSecondToKmh(step.HourlyMaximumGust),
    humidity: numberValue(step.Humidity),
    pressure: numberValue(step.Pressure),
    cloudCover: numberValue(step.TotalCloudCover),
    visibility: null,
    uvIndex: null,
    weatherCode: fmiSymbolToWeatherCode(step.WeatherSymbol3),
    symbolCode: step.WeatherSymbol3 ?? null,
    raw: data,
  };
}
