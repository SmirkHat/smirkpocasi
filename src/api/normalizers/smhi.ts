import {
  calculateDewPoint,
  kilometersToMeters,
  metersPerSecondToKmh,
} from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** SMHI snow1g symbol_code → WMO weather code. */
export function smhiSymbolToWeatherCode(code) {
  const id = Number(code);
  if (!Number.isFinite(id)) return null;
  if (id === 1 || id === 2) return 0;
  if (id === 4) return 1;
  if (id === 3 || id === 5) return 2;
  if (id === 6) return 3;
  if (id === 7) return 45;
  if (id === 8 || id === 18) return 61;
  if (id === 9 || id === 19) return 63;
  if (id === 10 || id === 20) return 65;
  if (id === 11 || id === 21) return 95;
  if (id === 12 || id === 15 || id === 22 || id === 25) return 71;
  if (id === 13 || id === 16 || id === 23 || id === 26) return 73;
  if (id === 14 || id === 17 || id === 24 || id === 27) return 75;
  return null;
}

function pickCurrentStep(timeSeries) {
  if (!Array.isArray(timeSeries) || !timeSeries.length) return null;
  const now = Date.now();
  let best = timeSeries[0];
  let bestDelta = Infinity;
  for (const step of timeSeries) {
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

export function normalizeSmhi(data) {
  const step = pickCurrentStep(data?.timeSeries);
  const current = step?.data || {};
  const temperature = numberValue(current.air_temperature);
  const humidity = numberValue(current.relative_humidity);
  const visibilityKm = numberValue(current.visibility_in_air);

  return {
    id: 'smhi',
    temperature,
    apparentTemperature: null,
    precipitation: numberValue(
      current.precipitation_amount_mean ?? current.precipitation_amount_max
    ),
    precipitationProbability: numberValue(current.probability_of_precipitation),
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: metersPerSecondToKmh(current.wind_speed),
    windDirection: numberValue(current.wind_from_direction),
    windGust: metersPerSecondToKmh(current.wind_speed_of_gust),
    humidity,
    pressure: numberValue(current.air_pressure_at_mean_sea_level),
    cloudCover: numberValue(current.cloud_area_fraction),
    visibility: kilometersToMeters(visibilityKm),
    uvIndex: null,
    weatherCode: smhiSymbolToWeatherCode(current.symbol_code),
    symbolCode: current.symbol_code ?? null,
    raw: data,
  };
}
