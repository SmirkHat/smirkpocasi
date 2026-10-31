/** Pure consensus math + result builder (client + server). */
import { PROVIDERS } from '../config/providers';
import { extractForecastSeries } from './forecastSeries';
import {
  partitionOutliers,
  robustMean,
  weatherCodeConsensus,
  weightedCircularMean,
  weightedMean,
  weightedStandardDeviation,
} from './robustAggregate';
import {
  calculateAbsoluteHumidity,
  calculateApparentTemperature,
  calculateDewPoint,
  calculateRelativeHumidity,
  calculateVaporPressureDeficit,
  calculateWetBulbTemperature,
  iconNameToWeatherCode,
  inferWeatherCode,
  normalizeWmoWeatherCode,
  numberOrNull,
  toLocalDayMinutes,
} from './weatherMath';

const FIELDS = [
  'temperature',
  'apparentTemperature',
  'dewPoint',
  'precipitation',
  'precipitationProbability',
  'windSpeed',
  'windDirection',
  'windGust',
  'humidity',
  'pressure',
  'cloudCover',
  'fogArea',
  'visibility',
  'uvIndex',
];
export const OBSERVATION_SOURCE_IDS = new Set([
  'opensensemap',
  'chmi',
  'aviation',
  'brightsky',
  'shmu',
  'geosphere',
  'imgw',
  'netatmo',
  'wunderground',
  'inpocasi',
]);
const PERSONAL_STATION_IDS = new Set(['opensensemap', 'inpocasi', 'netatmo', 'wunderground']);
const OBSERVATION_BLEND_FIELDS = ['temperature', 'dewPoint'];
const OBSERVATION_MAX_AGE_MINUTES = 90;
const OBSERVATION_MAX_DISTANCE_KM = 50;
const OBSERVATION_MAX_BLEND = 0.8;
const RAIN_GAUGE_MAX_DISTANCE_KM = 25;
const PRECIPITATION_WEATHER_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const FIELD_LIMITS = {
  temperature: [-70, 60],
  apparentTemperature: [-85, 75],
  dewPoint: [-85, 45],
  precipitation: [0, 250],
  precipitationProbability: [0, 100],
  windSpeed: [0, 250],
  windDirection: [0, 360],
  windGust: [0, 350],
  humidity: [0, 100],
  pressure: [870, 1085],
  cloudCover: [0, 100],
  fogArea: [0, 100],
  visibility: [0, 100000],
  uvIndex: [0, 20],
};
const OUTLIER_TOLERANCE = {
  temperature: 4,
  apparentTemperature: 5,
  dewPoint: 6,
  precipitation: 25,
  precipitationProbability: 45,
  windSpeed: 18,
  windGust: 30,
  humidity: 30,
  pressure: 12,
  cloudCover: 45,
  fogArea: 45,
  visibility: 20000,
  uvIndex: 4,
};
const FIELD_LABELS = {
  temperature: 'teplota',
  apparentTemperature: 'pocitově',
  dewPoint: 'rosný bod',
  precipitation: 'srážky',
  precipitationProbability: 'pravděpodobnost srážek',
  windSpeed: 'vítr',
  windDirection: 'směr větru',
  windGust: 'nárazy větru',
  humidity: 'vlhkost',
  pressure: 'tlak',
  cloudCover: 'oblačnost',
  fogArea: 'mlha',
  visibility: 'viditelnost',
  uvIndex: 'UV',
};

function sourceWeight(source) {
  const weight = numberOrNull(source?.weight);
  // Stations carry weight 0, but when they are the only data left they still have to count.
  return weight !== null && weight > 0 ? weight : 1;
}

function confidenceFrom(divergence) {
  if (divergence < 1) return 'high';
  if (divergence < 2.5) return 'medium';
  return 'low';
}

function hasNumber(value) {
  return Number.isFinite(numberOrNull(value));
}

