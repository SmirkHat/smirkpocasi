import { calculateDewPoint } from '../../utils/weatherMath.ts';

export function normalizeInpocasiStation(data) {
  const current = data?.current || {};
  const temperature = current.temperature ?? null;
  const humidity = current.humidity ?? null;

  return {
    temperature,
    apparentTemperature: null,
    precipitation: current.precipitation ?? null,
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: current.windSpeedKmh ?? null,
    windDirection: current.windDirection ?? null,
    windGust: current.windGustKmh ?? null,
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
