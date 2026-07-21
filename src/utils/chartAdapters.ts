import { formatDay, formatHydroName, formatTemperature, formatTime } from './formatters';
import { adaptAladinHourlyPrecip, adaptAladinNowcast } from './hourlyForecast';

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function adaptHourlySeries(hourly, limit = 24) {
  if (!hourly?.time?.length) return [];
  const now = Date.now();
  const rows = [];

  for (let i = 0; i < hourly.time.length && rows.length < limit; i += 1) {
    const time = new Date(hourly.time[i]);
    if (time.getTime() <= now) continue;
    rows.push({
      label: formatTime(time),
      fullLabel: time.toLocaleString('cs-CZ'),
      temperature: finite(hourly.temperature_2m?.[i]),
      precipProb: finite(hourly.precipitation_probability?.[i]) ?? 0,
      windSpeed: finite(hourly.wind_speed_10m?.[i] ?? hourly.windspeed_10m?.[i]),
    });
  }

  return rows;
}

export function adaptDailyRange(daily) {
  if (!daily?.time?.length) return [];

  return daily.time.map((time, i) => {
    const date = new Date(time);
    const tmin = finite(daily.temperature_2m_min?.[i]);
    const tmax = finite(daily.temperature_2m_max?.[i]);
    return {
      label: i === 0 ? 'Dnes' : formatDay(date),
      fullLabel: date.toLocaleDateString('cs-CZ'),
      tmin,
      tmax,
      // Recharts range band via stacked areas: base + span
      base: tmin,
      span: tmin != null && tmax != null ? tmax - tmin : null,
      precip: finite(daily.precipitation_sum?.[i]) ?? 0,
    };
  });
}

export function adaptNowcastPrecip(aladin, limit = 10) {
  // Prefer 10-min nowcast moments; fall back to hourly PRECIPITATION_TOTAL.
  const fromMoments = adaptAladinNowcast(aladin, limit);
  if (fromMoments.length) return fromMoments;
  return adaptAladinHourlyPrecip(aladin, limit);
}

export function adaptAqiStations(stations) {
  if (!Array.isArray(stations) || !stations.length) return [];

  return stations.map((row) => ({
    label: row.station?.name || 'Stanice',
    shortLabel: (row.station?.name || 'Stanice').split(/[-–(]/)[0].trim().slice(0, 14),
    distanceKm: row.station?.distanceKm ?? null,
    indexValue: finite(row.indexValue) ?? 0,
    aqi: finite(row.aqi),
    labelText: row.label || '—',
    pm10: finite(row.pm10),
    pm25: finite(row.pm25),
  }));
}

export function adaptHydroLevels(profiles, limit = 5) {
  if (!Array.isArray(profiles) || !profiles.length) return [];

  return profiles.slice(0, limit).map((profile) => {
    const label = formatHydroName(profile.name);
    return {
      label,
      shortLabel: String(label || '').slice(0, 12),
      river: formatHydroName(profile.river || ''),
      height: finite(profile.height) ?? 0,
      floodLevel: Number(profile.floodLevel) || 0,
      flow: finite(profile.flow),
      waterTemperature: finite(profile.waterTemperature),
      spaPct: finite(profile.spaPct),
      spa1: finite(profile.spa1),
      spa2: finite(profile.spa2),
      spa3: finite(profile.spa3),
      dry: finite(profile.dry),
      trend: finite(profile.trend),
      history: Array.isArray(profile.history) ? profile.history : [],
      source: profile.source || '',
      country: profile.country || '',
    };
  });
}

/** Stations with a comparable fill % (SPA1 or DE MW reference). */
export function adaptHydroSpaFill(profiles, limit = 8) {
  return adaptHydroLevels(profiles, 40)
    .filter((row) => row.spaPct != null)
    .slice(0, limit);
}

export function adaptMeteostatDays(days) {
  if (!Array.isArray(days) || !days.length) return [];

  return days.map((day) => {
    const date = new Date(day.date);
    const tmin = finite(day.tmin);
    const tmax = finite(day.tmax);
    const tavg = finite(day.tavg);
    return {
      label: date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
      fullLabel: day.date,
      tmin,
      tmax,
      tavg,
      base: tmin,
      span: tmin != null && tmax != null ? tmax - tmin : null,
      precip: finite(day.prcp) ?? 0,
      displayMax: tmax != null ? formatTemperature(tmax) : '—',
      displayMin: tmin != null ? formatTemperature(tmin) : '—',
    };
  });
}
