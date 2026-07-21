import { calculateDewPoint } from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Meteo AM icon id → WMO. */
export function meteoamIconToWeatherCode(id) {
  const code = String(id || '').padStart(2, '0');
  if (code === '01' || code === '31') return 0;
  if (['02', '03', '04', '32', '33', '34'].includes(code)) return 2;
  if (['05', '06', '07', '35'].includes(code)) return 3;
  if (code === '08') return 61;
  if (code === '09') return 63;
  if (code === '10') return 95;
  if (['11', '12', '16'].includes(code)) return 71;
  if (['13', '14', '18', '36'].includes(code)) return 45;
  return null;
}

function firstMapValue(map) {
  if (!map || typeof map !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(map, '0')) return map['0'];
  const keys = Object.keys(map);
  return keys.length ? map[keys[0]] : null;
}

/** Nearest station is datasets["0"]; latest observation is index "0". */
function readStationLatest(currentPayload) {
  const station = currentPayload?.datasets?.['0'];
  if (!station) return {};
  return {
    temperature: numberValue(firstMapValue(station['0'])),
    humidity: numberValue(firstMapValue(station['1'])),
    pressure: numberValue(firstMapValue(station['2'])),
    windDirection: numberValue(firstMapValue(station['3'])),
    windSpeed: numberValue(firstMapValue(station['6'])),
    icon: firstMapValue(station['8']),
    time: currentPayload?.timeseries?.[0]?.[0] || null,
    stationName: currentPayload?.extrainfo?.station_name?.[0] || null,
  };
}

export function normalizeMeteoam(data) {
  const current = readStationLatest(data?.current);
  const temperature = current.temperature;
  const humidity = current.humidity;

  return {
    id: 'meteoam',
    temperature,
    apparentTemperature: null,
    precipitation: null,
    precipitationProbability: null,
    dewPoint: calculateDewPoint(temperature, humidity),
    windSpeed: current.windSpeed,
    windDirection: current.windDirection,
    windGust: null,
    humidity,
    pressure: current.pressure,
    cloudCover: null,
    visibility: null,
    uvIndex: null,
    weatherCode: meteoamIconToWeatherCode(current.icon),
    iconName: current.stationName,
    symbolCode: current.icon != null ? String(current.icon) : null,
    raw: data,
  };
}