export function withDerivedMetrics(value) {
  const next = { ...value };
  const derivedFields = { ...(value?.derivedFields || {}) };

  const sunriseMins = toLocalDayMinutes(next.sunrise);
  if (sunriseMins !== null) next.sunrise = sunriseMins;
  const sunsetMins = toLocalDayMinutes(next.sunset);
  if (sunsetMins !== null) next.sunset = sunsetMins;

  if (!hasNumber(next.dewPoint)) {
    const dewPoint = calculateDewPoint(next.temperature, next.humidity);
    if (hasNumber(dewPoint)) {
      next.dewPoint = dewPoint;
      derivedFields.dewPoint = true;
    }
  }

  if (!hasNumber(next.apparentTemperature)) {
    const apparentTemperature = calculateApparentTemperature(next.temperature, next.humidity, next.windSpeed);
    if (hasNumber(apparentTemperature)) {
      next.apparentTemperature = apparentTemperature;
      derivedFields.apparentTemperature = true;
    }
  }

  if (!hasNumber(next.wetBulbTemperature)) {
    const wetBulbTemperature = calculateWetBulbTemperature(next.temperature, next.humidity);
    if (hasNumber(wetBulbTemperature)) {
      next.wetBulbTemperature = wetBulbTemperature;
      derivedFields.wetBulbTemperature = true;
    }
  }

  if (!hasNumber(next.vaporPressureDeficit)) {
    const vaporPressureDeficit = calculateVaporPressureDeficit(next.temperature, next.humidity);
    if (hasNumber(vaporPressureDeficit)) {
      next.vaporPressureDeficit = vaporPressureDeficit;
      derivedFields.vaporPressureDeficit = true;
    }
  }

  if (!hasNumber(next.absoluteHumidity)) {
    const absoluteHumidity = calculateAbsoluteHumidity(next.temperature, next.humidity);
    if (hasNumber(absoluteHumidity)) {
      next.absoluteHumidity = absoluteHumidity;
      derivedFields.absoluteHumidity = true;
    }
  }

  const directWeatherCode = normalizeWmoWeatherCode(next.weatherCode) ?? iconNameToWeatherCode(next.iconName ?? next.symbolCode);
  if (directWeatherCode !== null) {
    next.weatherCode = directWeatherCode;
  } else {
    const weatherCode = inferWeatherCode(next);
    if (hasNumber(weatherCode)) {
      next.weatherCode = weatherCode;
      derivedFields.weatherCode = true;
    } else {
      next.weatherCode = null;
    }
  }

  return { ...next, derivedFields };
}

function resolveProviderUrl(provider) {
  if (provider.url) return provider.url;
  if (provider.endpoint || provider.model) return 'https://open-meteo.com/en/docs';
  return null;
}

export function publicSource(provider, value, status) {
  const enriched = withDerivedMetrics(value || {});

  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    url: resolveProviderUrl(provider),
    attribution: enriched.attribution || provider.attribution,
    weight: provider.weight,
    status,
    temperature: enriched.temperature,
    apparentTemperature: enriched.apparentTemperature,
    dewPoint: enriched.dewPoint,
    wetBulbTemperature: enriched.wetBulbTemperature,
    precipitation: enriched.precipitation,
    precipitationIntervalMinutes: enriched.precipitationIntervalMinutes ?? null,
    observedAt: enriched.observedAt ?? null,
    fetchedAt: enriched.fetchedAt ?? null,
    stationName: enriched.stationName ?? null,
    stationId: enriched.stationId ?? null,
    distanceKm: enriched.distanceKm ?? null,
    windSpeed: enriched.windSpeed,
    windDirection: enriched.windDirection,
    windGust: enriched.windGust,
    humidity: enriched.humidity,
    pressure: enriched.pressure,
    cloudCover: enriched.cloudCover,
    visibility: enriched.visibility,
    uvIndex: enriched.uvIndex,
    vaporPressureDeficit: enriched.vaporPressureDeficit,
    absoluteHumidity: enriched.absoluteHumidity,
    weatherCode: enriched.weatherCode,
    temperatureSpread: enriched.temperatureSpread,
    precipitationProbability: enriched.precipitationProbability,
    precipitationMin: enriched.precipitationMin,
    precipitationMax: enriched.precipitationMax,
    cloudCoverLow: enriched.cloudCoverLow,
    cloudCoverMedium: enriched.cloudCoverMedium,
    cloudCoverHigh: enriched.cloudCoverHigh,
    fogArea: enriched.fogArea,
    sunrise: enriched.sunrise,
    sunset: enriched.sunset,
    symbolCode: enriched.symbolCode,
    iconName: enriched.iconName,
    tafSummary: enriched.tafSummary || null,
    derivedFields: enriched.derivedFields,
    qualityIssues: [...(enriched.qualityIssues || [])]
  };
}

