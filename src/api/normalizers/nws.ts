import {
  calculateDewPoint,
  iconNameToWeatherCode,
  kilometersToMeters,
} from '../../utils/weatherMath.ts';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const COMPASS = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

export function nwsCompassToDegrees(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const key = String(value).trim().toUpperCase();
  return COMPASS[key] ?? null;
}

export function nwsWindSpeedToKmh(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value * 1.60934;
  const match = String(value).match(/([\d.]+)/);
  if (!match) return null;
  const mph = Number(match[1]);
  return Number.isFinite(mph) ? mph * 1.60934 : null;
}

export function nwsIconToWeatherCode(iconUrl) {
  if (!iconUrl) return null;
  const id = String(iconUrl).split('/').pop()?.split('?')[0]?.split(',')[0];
  const map = {
    skc: 0,
    few: 1,
    sct: 2,
    bkn: 2,
    ovc: 3,
    wind_skc: 0,
    wind_few: 1,
    wind_sct: 2,
    wind_bkn: 2,
    wind_ovc: 3,
    snow: 73,
    rain_snow: 68,
    rain_sleet: 66,
    snow_sleet: 68,
    fzra: 66,
    rain_fzra: 66,
    snow_fzra: 68,
    sleet: 66,
    rain: 63,
    rain_showers: 80,
    rain_showers_hi: 81,
    tsra: 95,
    tsra_sct: 95,
    tsra_hi: 95,
    tornado: 95,
    hurricane: 95,
    tropical_storm: 95,
    dust: 45,
    smoke: 45,
    haze: 45,
    fog: 45,
    blizzard: 75,
  };
  return map[id] ?? null;
}

function fahrenheitToCelsius(value) {
  const f = numberValue(value);
  return f == null ? null : ((f - 32) * 5) / 9;
}

function unitValue(obj) {
  if (obj == null) return null;
  if (typeof obj === 'number') return obj;
  return numberValue(obj.value ?? obj.Value);
}

export function normalizeNws(data) {
  const props = data?.observation?.properties;
  const hourly0 = data?.hourly?.properties?.periods?.[0];

  let temperature = null;
  let humidity = null;
  let dewPoint = null;
  let windSpeed = null;
  let windDirection = null;
  let pressure = null;
  let visibility = null;
  let weatherCode = null;
  let iconName = null;

  if (props) {
    const tempC =
      props.temperature?.unitCode?.includes('degC') || props.temperature?.uom?.includes('degC')
        ? unitValue(props.temperature)
        : fahrenheitToCelsius(unitValue(props.temperature));
    temperature = tempC;
    humidity = unitValue(props.relativeHumidity);
    const dewC =
      props.dewpoint?.unitCode?.includes('degC') || props.dewpoint?.uom?.includes('degC')
        ? unitValue(props.dewpoint)
        : fahrenheitToCelsius(unitValue(props.dewpoint));
    dewPoint = dewC;
    windSpeed = nwsWindSpeedToKmh(
      props.windSpeed?.value != null
        ? `${props.windSpeed.value} ${props.windSpeed.unitCode || 'm_s-1'}`
        : null
    );
    // Observation wind is often m/s in unitCode wmoUnit:m_s-1
    if (props.windSpeed?.unitCode?.includes('m_s-1') || props.windSpeed?.uom?.includes('m_s-1')) {
      const mps = unitValue(props.windSpeed);
      windSpeed = mps == null ? null : mps * 3.6;
    } else if (props.windSpeed?.unitCode?.includes('km_h-1')) {
      windSpeed = unitValue(props.windSpeed);
    }
    windDirection = unitValue(props.windDirection);
    pressure = unitValue(props.barometricPressure) ?? unitValue(props.seaLevelPressure);
    if (pressure != null && pressure > 2000) pressure = pressure / 100; // Pa → hPa
    visibility = unitValue(props.visibility);
    weatherCode = nwsIconToWeatherCode(props.icon);
    iconName = props.textDescription || null;
  } else if (hourly0) {
    temperature =
      hourly0.temperatureUnit === 'F'
        ? fahrenheitToCelsius(hourly0.temperature)
        : numberValue(hourly0.temperature);
    humidity = unitValue(hourly0.relativeHumidity);
    dewPoint =
      hourly0.dewpoint?.unitCode?.includes('degC')
        ? unitValue(hourly0.dewpoint)
        : fahrenheitToCelsius(unitValue(hourly0.dewpoint));
    windSpeed = nwsWindSpeedToKmh(hourly0.windSpeed);
    windDirection = nwsCompassToDegrees(hourly0.windDirection);
    weatherCode =
      nwsIconToWeatherCode(hourly0.icon) ?? iconNameToWeatherCode(hourly0.shortForecast);
    iconName = hourly0.shortForecast || null;
  }

  return {
    id: 'nws',
    temperature,
    apparentTemperature: null,
    precipitation: null,
    precipitationProbability: unitValue(hourly0?.probabilityOfPrecipitation),
    dewPoint: dewPoint ?? calculateDewPoint(temperature, humidity),
    windSpeed,
    windDirection,
    windGust: null,
    humidity,
    pressure,
    cloudCover: null,
    visibility: visibility != null && visibility < 1000 ? visibility : kilometersToMeters(visibility),
    uvIndex: null,
    weatherCode,
    iconName,
    raw: data,
  };
}
