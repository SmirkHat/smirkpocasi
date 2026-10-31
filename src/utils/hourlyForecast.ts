import { iconNameToWeatherCode, metersPerSecondToKmh, parsePragueTime } from './weatherMath';
import {
  ROBUST_FIELD,
  robustAggregate,
  robustAggregateDetails,
  weatherCodeConsensus,
  type AggregateExclusionReason,
} from './robustAggregate';

const TZ = 'Europe/Prague';
// Building an Intl formatter is slow and this runs for every hour of every source on the main thread.
const PRAGUE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});
const praguePartsCache = new Map<number, { year: string; month: string; day: string; hour: string }>();

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
  calculations: () => HourlyCalculations;
};

export type HourlyCalculationInput = {
  source: string;
  value: number;
  weight: number;
  included: boolean;
  exclusionReason?: AggregateExclusionReason;
};

export type HourlyCalculation = {
  method: 'robust-mean' | 'weighted-mean' | 'circular-mean';
  result: number | null;
  inputs: HourlyCalculationInput[];
};

export type HourlyCalculations = {
  temperature: HourlyCalculation;
  precipMm: HourlyCalculation;
  precipProb: HourlyCalculation;
  windSpeed: HourlyCalculation;
  windDirection: HourlyCalculation;
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

type WeightedSourceValue = { value: number; weight: number; source: string };

function finite(value: unknown): number | null {
  // Number(null) is 0. Models past the end of their range send null, which would count as 0 °C and no rain.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pragueParts(date: Date) {
  const epoch = date.getTime();
  const cached = praguePartsCache.get(epoch);
  if (cached) return cached;

  const parts = PRAGUE_FORMAT.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '00';
  const result = {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
  };
  if (praguePartsCache.size > 2000) praguePartsCache.clear();
  praguePartsCache.set(epoch, result);
  return result;
}

export function pragueDayKey(date: Date) {
  const { year, month, day } = pragueParts(date);
  return `${year}-${month}-${day}`;
}

export function pragueHourKey(date: Date) {
  const { year, month, day, hour } = pragueParts(date);
  return `${year}-${month}-${day}T${hour}`;
}

type MutableHour = {
  key: string;
  dayKey: string;
  time: Date;
  temps: WeightedSourceValue[];
  precips: WeightedSourceValue[];
  precipProbs: WeightedSourceValue[];
  winds: WeightedSourceValue[];
  dirs: WeightedSourceValue[];
  codes: WeightedSourceValue[];
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
  list: WeightedSourceValue[],
  value: number | null,
  weight: number,
  source: string
) {
  if (value == null || !Number.isFinite(value)) return;
  list.push({ value, weight, source });
}

function robustCalculation(
  entries: WeightedSourceValue[],
  options: { tolerance?: number; limits?: [number, number]; circular?: boolean; mean?: boolean },
): HourlyCalculation {
  const details = robustAggregateDetails(entries, options);
  const kept = new Set(details.kept);
  const rejected = new Map(details.rejected.map(({ entry, reason }) => [entry, reason]));

  return {
    method: options.circular ? 'circular-mean' : options.mean ? 'weighted-mean' : 'robust-mean',
    result: details.value,
    inputs: entries.map((entry) => ({
      ...entry,
      included: kept.has(entry),
      ...(rejected.has(entry) ? { exclusionReason: rejected.get(entry) } : {}),
    })),
  };
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
    const time = parsePragueTime(hourly.time[i]);
    if (Number.isNaN(time.getTime())) continue;
    const row = ensureHour(map, time);
    row.sources.add(sourceId);
    pushMetric(row.temps, finite(hourly.temperature_2m?.[i]), weight, sourceId);
    pushMetric(row.precips, finite(hourly.precipitation?.[i]), weight, sourceId);
    pushMetric(row.precipProbs, finite(hourly.precipitation_probability?.[i]), weight, sourceId);
    pushMetric(row.winds, finite(hourly.wind_speed_10m?.[i] ?? hourly.windspeed_10m?.[i]), weight, sourceId);
    pushMetric(row.dirs, finite(hourly.wind_direction_10m?.[i] ?? hourly.winddirection_10m?.[i]), weight, sourceId);
    const code = finite(hourly.weather_code?.[i] ?? hourly.weathercode?.[i]);
    if (code != null) row.codes.push({ value: code, weight, source: sourceId });
  }
}