export function pendingSources() {
  return PROVIDERS
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      url: resolveProviderUrl(provider),
      attribution: provider.attribution,
      status: 'pending'
    }));
}

export function locationInCoverage(provider, location) {
  const coverage = provider.coverage;
  if (!coverage) return true;

  return (
    location.lat >= coverage.latMin &&
    location.lat <= coverage.latMax &&
    location.lon >= coverage.lonMin &&
    location.lon <= coverage.lonMax
  );
}

function fieldWithinLimits(field, value) {
  const limits = FIELD_LIMITS[field];
  if (!limits) return true;
  return value >= limits[0] && value <= limits[1];
}

function hasPrecipitationSignal(source) {
  const precipitation = numberOrNull(source.precipitation);
  const probability = numberOrNull(source.precipitationProbability);
  const weatherCode = numberOrNull(source.weatherCode);

  return (
    (precipitation !== null && precipitation > 0) ||
    (probability !== null && probability >= 60) ||
    (weatherCode !== null && PRECIPITATION_WEATHER_CODES.has(weatherCode))
  );
}

function fieldContradictsSource(source, field, value) {
  if ((field === 'humidity' || field === 'cloudCover') && value <= 2 && hasPrecipitationSignal(source)) return true;
  return false;
}

function addQualityIssue(source, field, reason) {
  const label = FIELD_LABELS[field] || field;
  const issue = reason === 'outlier' ? `${label} mimo shodu` : `${label} mimo rozsah`;
  if (!source.qualityIssues.includes(issue)) source.qualityIssues.push(issue);
}

function numericEntriesForField(sources, field) {
  return sources.flatMap((source) => {
    const value = numberOrNull(source[field]);
    if (value === null) return [];

    if (!fieldWithinLimits(field, value) || fieldContradictsSource(source, field, value)) {
      addQualityIssue(source, field, 'invalid');
      return [];
    }

    return [{ source, value, weight: sourceWeight(source) }];
  });
}

function robustEntriesForField(sources, field) {
  const entries = numericEntriesForField(sources, field);
  const { kept, rejected } = partitionOutliers(entries, OUTLIER_TOLERANCE[field]);
  rejected.forEach((entry: any) => addQualityIssue(entry.source, field, 'outlier'));
  return kept;
}

/** Direction of the mean wind vector: a calm model's direction is noise and must not outvote a windy one. */
function windDirectionMean(entries) {
  return weightedCircularMean(entries.map((entry) => ({
    value: entry.value,
    weight: entry.weight * Math.max(numberOrNull(entry.source.windSpeed) ?? 1, 1),
  })));
}

function stationEvidence(sources, now) {
  return sources.flatMap((source) => {
    if (source.status !== 'ok' || !OBSERVATION_SOURCE_IDS.has(source.id)) return [];
    const distanceKm = numberOrNull(source.distanceKm);
    const observedAt = source.observedAt ? Date.parse(source.observedAt) : NaN;
    if (distanceKm === null || distanceKm > OBSERVATION_MAX_DISTANCE_KM || !Number.isFinite(observedAt)) return [];
    const ageMinutes = Math.max(0, (now - observedAt) / 60000);
    if (ageMinutes > OBSERVATION_MAX_AGE_MINUTES) return [];
    const trust = PERSONAL_STATION_IDS.has(source.id) ? 0.4 : 1;
    return [{ source, weight: trust * Math.exp(-distanceKm / 25) * Math.exp(-ageMinutes / 60) }];
  });
}

/**
 * Models say what the air should be doing, stations measure what it is doing. Nudge the "now" values
 * towards fresh nearby measurements: a close station can carry most of the value, a far one barely moves it.
 * Forecast series stay model-only.
 */
