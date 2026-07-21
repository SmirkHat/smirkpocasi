import {
  iconNameToWeatherCode,
  kilometersToMeters,
} from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Prefer first non-empty period from conditions or forecast. */
function pickPeriod(data) {
  const fromConditions = data?.conditions?.periods?.[0];
  if (fromConditions) return fromConditions;
  const periods = data?.forecast?.periods;
  if (!Array.isArray(periods) || !periods.length) return null;
  const now = Date.now();
  let best = periods[0];
  let bestDelta = Infinity;
  for (const period of periods) {
    const t = Date.parse(period?.dateTimeISO) || (period?.timestamp || 0) * 1000;
    if (!t) continue;
    const delta = Math.abs(t - now);
    if (delta < bestDelta) {
      best = period;
      bestDelta = delta;
    }
  }
  return best;
}

export function normalizeXweather(data) {
  const period = pickPeriod(data) || {};
  const phrase = period.weatherPrimary || period.weather || null;

  return {
    id: 'xweather',
    temperature: numberValue(period.tempC ?? period.avgTempC),
    apparentTemperature: numberValue(period.feelslikeC ?? period.avgFeelslikeC),
    precipitation: numberValue(period.precipMM),
    precipitationProbability: numberValue(period.pop),
    dewPoint: numberValue(period.dewpointC),
    windSpeed: numberValue(period.windSpeedKPH),
    windDirection: numberValue(period.windDirDEG),
    windGust: numberValue(period.windGustKPH),
    humidity: numberValue(period.humidity),
    pressure: numberValue(period.pressureMB),
    cloudCover: numberValue(period.sky),
    visibility: kilometersToMeters(period.visibilityKM),
    uvIndex: numberValue(period.uvi),
    weatherCode: iconNameToWeatherCode(phrase),
    iconName: phrase,
    symbolCode: period.weatherPrimaryCoded || period.icon || null,
    raw: data,
  };
}
