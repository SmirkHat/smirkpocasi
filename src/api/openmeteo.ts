import { normalizeOpenMeteo } from './normalizers/openmeteo';
import { apiUrl } from '@/lib/apiBase'

const OPEN_METEO_HOST = 'https://api.open-meteo.com';
const ENSEMBLE_METEO_HOST = 'https://ensemble-api.open-meteo.com';
const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const OPEN_METEO_DEV_PROXY_ENABLED = Boolean(viteEnv.DEV) && viteEnv.VITE_ENABLE_OPEN_METEO_DEV_PROXY === 'true';
const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'surface_pressure',
  'cloud_cover',
  'visibility'
].join(',');

async function fetchOpenMeteoJson(url) {
  const requestUrl = OPEN_METEO_DEV_PROXY_ENABLED
    ? apiUrl(`/api/openmeteo-proxy?url=${encodeURIComponent(url)}`)
    : url;
  const response = await fetch(requestUrl);
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.error) {
    throw new Error(data?.reason || data?.error || 'Open-Meteo request failed.');
  }

  return data;
}
const ENSEMBLE_MEAN_FIELDS = [
  'temperature_2m',
  'temperature_2m_spread',
  'apparent_temperature',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'pressure_msl',
  'surface_pressure',
  'cloud_cover',
  'visibility',
  'uv_index'
].join(',');

export async function fetchOpenMeteo(location) {
  const response = await fetch(apiUrl(`/api/weather?lat=${location.lat}&lon=${location.lon}`));

  if (!response.ok) throw new Error('Open-Meteo request failed.');

  return normalizeOpenMeteo(await response.json());
}

export async function fetchOpenMeteoModel(location, provider) {
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    current: CURRENT_FIELDS,
    hourly: CURRENT_FIELDS,
    timezone: 'Europe/Prague',
    forecast_days: '7'
  });

  if (provider.model) params.set('models', provider.model);

  return normalizeOpenMeteo(await fetchOpenMeteoJson(`${OPEN_METEO_HOST}${provider.endpoint}?${params}`));
}

export async function fetchOpenMeteoEnsembleMean(location, provider) {
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    models: provider.model,
    hourly: ENSEMBLE_MEAN_FIELDS,
    timezone: 'Europe/Prague',
    forecast_days: '7'
  });

  return normalizeOpenMeteo(await fetchOpenMeteoJson(`${ENSEMBLE_METEO_HOST}/v1/ensemble?${params}`));
}