function blendObservations(consensus, sources, now) {
  const evidence = stationEvidence(sources, now);
  const modelTemperature = numberOrNull(consensus.temperature);
  const blended: Record<string, { value: number; weight: number; entries: any[] }> = {};

  for (const field of OBSERVATION_BLEND_FIELDS) {
    const modelValue = numberOrNull(consensus[field]);
    if (modelValue === null) continue;
    const entries = evidence.flatMap(({ source, weight }) => {
      const value = numberOrNull(source[field]);
      // Too far from every model to be the same air: a mountain-top station, a sensor in the sun, a bad feed.
      if (value === null || !fieldWithinLimits(field, value) || Math.abs(value - modelValue) > OUTLIER_TOLERANCE[field]) {
        return [];
      }
      return [{ source, value, weight }];
    });
    if (!entries.length) continue;

    const observed = robustMean(entries);
    const blendWeight = Math.min(
      OBSERVATION_MAX_BLEND,
      1 - entries.reduce((remaining, entry) => remaining * (1 - 0.8 * entry.weight), 1),
    );
    consensus[field] = modelValue + (observed - modelValue) * blendWeight;
    blended[field] = { value: observed, weight: blendWeight, entries };
  }

  if (blended.temperature && hasNumber(consensus.apparentTemperature)) {
    consensus.apparentTemperature += consensus.temperature - modelTemperature;
  }

  return blended;
}

/**
 * Everything here follows from the final temperature and dew point. Averaging it per source would count one
 * calculation as twenty opinions and leave numbers on screen that contradict each other. Dew point is the base
 * because against ČHMÚ stations it beat averaging humidity directly, on both humidity and dew point.
 */
function deriveHumidityValues(consensus) {
  const humidity = calculateRelativeHumidity(consensus.temperature, consensus.dewPoint);
  if (humidity !== null) consensus.humidity = humidity;
  consensus.wetBulbTemperature = calculateWetBulbTemperature(consensus.temperature, consensus.humidity);
  consensus.vaporPressureDeficit = calculateVaporPressureDeficit(consensus.temperature, consensus.humidity);
  consensus.absoluteHumidity = calculateAbsoluteHumidity(consensus.temperature, consensus.humidity);
}

/**
 * Sunrise and sunset are astronomy, so sources differ only by rounding and by the coordinates they snapped to.
 * Open-Meteo computes them for the exact point we asked about.
 */
function sunTimesSource(sources) {
  const complete = sources.filter((source) => hasNumber(source.sunrise) && hasNumber(source.sunset));
  return complete.find((source) => OPEN_METEO_SOURCE_IDS.has(source.id)) ?? complete[0] ?? null;
}

/** Fresh rain gauges outrank what the models expected to be happening right now. */
function reconcileWeatherCode(code, currentRain, temperature) {
  if (code === null) return code;
  const expectsPrecipitation = PRECIPITATION_WEATHER_CODES.has(code);
  const freezing = numberOrNull(temperature) !== null && temperature <= 0;

  if (currentRain.state === 'raining' && !expectsPrecipitation) {
    const heavy = (currentRain.observedMm60 ?? 0) >= 2.5;
    if (freezing) return heavy ? 73 : 71;
    return heavy ? 63 : 61;
  }
  // Unheated gauges stay at zero through snowfall, so only trust the "dry" reading above freezing.
  if (currentRain.state === 'not-raining' && expectsPrecipitation && code < 95 && numberOrNull(temperature) > 2) {
    return 3;
  }
  return code;
}

