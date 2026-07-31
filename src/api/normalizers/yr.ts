import { calculateDewPoint, metersPerSecondToKmh, symbolCodeToWeatherCode } from '../../utils/weatherMath.ts';

function firstAvailable(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
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
