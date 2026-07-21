export function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateDewPoint(temperature, humidity) {
  const temp = numberOrNull(temperature);
  const relativeHumidity = numberOrNull(humidity);
  if (temp === null || relativeHumidity === null || relativeHumidity <= 0) return null;

  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(relativeHumidity / 100) + (a * temp) / (b + temp);
  return (b * gamma) / (a - gamma);
}

export function calculateApparentTemperature(temperature, humidity, windSpeed) {
  const temp = numberOrNull(temperature);
  const relativeHumidity = numberOrNull(humidity);
  const wind = numberOrNull(windSpeed);
  if (temp === null) return null;

  if (temp <= 10 && wind !== null && wind > 4.8) {
    const windFactor = wind ** 0.16;
    return 13.12 + 0.6215 * temp - 11.37 * windFactor + 0.3965 * temp * windFactor;
  }

  if (relativeHumidity === null || wind === null) return null;

  const vaporPressure = (relativeHumidity / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  return temp + 0.33 * vaporPressure - 0.7 * (wind / 3.6) - 4;
}

export function calculateWetBulbTemperature(temperature, humidity) {
  const temp = numberOrNull(temperature);
  const relativeHumidity = numberOrNull(humidity);
  if (temp === null || relativeHumidity === null || relativeHumidity <= 0) return null;

  return (
    temp * Math.atan(0.151977 * Math.sqrt(relativeHumidity + 8.313659)) +
    Math.atan(temp + relativeHumidity) -
    Math.atan(relativeHumidity - 1.676331) +
    0.00391838 * relativeHumidity ** 1.5 * Math.atan(0.023101 * relativeHumidity) -
    4.686035
  );
}

export function calculateVaporPressureDeficit(temperature, humidity) {
  const temp = numberOrNull(temperature);
  const relativeHumidity = numberOrNull(humidity);
  if (temp === null || relativeHumidity === null || relativeHumidity < 0) return null;

  const saturation = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
  const actual = saturation * Math.min(relativeHumidity, 100) / 100;
  return Math.max(0, saturation - actual);
}

export function calculateAbsoluteHumidity(temperature, humidity) {
  const temp = numberOrNull(temperature);
  const relativeHumidity = numberOrNull(humidity);
  if (temp === null || relativeHumidity === null || relativeHumidity < 0) return null;

  const saturation = 6.112 * Math.exp((17.67 * temp) / (temp + 243.5));
  return (saturation * Math.min(relativeHumidity, 100) * 2.1674) / (273.15 + temp);
}

const WMO_WEATHER_CODES = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

export function normalizeWmoWeatherCode(code) {
  const value = numberOrNull(code);
  return value !== null && WMO_WEATHER_CODES.has(value) ? value : null;
}

export function openWeatherMapCodeToWeatherCode(code) {
  const value = numberOrNull(code);
  if (value === null) return null;

  if (value >= 200 && value < 300) return 95;
  if (value >= 300 && value < 400) return value >= 314 ? 55 : value >= 302 ? 53 : 51;
  if (value === 511) return 66;
  if (value >= 500 && value < 600) {
    if (value >= 520) return value >= 522 ? 82 : value === 521 ? 81 : 80;
    if (value >= 502) return 65;
    return value === 501 ? 63 : 61;
  }
  if (value >= 600 && value < 700) {
    if ([611, 612, 613, 615, 616].includes(value)) return 66;
    if (value >= 620) return value >= 621 ? 86 : 85;
    if (value >= 602) return 75;
    return value === 601 ? 73 : 71;
  }
  if (value === 701 || value === 741) return 45;
  if (value === 800) return 0;
  if (value === 801) return 1;
  if (value === 802) return 2;
  if (value === 803 || value === 804) return 3;

  return null;
}

export function weatherApiCodeToWeatherCode(code) {
  const value = numberOrNull(code);
  if (value === null) return null;

  if (value === 1000) return 0;
  if (value === 1003) return 2;
  if (value === 1006 || value === 1009) return 3;
  if (value === 1030 || value === 1135) return 45;
  if (value === 1147) return 48;
  if (value === 1087 || value === 1273 || value === 1276) return 95;
  if (value === 1279 || value === 1282) return 96;
  if (value === 1066 || value === 1210 || value === 1213) return 71;
  if (value === 1216 || value === 1219) return 73;
  if (value === 1114 || value === 1117 || value === 1222 || value === 1225) return 75;
  if (value === 1237) return 77;
  if (value === 1255) return 85;
  if (value === 1258) return 86;
  if (value === 1069 || value === 1204) return 66;
  if (value === 1207) return 67;
  if (value === 1072 || value === 1168) return 56;
  if (value === 1171) return 57;
  if (value === 1150 || value === 1153) return 51;
  if (value === 1063 || value === 1180 || value === 1183) return 61;
  if (value === 1186 || value === 1189) return 63;
  if (value === 1192 || value === 1195) return 65;
  if (value === 1198) return 66;
  if (value === 1201) return 67;
  if (value === 1240) return 80;
  if (value === 1243) return 81;
  if (value === 1246) return 82;

  return null;
}

export function wttrCodeToWeatherCode(code) {
  const value = numberOrNull(code);
  if (value === null) return null;

  if (value === 113) return 0;
  if (value === 116) return 2;
  if (value === 119 || value === 122) return 3;
  if (value === 143 || value === 248) return 45;
  if (value === 260) return 48;
  if ([176, 263, 266, 293, 296].includes(value)) return 61;
  if ([299, 302, 305, 308].includes(value)) return value >= 305 ? 65 : 63;
  if ([179, 323, 326, 368].includes(value)) return 71;
  if ([329, 332, 371].includes(value)) return 73;
  if ([227, 230, 335, 338, 395].includes(value)) return 75;
  if ([182, 185, 281, 284, 311, 314, 317, 320, 350, 362, 365, 374, 377].includes(value)) return 66;
  if (value === 353) return 80;
  if (value === 356) return 81;
  if (value === 359) return 82;
  if (value === 386 || value === 389) return 95;
  if (value === 392) return 96;

  return null;
}

/** Weather Channel / weather.com classic iconCode → WMO. */
export function weatherComIconCodeToWeatherCode(code) {
  const value = numberOrNull(code);
  if (value === null) return null;

  const map = {
    0: 95,
    1: 95,
    2: 95,
    3: 95,
    4: 95,
    5: 67,
    6: 66,
    7: 67,
    8: 56,
    9: 51,
    10: 66,
    11: 80,
    12: 63,
    13: 71,
    14: 85,
    15: 73,
    16: 73,
    17: 96,
    18: 77,
    19: 3,
    20: 45,
    21: 45,
    22: 45,
    23: 1,
    24: 1,
    25: 0,
    26: 3,
    27: 2,
    28: 2,
    29: 1,
    30: 1,
    31: 0,
    32: 0,
    33: 1,
    34: 1,
    35: 96,
    36: 0,
    37: 95,
    38: 95,
    39: 80,
    40: 65,
    41: 85,
    42: 75,
    43: 75,
    45: 80,
    46: 85,
    47: 95,
  };

  return map[value] ?? null;
}

export function iconNameToWeatherCode(iconName) {
  const icon = String(iconName || '').toLowerCase();
  if (!icon) return null;

  if (icon.includes('thunder') || icon.includes('storm')) return 95;
  if (icon.includes('freezing') && icon.includes('fog')) return 48;
  if (icon.includes('fog') || icon.includes('mist')) return 45;
  if (icon.includes('heavy') && icon.includes('rain')) return 65;
  if (icon.includes('rain') || icon.includes('drizzle')) return icon.includes('showers') || icon.includes('shower') ? 80 : 61;
  if (icon.includes('sleet') || icon.includes('freezing')) return 66;
  if (icon.includes('heavy') && icon.includes('snow')) return 75;
  if (icon.includes('snow')) return icon.includes('showers') || icon.includes('shower') ? 85 : 71;
  if (icon.includes('overcast')) return 3;
  if (icon.includes('partly') || icon.includes('fair')) return 2;
  if (icon.includes('cloudy') || icon.includes('cloud')) return 3;
  if (icon.includes('clear') || icon.includes('sunny')) return 0;

  return null;
}

export function inferWeatherCode({ temperature, dewPoint, precipitation, cloudCover, fogArea, humidity, visibility }) {
  const temp = numberOrNull(temperature);
  const dew = numberOrNull(dewPoint);
  const rain = numberOrNull(precipitation);
  const clouds = numberOrNull(cloudCover);
  const fog = numberOrNull(fogArea);
  const relativeHumidity = numberOrNull(humidity);
  const visibleMeters = numberOrNull(visibility);

  if (visibleMeters !== null && visibleMeters < 1000) return temp !== null && temp <= 0 ? 48 : 45;
  if (fog !== null && fog >= 30) return temp !== null && temp <= 0 ? 48 : 45;
  if (temp !== null && dew !== null && relativeHumidity !== null && relativeHumidity >= 95 && temp - dew <= 1.5) {
    return temp <= 0 ? 48 : 45;
  }

  if (rain !== null && rain > 0) {
    const snowLikely = temp !== null && (temp <= 1 || (temp <= 2 && dew !== null && dew <= 0));
    if (snowLikely) {
      if (rain >= 4) return 75;
      if (rain >= 1) return 73;
      return 71;
    }
    if (rain >= 4) return 65;
    if (rain >= 1) return 63;
    return 61;
  }

  if (clouds !== null) {
    if (clouds <= 15) return 0;
    if (clouds <= 35) return 1;
    if (clouds <= 75) return 2;
    return 3;
  }

  return null;
}

export function fractionToPercent(value) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return number >= 0 && number <= 1 ? number * 100 : number;
}

export function kilometersToMeters(value) {
  const number = numberOrNull(value);
  return number === null ? null : number * 1000;
}

export function knotsToKmh(value) {
  const number = numberOrNull(value);
  return number === null ? null : number * 1.852;
}

export function metersPerSecondToKmh(value) {
  const number = numberOrNull(value);
  return number === null ? null : number * 3.6;
}
