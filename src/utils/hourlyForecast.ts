import { metersPerSecondToKmh } from './weatherMath';

const TZ = 'Europe/Prague';

export type HourlyPoint = {
  key: string;
  dayKey: string;
  time: Date;
  temperature: number | null;
  precipMm: number | null;
  precipProb: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  weatherCode: number | null;
  sources: string[];
};

export type ForecastDay = {
  key: string;
  date: Date;
  tempMin: number | null;
  tempMax: number | null;
  precipSum: number | null;
  weatherCode: number | null;
  hours: HourlyPoint[];
};

type ForecastSeries = {
  id: string;
  name?: string;
  weight: number;
  kind: string;
  data: any;
};

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pragueParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
  };
}

export function pragueDayKey(date: Date) {
  const { year, month, day } = pragueParts(date);
  return `${year}-${month}-${day}`;
}

export function pragueHourKey(date: Date) {
  const { year, month, day, hour } = pragueParts(date);
  return `${year}-${month}-${day}T${hour}`;
}

function parseLooseTime(value: string) {
  const normalized = String(value).trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return new Date(`${normalized.length === 16 ? `${normalized}:00` : normalized}`);
  }
  return new Date(normalized);
}

function weightedAverage(entries: { value: number; weight: number }[]) {
  if (!entries.length) return null;
  const weightSum = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (weightSum <= 0) return null;
  return entries.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weightSum;
}

