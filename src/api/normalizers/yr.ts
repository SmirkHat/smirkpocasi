import { calculateDewPoint, metersPerSecondToKmh } from '../../utils/weatherMath.ts';

function firstAvailable(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function symbolCodeToWeatherCode(symbolCode) {
  const symbol = String(symbolCode || '').replace(/_(day|night|polartwilight)$/u, '');
  if (!symbol) return null;

  if (symbol.includes('thunder')) return 95;
  if (symbol.includes('fog')) return 45;
  if (symbol.includes('heavyrainshowers')) return 82;
  if (symbol.includes('lightrainshowers')) return 80;
  if (symbol.includes('rainshowers')) return 81;
  if (symbol.includes('heavysnowshowers')) return 86;
  if (symbol.includes('snowshowers')) return 85;
  if (symbol.includes('heavysleet')) return 67;
  if (symbol.includes('sleet')) return 66;
  if (symbol.includes('heavyrain')) return 65;
  if (symbol.includes('lightrain')) return 61;
  if (symbol.includes('rain')) return 63;
  if (symbol.includes('heavysnow')) return 75;
  if (symbol.includes('lightsnow')) return 71;
  if (symbol.includes('snow')) return 73;
  if (symbol.includes('cloudy')) return symbol.includes('partly') ? 2 : 3;
  if (symbol.includes('fair')) return 1;
  if (symbol.includes('clearsky')) return 0;

  return null;
}

export function normalizeYr(data) {
  const current = data?.properties?.timeseries?.[0]?.data || {};
  const instant = current.instant?.details || {};
  const nextHour = current.next_1_hours || {};
  const nextSixHours = current.next_6_hours || {};
  const nextTwelveHours = current.next_12_hours || {};
  const nextHourDetails = nextHour.details || {};
  const nextSixHourDetails = nextSixHours.details || {};
  const nextTwelveHourDetails = nextTwelveHours.details || {};
  const temperature = instant.air_temperature ?? null;
  const humidity = instant.relative_humidity ?? null;
  const symbolCode = firstAvailable(
    nextHour.summary?.symbol_code,
    nextSixHours.summary?.symbol_code,
    nextTwelveHours.summary?.symbol_code
  );

  return {
    id: 'yr',
    temperature,
    apparentTemperature: null,
    precipitation: firstAvailable(
      nextHourDetails.precipitation_amount,
      nextSixHourDetails.precipitation_amount,
      nextTwelveHourDetails.precipitation_amount
    ),
    precipitationProbability: firstAvailable(
      nextHourDetails.probability_of_precipitation,
      nextSixHourDetails.probability_of_precipitation,
      nextTwelveHourDetails.probability_of_precipitation
    ),
    precipitationMin: firstAvailable(
      nextHourDetails.precipitation_amount_min,
      nextSixHourDetails.precipitation_amount_min,
      nextTwelveHourDetails.precipitation_amount_min
    ),
    precipitationMax: firstAvailable(
      nextHourDetails.precipitation_amount_max,
      nextSixHourDetails.precipitation_amount_max,
      nextTwelveHourDetails.precipitation_amount_max
    ),
    dewPoint: instant.dew_point_temperature ?? calculateDewPoint(temperature, humidity),
    windSpeed: metersPerSecondToKmh(instant.wind_speed),
    windDirection: instant.wind_from_direction ?? null,
    windGust: metersPerSecondToKmh(instant.wind_speed_of_gust),
    humidity: instant.relative_humidity ?? null,
    pressure: instant.air_pressure_at_sea_level ?? null,
    cloudCover: instant.cloud_area_fraction ?? null,
    cloudCoverLow: instant.cloud_area_fraction_low ?? null,
    cloudCoverMedium: instant.cloud_area_fraction_medium ?? null,
    cloudCoverHigh: instant.cloud_area_fraction_high ?? null,
    fogArea: instant.fog_area_fraction ?? null,
    visibility: null,
    uvIndex: instant.ultraviolet_index_clear_sky ?? null,
    weatherCode: symbolCodeToWeatherCode(symbolCode),
    symbolCode,
    raw: data
  };
}
