import { calculateDewPoint } from '../../utils/weatherMath.ts';

export function normalizeCHMI(data) {
  const current = data?.current || {};
  const temperature = current.temperature ?? null;
  const humidity = current.humidity ?? null;
  
  return {
    temperature,
    apparentTemperature: null, // CHMI doesn't provide apparent temp in this 10m feed
    precipitation: current.precipitation,
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: current.windSpeed,
    windDirection: current.windDirection,
    windGust: current.windGust,
    humidity: current.humidity,
    pressure: current.pressure,
    cloudCover: null,
    visibility: null,
    uvIndex: null,
    weatherCode: null, // No weather codes in raw station measurements
    raw: data
  };
}
