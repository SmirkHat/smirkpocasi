import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/apiBase'

const IMAGE_LOOKUP_VERSION = 'v22';
const CACHE_KEY = `smirkpocasi:place-image:${IMAGE_LOOKUP_VERSION}`;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_STORED_IMAGES = 30;

/** AppChrome and HomePage both ask for the same photo; they must not fetch or flicker separately. */
const knownImages = new Map();
const pendingImages = new Map();
let oldCachesRemoved = false;

function cacheKey(location) {
  if (location?.lat == null || location?.lon == null) return null;
  const title = String(location.name || '')
    .split(',')[0]
    .trim()
    .toLocaleLowerCase('cs-CZ');
  // Coarse on purpose: GPS refining the position inside one town keeps its photo.
  return `${Number(location.lat).toFixed(1)},${Number(location.lon).toFixed(1)}:${title}`;
}

function readStoredImages() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function readKnownImage(key) {
  if (knownImages.has(key)) return knownImages.get(key);
  if (typeof window === 'undefined') return undefined;
  const item = readStoredImages()[key];
  if (!item || Date.now() - item.updatedAt > CACHE_TTL) return undefined;
  knownImages.set(key, item.data);
  return item.data;
}

function storeImage(key, data) {
  const entries = Object.entries({ ...readStoredImages(), [key]: { data, updatedAt: Date.now() } })
    .filter(([, item]: [string, any]) => Date.now() - item.updatedAt <= CACHE_TTL)
    .sort(([, a]: [string, any], [, b]: [string, any]) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_IMAGES);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

function removeOldImageCaches() {
  if (oldCachesRemoved) return;
  oldCachesRemoved = true;
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('smirkpocasi:place-image:') && key !== CACHE_KEY)
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Cache cleanup is best-effort; a blocked storage should not break weather data.
  }
}

async function fetchImage(key, location) {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lon),
    name: location.fullName || location.name || '',
    version: IMAGE_LOOKUP_VERSION,
  });
  const response = await fetch(apiUrl(`/api/place-image?${params}`));
  if (!response.ok) throw new Error('Obrázek místa se nepodařilo načíst.');
  const image = await response.json();
  const data = image?.imageUrl ? image : null;
  knownImages.set(key, data);
  storeImage(key, data);
  return data;
}

function requestImage(key, location) {
  if (!pendingImages.has(key)) {
    const pending = fetchImage(key, location).finally(() => pendingImages.delete(key));
    pendingImages.set(key, pending);
  }
  return pendingImages.get(key);
}

export function usePlaceImage(location) {
  const key = cacheKey(location);
  const [loaded, setLoaded] = useState<{ key: string; image: any } | null>(null);
  const known = useMemo(() => (key ? readKnownImage(key) : undefined), [key]);

  useEffect(() => {
    removeOldImageCaches();
    // The name decides which photo fits; looking one up for a placeholder would be wasted and wrong.
    if (!key || known !== undefined || location?.pendingName) return undefined;

    let current = true;
    requestImage(key, location)
      .then((image) => {
        if (current) setLoaded({ key, image });
      })
      .catch(() => {
        if (current) setLoaded({ key, image: null });
      });

    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the key and name lookup state start a new request
  }, [key, known, location?.pendingName]);

  // Decided while rendering: the previous place's photo must not survive even one frame.
  if (loaded?.key === key) return loaded.image;
  return known ?? null;
}