function pickFirstFinite(values: Array<number | null | undefined>) {
  for (const value of values) {
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

type MutableHour = {
  key: string;
  dayKey: string;
  time: Date;
  temps: { value: number; weight: number; source: string }[];
  precips: { value: number; weight: number; source: string }[];
  precipProbs: { value: number; weight: number; source: string }[];
  winds: { value: number; weight: number; source: string }[];
  dirs: { value: number; weight: number; source: string }[];
  codes: { value: number; source: string }[];
  sources: Set<string>;
};

function ensureHour(map: Map<string, MutableHour>, time: Date) {
  const key = pragueHourKey(time);
  let row = map.get(key);
  if (!row) {
    row = {
      key,
      dayKey: pragueDayKey(time),
      time,
      temps: [],
      precips: [],
      precipProbs: [],
      winds: [],
      dirs: [],
      codes: [],
      sources: new Set(),
    };
    map.set(key, row);
  }
  return row;
}

function pushMetric(
  list: { value: number; weight: number; source: string }[],
  value: number | null,
  weight: number,
  source: string
) {
  if (value == null || !Number.isFinite(value)) return;
  list.push({ value, weight, source });
}

/** Open-Meteo-shaped hourly block (UI weather API or model raw). */
export function ingestOpenMeteoHourly(
  map: Map<string, MutableHour>,
  hourly: any,
  sourceId = 'openmeteo',
  weight = 1
) {
  if (!hourly?.time?.length) return;
  for (let i = 0; i < hourly.time.length; i += 1) {
    const time = parseLooseTime(hourly.time[i]);
    if (Number.isNaN(time.getTime())) continue;
    const row = ensureHour(map, time);
    row.sources.add(sourceId);
    pushMetric(row.temps, finite(hourly.temperature_2m?.[i]), weight, sourceId);
    pushMetric(row.precips, finite(hourly.precipitation?.[i]), weight, sourceId);
    pushMetric(row.precipProbs, finite(hourly.precipitation_probability?.[i]), weight, sourceId);
    pushMetric(row.winds, finite(hourly.wind_speed_10m?.[i] ?? hourly.windspeed_10m?.[i]), weight, sourceId);
    pushMetric(row.dirs, finite(hourly.wind_direction_10m?.[i] ?? hourly.winddirection_10m?.[i]), weight, sourceId);
    const code = finite(hourly.weather_code?.[i] ?? hourly.weathercode?.[i]);
    if (code != null) row.codes.push({ value: code, source: sourceId });
  }
}

/** Aladin slim/raw parameterValues series. */
export function ingestAladinHourly(map: Map<string, MutableHour>, aladin: any, weight = 5, sourceId = 'aladin') {
  const values = aladin?.parameterValues;
  const startRaw = aladin?.forecastTimeIso;
  if (!values || !startRaw) return;

  const start = parseLooseTime(startRaw);
  if (Number.isNaN(start.getTime())) return;

  const precip = values.PRECIPITATION_TOTAL || [];
  const temp = values.TEMPERATURE || [];
  const wind = values.WIND_SPEED || [];
  const dir = values.WIND_DIRECTION || [];
  const length = Math.max(precip.length, temp.length, wind.length, Number(aladin.forecastLength) || 0);

  for (let i = 0; i < length; i += 1) {
    const time = new Date(start.getTime() + i * 60 * 60 * 1000);
    const row = ensureHour(map, time);
    row.sources.add(sourceId);
    pushMetric(row.temps, finite(temp[i]), weight, sourceId);
    pushMetric(row.precips, finite(precip[i]), weight, sourceId);
    pushMetric(row.winds, metersPerSecondToKmh(wind[i]), weight, sourceId);
    pushMetric(row.dirs, finite(dir[i]), weight, sourceId);
  }
}

/** Yr.no slim steps or full timeseries. */
export function ingestYrHourly(map: Map<string, MutableHour>, yr: any, weight = 3, sourceId = 'yr') {
  if (Array.isArray(yr?.steps)) {
    for (const step of yr.steps) {
      const time = new Date(step.time);
      if (Number.isNaN(time.getTime())) continue;
      const row = ensureHour(map, time);
      row.sources.add(sourceId);
      pushMetric(row.temps, finite(step.temperature), weight, sourceId);
      pushMetric(row.precips, finite(step.precipitation), weight, sourceId);
      pushMetric(row.precipProbs, finite(step.precipitationProbability), weight, sourceId);
      pushMetric(row.winds, metersPerSecondToKmh(step.windSpeed), weight, sourceId);
      pushMetric(row.dirs, finite(step.windDirection), weight, sourceId);
    }
    return;
  }

  const series = yr?.properties?.timeseries;
  if (!Array.isArray(series)) return;

  for (const step of series) {
    const time = new Date(step?.time);
    if (Number.isNaN(time.getTime())) continue;
    const instant = step?.data?.instant?.details || {};
    const next1 = step?.data?.next_1_hours;
    if (!next1) continue;

    const row = ensureHour(map, time);
    row.sources.add(sourceId);
    pushMetric(row.temps, finite(instant.air_temperature), weight, sourceId);
    pushMetric(row.precips, finite(next1.details?.precipitation_amount), weight, sourceId);
    pushMetric(row.precipProbs, finite(next1.details?.probability_of_precipitation), weight, sourceId);
    pushMetric(row.winds, metersPerSecondToKmh(instant.wind_speed), weight, sourceId);
    pushMetric(row.dirs, finite(instant.wind_from_direction), weight, sourceId);
  }
}

/** wttr.in 3-hourly steps (already in km/h). */
export function ingestWttrHourly(map: Map<string, MutableHour>, wttr: any, weight = 1, sourceId = 'wttr') {
  const steps = wttr?.steps;
  if (!Array.isArray(steps)) return;

  for (const step of steps) {
    const time = parseLooseTime(step.time);
    if (Number.isNaN(time.getTime())) continue;
    const row = ensureHour(map, time);
    row.sources.add(sourceId);
    pushMetric(row.temps, finite(step.temperature), weight, sourceId);
    pushMetric(row.precips, finite(step.precipitation), weight, sourceId);
    pushMetric(row.precipProbs, finite(step.precipitationProbability), weight, sourceId);
    pushMetric(row.winds, finite(step.windSpeed), weight, sourceId);
    pushMetric(row.dirs, finite(step.windDirection), weight, sourceId);
  }
}

/** weather.com hourly steps (metric units already in km/h + mm). */
export function ingestWeatherComHourly(map: Map<string, MutableHour>, data: any, weight = 2, sourceId = 'weathercom') {
  ingestWttrHourly(map, data, weight, sourceId);
}

function ingestSeries(map: Map<string, MutableHour>, series: ForecastSeries) {
  const weight = series.weight > 0 ? series.weight : 1;
  if (series.kind === 'aladin') {
    ingestAladinHourly(map, series.data, weight, series.id);
    return;
  }
  if (series.kind === 'yr') {
    ingestYrHourly(map, series.data, weight, series.id);
    return;
  }
  if (
    series.kind === 'wttr' ||
    series.kind === 'weathercom' ||
    series.kind === 'openweathermap' ||
    series.kind === 'steps'
  ) {
    ingestWttrHourly(map, series.data, weight, series.id);
    return;
  }
  if (series.kind === 'openmeteo') {
    ingestOpenMeteoHourly(map, series.data, series.id, weight);
  }
}

function finalizeHours(map: Map<string, MutableHour>): HourlyPoint[] {
  return [...map.values()]
    .map((row) => ({
      key: row.key,
      dayKey: row.dayKey,
      time: row.time,
      temperature: weightedAverage(row.temps),
      precipMm: weightedAverage(row.precips),
      precipProb: weightedAverage(row.precipProbs),
      windSpeed: weightedAverage(row.winds),
      windDirection: weightedAverage(row.dirs),
      weatherCode: pickFirstFinite(row.codes.map((entry) => entry.value)),
      sources: [...row.sources],
    }))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

function buildDaysFromHours(hours: HourlyPoint[], daily?: any): ForecastDay[] {
  const byDay = new Map<string, HourlyPoint[]>();
  for (const hour of hours) {
    const list = byDay.get(hour.dayKey) || [];
    list.push(hour);
    byDay.set(hour.dayKey, list);
  }

  const dailyByKey = new Map<
    string,
    { tempMin: number | null; tempMax: number | null; precipSum: number | null; weatherCode: number | null; date: Date }
  >();
  if (daily?.time?.length) {
    for (let i = 0; i < daily.time.length; i += 1) {
      const date = parseLooseTime(String(daily.time[i]).length <= 10 ? `${daily.time[i]}T12:00` : daily.time[i]);
      const key = pragueDayKey(date);
      dailyByKey.set(key, {
        date,
        tempMin: finite(daily.temperature_2m_min?.[i]),
        tempMax: finite(daily.temperature_2m_max?.[i]),
        precipSum: finite(daily.precipitation_sum?.[i]),
        weatherCode: finite(daily.weathercode?.[i] ?? daily.weather_code?.[i]),
      });
    }
  }

  return [...byDay.keys()].sort().map((key) => {
    const dayHours = byDay.get(key) || [];
    const temps = dayHours.map((hour) => hour.temperature).filter((value): value is number => value != null);
    const precips = dayHours.map((hour) => hour.precipMm).filter((value): value is number => value != null);
    const fromDaily = dailyByKey.get(key);
    const noon = dayHours[Math.floor(dayHours.length / 2)] || dayHours[0];

    return {
      key,
      date: fromDaily?.date || noon.time,
      tempMin: fromDaily?.tempMin ?? (temps.length ? Math.min(...temps) : null),
      tempMax: fromDaily?.tempMax ?? (temps.length ? Math.max(...temps) : null),
      precipSum: fromDaily?.precipSum ?? (precips.length ? precips.reduce((sum, value) => sum + value, 0) : null),
      weatherCode: fromDaily?.weatherCode ?? noon?.weatherCode ?? null,
      hours: dayHours,
    };
  });
}

/**
 * Merge every available forecast series (Open-Meteo models, Aladin, Yr, wttr, …)
 * with optional UI `/api/weather` hourly as an extra Open-Meteo baseline.
 */
export function buildMergedForecastDays({
  hourly,
  daily,
  forecastSeries = [],
}: {
  hourly?: any;
  daily?: any;
  forecastSeries?: ForecastSeries[];
}): { days: ForecastDay[]; sourcesUsed: string[]; sourceNames: Record<string, string> } {
  const map = new Map<string, MutableHour>();
  const sourceNames: Record<string, string> = { openmeteo: 'Open-Meteo' };

  // Baseline multi-day weather API (includes POP) — lower weight than named models.
  if (hourly?.time?.length) {
    ingestOpenMeteoHourly(map, hourly, 'openmeteo', 1.5);
  }

  for (const series of forecastSeries) {
    if (!series?.id || !series?.data) continue;
    if (series.name) sourceNames[series.id] = series.name;
    ingestSeries(map, series);
  }

  const hours = finalizeHours(map);
  const days = buildDaysFromHours(hours, daily);
  const sourcesUsed = [...new Set(hours.flatMap((hour) => hour.sources))];

  return { days, sourcesUsed, sourceNames };
}

/** Short Aladin nowcast strip (10-min moments) for near-term precip. */
export function adaptAladinNowcast(aladin: any, limit = 10) {
  const moments = aladin?.nowCasting?.moments;
  const interval = Number(aladin?.nowCasting?.intervalMinutes) || 10;
  const nowIdx = Math.max(0, Number(aladin?.nowCasting?.nowIdx) || 0);
  if (!Array.isArray(moments) || !moments.length) return [];

  const rawNow = aladin?.nowCasting?.nowUtc;
  let anchor = rawNow ? parseLooseTime(String(rawNow)) : new Date();
  if (Number.isNaN(anchor.getTime())) anchor = new Date();

  return moments.slice(nowIdx, nowIdx + limit).map((moment: any, i: number) => {
    const time = new Date(anchor.getTime() + i * interval * 60 * 1000);
    return {
      label: `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`,
      fullLabel: time.toLocaleString('cs-CZ'),
      precip: finite(moment?.rainAmountMillimetersPerHour) ?? 0,
      time,
    };
  });
}

/** Hourly Aladin precip from parameterValues (fallback when moments missing). */
export function adaptAladinHourlyPrecip(aladin: any, limit = 10) {
  const map = new Map<string, MutableHour>();
  ingestAladinHourly(map, aladin, 1);
  const now = Date.now();
  return finalizeHours(map)
    .filter((row) => row.time.getTime() > now - 30 * 60 * 1000)
    .slice(0, limit)
    .map((row) => ({
      label: `${row.time.getHours()}h`,
      fullLabel: row.time.toLocaleString('cs-CZ'),
      precip: row.precipMm ?? 0,
      time: row.time,
    }));
}
