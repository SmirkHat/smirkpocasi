import { calculateDewPoint, metersPerSecondToKmh } from '../../utils/weatherMath.ts';

/** Shared normalizer for SHMÚ / GeoSphere / IMGW station observation payloads. */
export function normalizeNeighborStation(data) {
  const current = data?.current || {};
  const temperature = current.temperature ?? null;
  const humidity = current.humidity ?? null;

  return {
    temperature,
    apparentTemperature: null,
    precipitation: current.precipitation ?? null,
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: metersPerSecondToKmh(current.windSpeed),
    windDirection: current.windDirection ?? null,
    windGust: metersPerSecondToKmh(current.windGust),
    humidity,
    pressure: current.pressure ?? null,
    cloudCover: null,
    visibility: null,
    uvIndex: null,
    weatherCode: null,
    attribution: data?.attribution ?? null,
    stationName: data?.station?.name ?? null,
    raw: data,
  };
}
