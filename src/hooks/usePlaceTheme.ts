import { useEffect } from 'react';
import { uiThemeFromDominant } from '../utils/imagePalette';

const THEME_KEYS = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--accent',
  '--accent-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
];

/** Apply Material You–style primary tokens from a place-photo seed. Amber stays as CSS fallback. */
export function usePlaceTheme(seedRgb) {
  const seedKey = Array.isArray(seedRgb)
    ? seedRgb.map((channel) => Math.round(channel)).join(',')
    : '';

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const root = document.documentElement;
    const theme = seedKey && Array.isArray(seedRgb) ? uiThemeFromDominant(seedRgb) : null;

    if (!theme) {
      for (const key of THEME_KEYS) {
        root.style.removeProperty(key);
      }
      return undefined;
    }

    for (const [key, value] of Object.entries(theme)) {
      root.style.setProperty(key, value);
    }

    return () => {
      for (const key of THEME_KEYS) {
        root.style.removeProperty(key);
      }
    };
    // seedRgb is mirrored by seedKey for stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);
}
