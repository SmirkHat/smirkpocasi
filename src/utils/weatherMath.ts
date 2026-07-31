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

const SUN_TZ = 'Europe/Prague';

/** Clock minutes since local midnight (0–1439) in `timeZone`. */
export function toLocalDayMinutes(value, timeZone = SUN_TZ) {
  if (value == null || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Already minutes-since-midnight (consensus field).
    if (value >= 0 && value < 24 * 60) return Math.round(value);
    const ms = value < 1e12 ? value * 1000 : value;
    return epochMsToLocalDayMinutes(ms, timeZone);
  }

  const str = String(value).trim();
  const ampm = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2]);
    const ap = ampm[3].toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }

  // Open-Meteo daily sunrise/sunset with timezone=Europe/Prague are civil-time
  // strings without an offset — read the clock fields directly.
  const isoCivil = str.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2})?$/);
  if (isoCivil) {
    return Number(isoCivil[1]) * 60 + Number(isoCivil[2]);
  }

  const hm = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm && !str.includes('T') && !str.includes('-')) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }

  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return null;
  return epochMsToLocalDayMinutes(date.getTime(), timeZone);
}

function epochMsToLocalDayMinutes(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

/** Format minutes-since-midnight as HH:MM. */
export function formatDayMinutes(value) {
  const mins = numberOrNull(value);
  if (mins === null) return null;
  const clamped = ((Math.round(mins) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Yr.no / MET Norway symbol_code → WMO. */
export function symbolCodeToWeatherCode(symbolCode) {
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
