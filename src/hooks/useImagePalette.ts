import { useEffect, useState } from 'react';
import { extractImagePalette, HERO_COVER_ASPECT, PALETTE_VERSION } from '../utils/imagePalette';

const cache = new Map();

function cacheKey(imageUrl, count, aspectRatio) {
  return `${PALETTE_VERSION}:${count}:${aspectRatio}:${imageUrl}`;
}

export function useImagePalette(imageUrl, { count = 5, aspectRatio = HERO_COVER_ASPECT } = {}) {
  const [palette, setPalette] = useState(() =>
    imageUrl ? cache.get(cacheKey(imageUrl, count, aspectRatio)) ?? null : null,
  );

  useEffect(() => {
    if (!imageUrl) {
      setPalette(null);
      return undefined;
    }

    const key = cacheKey(imageUrl, count, aspectRatio);
    const cached = cache.get(key);
    if (cached) {
      setPalette(cached);
      return undefined;
    }

    let cancelled = false;

    extractImagePalette(imageUrl, { count, aspectRatio })
      .then((colors) => {
        if (cancelled) return;
        if (colors) cache.set(key, colors);
        setPalette(colors);
      })
      .catch(() => {
        if (!cancelled) setPalette(null);
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, count, aspectRatio]);

  return palette;
}