export function buildResult(settled, now = Date.now()) {
  const enabledProviders = PROVIDERS.filter((provider) => provider.enabled);
  let aladin = null;
  const forecastSeries = [];
  const sources = settled.map((result, index) => {
    const provider = enabledProviders[index];
    if (!result || result.value?.providerStatus === 'pending') {
      return {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        url: resolveProviderUrl(provider),
        attribution: provider.attribution,
        weight: provider.weight,
        status: 'pending'
      };
    }

    if (result.status === 'rejected') {
      return {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        attribution: provider.attribution,
        status: 'error',
        error: result.reason?.message || 'Request failed.'
      };
    }

    if (result.value?.providerStatus === 'not-applicable') {
      return {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        attribution: provider.attribution,
        status: 'not-applicable',
        error: result.value.error
      };
    }

    const value = withDerivedMetrics(result.value || {});
    if (provider.id === 'aladin') aladin = value.raw || null;
    const series = extractForecastSeries(provider, value, OBSERVATION_SOURCE_IDS);
    if (series) forecastSeries.push(series);
    const status = Number.isFinite(numberOrNull(value.temperature)) ? 'ok' : 'no-data';
    return publicSource(provider, value, status);
  });

  const okSources = sources.filter((source) => source.status === 'ok');
  const forecastSources = okSources.filter((source) => !OBSERVATION_SOURCE_IDS.has(source.id));
  const consensusSources = forecastSources.length ? forecastSources : okSources;
  const includedSourceIds = new Set();
  const entriesByField = new Map();
  const consensus = Object.fromEntries(FIELDS.map((field) => {
    const entries = field === 'windDirection'
      ? numericEntriesForField(consensusSources, field)
      : robustEntriesForField(consensusSources, field);
    entriesByField.set(field, entries);
    entries.forEach((entry) => includedSourceIds.add(entry.source.id));

    return [field, field === 'windDirection' ? windDirectionMean(entries) : robustMean(entries)];
  }));
  const weatherCodeEntries = consensusSources
    .map((source) => ({ source, value: numberOrNull(source.weatherCode), weight: sourceWeight(source) }))
    .filter((entry) => entry.value !== null);
  weatherCodeEntries.forEach((entry) => includedSourceIds.add(entry.source.id));
  consensus.weatherCode = weatherCodeConsensus(weatherCodeEntries);
  const precipitationGroups = buildPrecipitationGroups(sources);
  const precipitationGroupEntries = Object.values(precipitationGroups as Record<string, { value: number | null }>)
    .filter((group) => group.value !== null)
    .map((group) => ({ value: group.value as number, weight: 1 }));
  consensus.precipitation = weightedMean(precipitationGroupEntries);
  const currentRain = buildCurrentRain(sources, now);
  const divergence = weightedStandardDeviation(entriesByField.get('temperature') || []);
  const blended = forecastSources.length ? blendObservations(consensus, sources, now) : {};
  deriveHumidityValues(consensus);
  const sunSource = sunTimesSource(consensusSources);
  consensus.sunrise = sunSource?.sunrise ?? null;
  consensus.sunset = sunSource?.sunset ?? null;
  consensus.weatherCode = reconcileWeatherCode(consensus.weatherCode, currentRain, consensus.temperature);
  Object.values(blended).forEach(({ entries }) => {
    entries.forEach((entry) => includedSourceIds.add(entry.source.id));
  });
  const includedSources = sources.map((source) => ({
    ...source,
    included: includedSourceIds.has(source.id)
  }));

  // Per-field inputs that survived outlier filtering (what the consensus value is built from).
  const fieldSources = Object.fromEntries(
    [...entriesByField.entries()].map(([field, entries]) => [field, serializeFieldEntries(entries)]),
  );
  for (const [field, { entries }] of Object.entries(blended)) {
    fieldSources[field] = [...fieldSources[field], ...serializeFieldEntries(entries)];
  }
  // Stations reach humidity through the dew point, so name them under humidity too, with the value they measured.
  const humidityStations = (blended.dewPoint?.entries ?? [])
    .filter((entry) => hasNumber(entry.source.humidity))
    .map((entry) => ({ ...entry, value: entry.source.humidity }));
  fieldSources.humidity = [...fieldSources.humidity, ...serializeFieldEntries(humidityStations)];
  if (sunSource) {
    fieldSources.sunrise = serializeFieldEntries([{ source: sunSource, value: sunSource.sunrise, weight: 1 }]);
    fieldSources.sunset = serializeFieldEntries([{ source: sunSource, value: sunSource.sunset, weight: 1 }]);
  }
  fieldSources.weatherCode = serializeFieldEntries(weatherCodeEntries);
  fieldSources.precipitationGroups = precipitationGroups;

  return {
    consensus,
    currentRain,
    precipitationGroups,
    sources: includedSources,
    fieldSources,
    observationBlend: Object.fromEntries(
      Object.entries(blended).map(([field, { value, weight, entries }]) => [field, { value, weight, stations: entries.length }]),
    ),
    divergence,
    confidence: confidenceFrom(divergence),
    includedSourceIds: [...includedSourceIds],
    aladin,
    forecastSeries,
    updatedAt: new Date().toISOString()
  };
}

const OPEN_METEO_SOURCE_IDS = new Set([
  'ecmwf_ifs', 'ecmwf_aifs', 'icon_seamless', 'icon_d2', 'icon_eu_eps_mean', 'arome', 'arpege',
  'gfs', 'graphcast', 'gefs025_mean', 'gem', 'gem_geps_mean', 'ecmwf_ifs_eps_mean', 'jma', 'cma',
  'knmi_harmonie', 'dmi_harmonie',
]);

