import { useEffect, useState } from 'react';
import { extractImagePalette, HERO_COVER_ASPECT, PALETTE_VERSION } from '../utils/imagePalette';

const cache = new Map();

function cacheKey(imageUrl, count, aspectRatio) {
  return `${PALETTE_VERSION}:${count}:${aspectRatio}:${imageUrl}`;
}

export function useImagePalette(imageUrl, { count = 5, aspectRatio = HERO_COVER_ASPECT } = {}) {
  const key = imageUrl ? cacheKey(imageUrl, count, aspectRatio) : null;
  const [extracted, setExtracted] = useState<{ key: string; colors: any } | null>(null);

  useEffect(() => {
    if (!key || cache.has(key)) return undefined;

    let cancelled = false;

    extractImagePalette(imageUrl, { count, aspectRatio })
      .then((colors) => {
        if (cancelled) return;
        if (colors) cache.set(key, colors);
        setExtracted({ key, colors });
      })
      .catch(() => {
        if (!cancelled) setExtracted({ key, colors: null });
      });

    return () => {
      cancelled = true;
    };
  }, [key, imageUrl, count, aspectRatio]);

  // Decided while rendering so the previous place's colors never tint the new one.
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  return extracted?.key === key ? extracted.colors : null;
}
