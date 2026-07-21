/** Pure consensus math + result builder (client + server). */
import { PROVIDERS } from '../config/providers';
import { extractForecastSeries } from './forecastSeries';
import {
  calculateAbsoluteHumidity,
  calculateApparentTemperature,
  calculateDewPoint,
  calculateVaporPressureDeficit,
  calculateWetBulbTemperature,
  iconNameToWeatherCode,
  inferWeatherCode,
  normalizeWmoWeatherCode,
  numberOrNull
} from './weatherMath';

const FIELDS = [
  'temperature',
  'apparentTemperature',
  'dewPoint',
  'wetBulbTemperature',
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
  'vaporPressureDeficit',
  'absoluteHumidity'
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
const PRECIPITATION_WEATHER_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const FIELD_LIMITS = {
  temperature: [-70, 60],
  apparentTemperature: [-85, 75],
  dewPoint: [-85, 45],
  wetBulbTemperature: [-85, 50],
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
  vaporPressureDeficit: [0, 20],
  absoluteHumidity: [0, 80]
};
const OUTLIER_TOLERANCE = {
  temperature: 4,
  apparentTemperature: 5,
  dewPoint: 6,
  wetBulbTemperature: 5,
  precipitation: 3,
  precipitationProbability: 45,
  windSpeed: 18,
  windGust: 30,
  humidity: 30,
  pressure: 12,
  cloudCover: 45,
  fogArea: 45,
  visibility: 20000,
  uvIndex: 4,
  vaporPressureDeficit: 1.2,
  absoluteHumidity: 5
};
const FIELD_LABELS = {
  temperature: 'teplota',
  apparentTemperature: 'pocitově',
  dewPoint: 'rosný bod',
  wetBulbTemperature: 'mokrá teplota',
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
  vaporPressureDeficit: 'VPD',
  absoluteHumidity: 'abs. vlhkost'
};

function numbers(values) {
  return values.map(numberOrNull).filter((value) => Number.isFinite(value));
}

function median(values) {
  const sorted = [...numbers(values)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sourceWeight(source) {
  const weight = numberOrNull(source?.weight);
  return weight !== null && weight >= 0 ? weight : 1;
}

function weightedMedian(entries) {
  const usable = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
  if (!usable.length) return null;

  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  let weightSoFar = 0;

  for (const entry of sorted) {
    weightSoFar += entry.weight;
    if (weightSoFar >= totalWeight / 2) return entry.value;
  }

  return sorted[sorted.length - 1].value;
}

function weightedMode(entries) {
  const counts = new Map();
  entries.forEach((entry) => {
    if (!Number.isFinite(entry.value)) return;
    counts.set(entry.value, (counts.get(entry.value) || 0) + entry.weight);
  });

  if (!counts.size) return null;

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function weightedStandardDeviation(entries) {
  const usable = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
  if (usable.length < 2) return 0;

  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);
  const average = usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
  const variance = usable.reduce((sum, entry) => sum + (entry.value - average) ** 2 * entry.weight, 0) / totalWeight;
  return Math.sqrt(variance);
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
    distanceKm: enriched.distanceKm,
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
  const baseTolerance = OUTLIER_TOLERANCE[field];
  if (entries.length < 4 || !baseTolerance) return entries;

  const center = weightedMedian(entries);
  if (center === null) return entries;

  const mad = median(entries.map((entry) => Math.abs(entry.value - center))) || 0;
  const tolerance = Math.max(baseTolerance, mad * 4);
  const filtered = entries.filter((entry) => Math.abs(entry.value - center) <= tolerance);

  if (filtered.length < Math.max(2, Math.ceil(entries.length / 2))) return entries;

  entries
    .filter((entry) => !filtered.includes(entry))
    .forEach((entry) => addQualityIssue(entry.source, field, 'outlier'));

  return filtered;
}

function weightedCircularMean(entries) {
  const usable = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
  if (!usable.length) return null;

  const vector = usable.reduce(
    (sum, entry) => {
      const radians = (entry.value * Math.PI) / 180;
      return {
        sin: sum.sin + Math.sin(radians) * entry.weight,
        cos: sum.cos + Math.cos(radians) * entry.weight
      };
    },
    { sin: 0, cos: 0 }
  );

  if (Math.abs(vector.sin) < 0.0001 && Math.abs(vector.cos) < 0.0001) return weightedMedian(usable);
  return (Math.atan2(vector.sin, vector.cos) * 180 / Math.PI + 360) % 360;
}

export function buildResult(settled) {
  const enabledProviders = PROVIDERS.filter((provider) => provider.enabled);
  let aladin = null;
  let yr = null;
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
    if (provider.id === 'yr') yr = value.raw || null;
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

    return [field, field === 'windDirection' ? weightedCircularMean(entries) : weightedMedian(entries)];
  }));
  const weatherCodeEntries = consensusSources
    .map((source) => ({ source, value: numberOrNull(source.weatherCode), weight: sourceWeight(source) }))
    .filter((entry) => entry.value !== null);
  weatherCodeEntries.forEach((entry) => includedSourceIds.add(entry.source.id));
  consensus.weatherCode = weightedMode(weatherCodeEntries);
  const divergence = weightedStandardDeviation(entriesByField.get('temperature') || []);
  const includedSources = sources.map((source) => ({
    ...source,
    included: includedSourceIds.has(source.id)
  }));

  return {
    consensus,
    sources: includedSources,
    divergence,
    confidence: confidenceFrom(divergence),
    includedSourceIds: [...includedSourceIds],
    aladin,
    yr,
    forecastSeries,
    updatedAt: new Date().toISOString()
  };
}