/** mm/h, whatever interval the source reports over. */
function precipitationRate(source) {
  const value = numberOrNull(source.precipitation);
  if (value === null || !fieldWithinLimits('precipitation', value)) return null;
  const interval = numberOrNull(source.precipitationIntervalMinutes);
  return interval ? value * (60 / interval) : value;
}

export function buildPrecipitationGroups(sources) {
  const forecastSources = sources.filter((source) => source.status === 'ok' && !OBSERVATION_SOURCE_IDS.has(source.id));
  const groups = [
    ['openMeteo', forecastSources.filter((source) => OPEN_METEO_SOURCE_IDS.has(source.id))],
    ['otherForecast', forecastSources.filter((source) => !OPEN_METEO_SOURCE_IDS.has(source.id))],
  ];
  return Object.fromEntries(groups.map(([id, groupSources]) => {
    const { kept: entries } = partitionOutliers(groupSources.flatMap((source) => {
      const value = precipitationRate(source);
      return value === null ? [] : [{ source, value, weight: sourceWeight(source) }];
    }), OUTLIER_TOLERANCE.precipitation);
    return [id, {
      value: weightedMean(entries),
      sourceIds: entries.map((entry: any) => entry.source.id),
      sources: serializeFieldEntries(entries),
    }];
  }));
}

export function buildCurrentRain(sources, now = Date.now()) {
  const observations = sources.filter((source) => OBSERVATION_SOURCE_IDS.has(source.id) && source.status === 'ok');
  const evidence = observations.flatMap((source) => {
    const value = numberOrNull(source.precipitation);
    const observedAt = source.observedAt ? Date.parse(source.observedAt) : NaN;
    const ageMinutes = Number.isFinite(observedAt) ? Math.max(0, (now - observedAt) / 60000) : null;
    // The ČHMÚ 10-minute feed itself lags by about half an hour.
    const maxAge = source.id === 'chmi' ? 45 : 90;
    const distanceKm = numberOrNull(source.distanceKm);
    if (value === null || ageMinutes === null || ageMinutes > maxAge) return [];
    // Rain is too local for a gauge further away to say anything about this place.
    if (distanceKm !== null && distanceKm > RAIN_GAUGE_MAX_DISTANCE_KM) return [];
    return [{
      sourceId: source.id,
      sourceName: source.name,
      value,
      intervalMinutes: source.precipitationIntervalMinutes ?? null,
      observedAt: source.observedAt,
      distanceKm: source.distanceKm ?? null,
      ageMinutes: Math.round(ageMinutes),
      weight: (source.id === 'chmi' ? 1 : 0.6) * Math.exp(-(distanceKm ?? 0) / RAIN_GAUGE_MAX_DISTANCE_KM),
    }];
  });
  const positive = evidence.filter((entry) => entry.value > 0);
  const observedMm60 = positive.length
    ? weightedMean(positive.map((entry) => ({
        value: entry.intervalMinutes ? entry.value * (60 / entry.intervalMinutes) : entry.value,
        weight: entry.weight,
      })))
    : null;
  let state = 'unknown';
  if (positive.some((entry) => entry.sourceId === 'chmi')) state = 'raining';
  else if (positive.length >= 2) state = 'raining';
  else if (positive.length === 1) state = 'probably-raining';
  else if (evidence.length >= 2) state = 'not-raining';
  return {
    state,
    confidence: positive.length >= 2 ? 0.9 : positive.length === 1 ? 0.65 : evidence.length >= 2 ? 0.7 : 0.25,
    observedMm60,
    evidence,
    updatedAt: evidence.length ? evidence.map((entry) => entry.observedAt).sort().at(-1) : null,
  };
}

function serializeFieldEntries(entries) {
  return entries.map(({ source, value, weight }) => ({
    id: source.id,
    name: source.name,
    url: source.url || undefined,
    value,
    weight,
    precipitationIntervalMinutes: source.precipitationIntervalMinutes ?? undefined,
    observedAt: source.observedAt ?? undefined,
    fetchedAt: source.fetchedAt ?? undefined,
    distanceKm: source.distanceKm ?? undefined,
  }));
}

