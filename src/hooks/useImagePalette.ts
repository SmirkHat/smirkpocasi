import { useEffect, useState } from 'react';
import { extractImagePalette } from '../utils/imagePalette';

const cache = new Map();

export function useImagePalette(imageUrl, { count = 5 } = {}) {
  const [palette, setPalette] = useState(() => (imageUrl ? cache.get(imageUrl) ?? null : null));

  useEffect(() => {
    if (!imageUrl) {
      setPalette(null);
      return undefined;
    }

    const cached = cache.get(imageUrl);
    if (cached) {
      setPalette(cached);
      return undefined;
    }

    let cancelled = false;

    extractImagePalette(imageUrl, { count })
      .then((colors) => {
        if (cancelled) return;
        if (colors) cache.set(imageUrl, colors);
        setPalette(colors);
      })
      .catch(() => {
        if (!cancelled) setPalette(null);
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, count]);

  return palette;
}