/** Aladin slim/raw parameterValues series. */
export function ingestAladinHourly(map: Map<string, MutableHour>, aladin: any, weight = 5, sourceId = 'aladin') {
  const values = aladin?.parameterValues;
  const startRaw = aladin?.forecastTimeIso;
  if (!values || !startRaw) return;

  const start = parsePragueTime(startRaw);
  if (Number.isNaN(start.getTime())) return;

  const precip = values.PRECIPITATION_TOTAL || [];
  const temp = values.TEMPERATURE || [];
  const wind = values.WIND_SPEED || [];
  const dir = values.WIND_DIRECTION || [];
  const icons = Array.isArray(aladin.weatherIconNames) ? aladin.weatherIconNames : [];
  const length = Math.max(
    precip.length,
    temp.length,
    wind.length,
    icons.length,
    Number(aladin.forecastLength) || 0,
  );

  for (let i = 0; i < length; i += 1) {
    const time = new Date(start.getTime() + i * 60 * 60 * 1000);
    const row = ensureHour(map, time);
    row.sources.add(sourceId);
    pushMetric(row.temps, finite(temp[i]), weight, sourceId);
    pushMetric(row.precips, finite(precip[i]), weight, sourceId);
    pushMetric(row.winds, metersPerSecondToKmh(wind[i]), weight, sourceId);
    pushMetric(row.dirs, finite(dir[i]), weight, sourceId);
    const code = finite(iconNameToWeatherCode(icons[i]));
    if (code != null) row.codes.push({ value: code, weight, source: sourceId });
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
      const code = finite(step.weatherCode);
      if (code != null) row.codes.push({ value: code, weight, source: sourceId });
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

/** wttr.in / generic steps (already in km/h). */
export function ingestWttrHourly(map: Map<string, MutableHour>, wttr: any, weight = 1, sourceId = 'wttr') {
  const steps = wttr?.steps;
  if (!Array.isArray(steps)) return;

  for (const step of steps) {
    const time = parsePragueTime(step.time);
    if (Number.isNaN(time.getTime())) continue;
    const row = ensureHour(map, time);
    row.sources.add(sourceId);
    pushMetric(row.temps, finite(step.temperature), weight, sourceId);
    pushMetric(row.precips, finite(step.precipitation), weight, sourceId);
    pushMetric(row.precipProbs, finite(step.precipitationProbability), weight, sourceId);
    pushMetric(row.winds, finite(step.windSpeed), weight, sourceId);
    pushMetric(row.dirs, finite(step.windDirection), weight, sourceId);
    const code = finite(step.weatherCode);
    if (code != null) row.codes.push({ value: code, weight, source: sourceId });
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

/** A calm model's direction is noise; weight directions by that model's own wind speed. */
function speedWeightedDirections(row: MutableHour) {
  const speedBySource = new Map(row.winds.map((wind) => [wind.source, wind.value]));
  return row.dirs.map((dir) => ({
    ...dir,
    weight: dir.weight * Math.max(speedBySource.get(dir.source) ?? 1, 1),
  }));
}

function hourCalculations(row: MutableHour): HourlyCalculations {
  return {
    temperature: robustCalculation(row.temps, ROBUST_FIELD.temperature),
    precipMm: robustCalculation(row.precips, ROBUST_FIELD.precipitation),
    precipProb: robustCalculation(row.precipProbs, ROBUST_FIELD.precipitationProbability),
    windSpeed: robustCalculation(row.winds, ROBUST_FIELD.windSpeed),
    windDirection: robustCalculation(speedWeightedDirections(row), {
      ...ROBUST_FIELD.windDirection,
      circular: true,
    }),
  };
}

function finalizeHours(map: Map<string, MutableHour>): HourlyPoint[] {
  return [...map.values()]
    .map((row) => ({
      key: row.key,
      dayKey: row.dayKey,
      time: row.time,
      temperature: robustAggregate(row.temps, ROBUST_FIELD.temperature),
      precipMm: robustAggregate(row.precips, ROBUST_FIELD.precipitation),
      precipProb: robustAggregate(row.precipProbs, ROBUST_FIELD.precipitationProbability),
      windSpeed: robustAggregate(row.winds, ROBUST_FIELD.windSpeed),
      windDirection: robustAggregate(speedWeightedDirections(row), {
        ...ROBUST_FIELD.windDirection,
        circular: true,
      }),
      weatherCode: weatherCodeConsensus(row.codes),
      sources: [...row.sources],
      // Built on request: most visitors never open the calculation view.
      calculations: () => hourCalculations(row),
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
      const date = parsePragueTime(String(daily.time[i]).length <= 10 ? `${daily.time[i]}T12:00` : daily.time[i]);
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
    const dayHours = byDay.get(key) || []
    const temps = dayHours.map((hour) => hour.temperature).filter((value): value is number => value != null)
    const precips = dayHours.map((hour) => hour.precipMm).filter((value): value is number => value != null)
    const fromDaily = dailyByKey.get(key)
    const noon = dayHours[Math.floor(dayHours.length / 2)] || dayHours[0]

    // Prefer extremes / codes from the same hourly series the chart plots —
    // Open-Meteo daily often disagrees with the multi-source hourly consensus.
    const hourlyMin = temps.length ? Math.min(...temps) : null
    const hourlyMax = temps.length ? Math.max(...temps) : null
    const hourlyPrecip = precips.length ? precips.reduce((sum, value) => sum + value, 0) : null
    const dayCode = weatherCodeConsensus(
      dayHours
        .filter((hour) => hour.weatherCode != null)
        .map((hour) => ({ value: hour.weatherCode as number, weight: 1 })),
    )

    return {
      key,
      date: fromDaily?.date || noon.time,
      tempMin: hourlyMin ?? fromDaily?.tempMin ?? null,
      tempMax: hourlyMax ?? fromDaily?.tempMax ?? null,
      precipSum: hourlyPrecip ?? fromDaily?.precipSum ?? null,
      weatherCode: dayCode ?? noon?.weatherCode ?? fromDaily?.weatherCode ?? null,
      hours: dayHours,
    }
  })
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
  // Unlike forecastTimeIso, nowUtc really is UTC despite having no zone marker.
  let anchor = rawNow ? new Date(`${String(rawNow).trim().replace(' ', 'T')}Z`) : new Date();
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
