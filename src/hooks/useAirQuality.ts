import { useEffect, useState } from 'react';
import { fetchAQI } from '../api/aqi';
import { normalizeOpenWeatherMapPollution } from '../api/normalizers/openweathermap';
import { locationInCzechiaCoverage } from '../utils/geo';
import { apiUrl } from '@/lib/apiBase'

async function fetchChmiAqi(lat, lon) {
  const response = await fetch(apiUrl(`/api/chmi-aqi?lat=${lat}&lon=${lon}`));
  if (!response.ok) throw new Error('ČHMÚ AQI unavailable');
  return response.json();
}

async function fetchOwmPollution(lat, lon) {
  const params = new URLSearchParams({ lat, lon, parts: 'pollution' });
  const response = await fetch(apiUrl(`/api/openweathermap?${params}`));
  if (response.status === 501) return null;
  if (!response.ok) throw new Error('OpenWeatherMap AQI unavailable');
  const data = await response.json();
  return normalizeOpenWeatherMapPollution(data.pollution);
}

function round(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Inverse-distance weighted mean for a numeric field on station readings. */
function idwMean(stations, key, power = 2) {
  let numerator = 0;
  let denominator = 0;

  for (const reading of stations || []) {
    const value = Number(reading?.[key]);
    const distanceKm = Number(reading?.station?.distanceKm);
    if (!Number.isFinite(value) || !Number.isFinite(distanceKm)) continue;
    const weight = 1 / Math.max(distanceKm, 0.5) ** power;
    numerator += value * weight;
    denominator += weight;
  }

  return denominator > 0 ? numerator / denominator : null;
}

function nearestDistanceKm(stations) {
  const distances = (stations || [])
    .map((reading) => Number(reading?.station?.distanceKm))
    .filter(Number.isFinite);
  return distances.length ? Math.min(...distances) : null;
}

/** How much to trust ČHMÚ station IDW vs model AQI at this point. */
function chmiBlendWeight(nearestKm) {
  if (!Number.isFinite(nearestKm)) return 0;
  if (nearestKm <= 5) return 0.8;
  if (nearestKm <= 15) return 0.65;
  if (nearestKm <= 35) return 0.5;
  if (nearestKm <= 60) return 0.35;
  return 0.2;
}

function blendNumber(chmiValue, openValue, chmiWeight) {
  const hasChmi = Number.isFinite(chmiValue);
  const hasOpen = Number.isFinite(openValue);
  if (hasChmi && hasOpen) return chmiValue * chmiWeight + openValue * (1 - chmiWeight);
  if (hasChmi) return chmiValue;
  if (hasOpen) return openValue;
  return null;
}

/** Average finite model values (CAMS + OWM pollutants), equal weight. */
function meanModels(...values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function indexLabelFromValue(indexValue) {
  if (!Number.isFinite(indexValue)) return null;
  if (indexValue < 0.34) return { label: 'Velmi dobrá až dobrá', level: '1A' };
  if (indexValue < 0.67) return { label: 'Velmi dobrá až dobrá', level: '1B' };
  if (indexValue < 1) return { label: 'Přijatelná', level: '2A' };
  if (indexValue < 1.5) return { label: 'Přijatelná', level: '2B' };
  if (indexValue < 2) return { label: 'Zhoršená až špatná', level: '3A' };
  return { label: 'Zhoršená až špatná', level: '3B' };
}

function aggregatePointAirQuality(chmiPayload, openPayload, owmPayload) {
  const stations = chmiPayload?.stations || [];
  const nearestKm = nearestDistanceKm(stations);
  const chmiWeight = chmiBlendWeight(nearestKm);

  const chmi = {
    aqi: idwMean(stations, 'aqi'),
    indexValue: idwMean(stations, 'indexValue'),
    pm10: idwMean(stations, 'pm10'),
    pm25: idwMean(stations, 'pm25'),
    no2: idwMean(stations, 'no2'),
    o3: idwMean(stations, 'o3'),
    so2: idwMean(stations, 'so2'),
  };

  // Blend CAMS + OWM pollutant concentrations first, then with ČHMÚ.
  // Do not blend OWM 1–5 AQI index with EAQI.
  const model = {
    aqi: openPayload?.aqi ?? null,
    pm10: meanModels(openPayload?.pm10, owmPayload?.pm10),
    pm25: meanModels(openPayload?.pm25, owmPayload?.pm25),
    no2: meanModels(openPayload?.no2, owmPayload?.no2),
    o3: meanModels(openPayload?.o3, owmPayload?.o3),
    so2: meanModels(openPayload?.so2, owmPayload?.so2),
  };

  const aqi = round(blendNumber(chmi.aqi, model.aqi, chmiWeight));
  const indexValue = chmi.indexValue;
  const indexMeta = indexLabelFromValue(indexValue);

  const sources = [];
  if (stations.length) sources.push('ČHMÚ');
  if (openPayload) sources.push('Open-Meteo CAMS');
  if (owmPayload) sources.push('OpenWeatherMap');

  return {
    aqi,
    indexValue: indexValue != null ? round(indexValue, 2) : null,
    indexLevel: indexMeta?.level ?? null,
    label: indexMeta?.label ?? null,
    pm10: round(blendNumber(chmi.pm10, model.pm10, chmiWeight), 1),
    pm25: round(blendNumber(chmi.pm25, model.pm25, chmiWeight), 1),
    no2: round(blendNumber(chmi.no2, model.no2, chmiWeight), 1),
    o3: round(blendNumber(chmi.o3, model.o3, chmiWeight), 1),
    so2: round(blendNumber(chmi.so2, model.so2, chmiWeight), 1),
    updatedAt: openPayload?.updatedAt || owmPayload?.updatedAt || chmiPayload?.updatedAt || null,
    attribution: sources.length ? `Data: ${sources.join(' + ')}` : null,
    nearestKm: nearestKm != null ? round(nearestKm, 1) : null,
  };
}

export function useAirQuality(location) {
  const lat = location?.lat;
  const lon = location?.lon;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lat || !lon) {
      setLoading(false);
      return undefined;
    }

    let ignore = false;
    setLoading(true);
    setError(null);

    const useChmi = locationInCzechiaCoverage({ lat, lon });

    Promise.all([
      useChmi ? fetchChmiAqi(lat, lon).catch(() => null) : Promise.resolve(null),
      fetchAQI(lat, lon).catch(() => null),
      fetchOwmPollution(lat, lon).catch(() => null),
    ])
      .then(([chmiPayload, openPayload, owmPayload]) => {
        if (ignore) return;
        if (!chmiPayload?.stations?.length && !openPayload && !owmPayload) {
          setData(null);
          setError('Data o kvalitě ovzduší nejsou dostupná.');
          return;
        }
        setData(aggregatePointAirQuality(chmiPayload, openPayload, owmPayload));
      })
      .catch((err) => {
        if (!ignore) {
          setData(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [lat, lon]);

  return { data, loading, error };
}
