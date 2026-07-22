import { useEffect, useState } from 'react';

const TOKEN_KEYS = [
  '--foreground',
  '--muted-foreground',
  '--border',
  '--card',
  '--primary',
  '--info',
  '--success',
  '--warning',
  '--destructive',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
];

function readToken(styles, key, fallback) {
  const value = styles.getPropertyValue(key).trim();
  return value || fallback;
}

export function getChartTheme() {
  if (typeof window === 'undefined') {
    return {
      foreground: '#e5e5e5',
      muted: '#a3a3a3',
      border: '#333333',
      card: '#222222',
      primary: '#f59e0b',
      info: '#38bdf8',
      success: '#22c55e',
      warning: '#f59e0b',
      destructive: '#ef4444',
      chart1: '#f59e0b',
      chart2: '#f97316',
      chart3: '#a16207',
      chart4: '#eab308',
      chart5: '#92400e',
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const map = Object.fromEntries(TOKEN_KEYS.map((key) => [key, readToken(styles, key, '')]));

  return {
    foreground: map['--foreground'] || '#e5e5e5',
    muted: map['--muted-foreground'] || '#a3a3a3',
    border: map['--border'] || '#333333',
    card: map['--card'] || '#222222',
    primary: map['--primary'] || '#f59e0b',
    info: map['--info'] || '#38bdf8',
    success: map['--success'] || '#22c55e',
    warning: map['--warning'] || '#f59e0b',
    destructive: map['--destructive'] || '#ef4444',
    chart1: map['--chart-1'] || '#f59e0b',
    chart2: map['--chart-2'] || '#f97316',
    chart3: map['--chart-3'] || '#a16207',
    chart4: map['--chart-4'] || '#eab308',
    chart5: map['--chart-5'] || '#92400e',
  };
}

export function aqiFill(indexValue, theme) {
  if (!Number.isFinite(indexValue) || indexValue <= 0) return theme.muted;
  if (indexValue <= 2) return theme.success;
  if (indexValue <= 4) return theme.warning;
  return theme.destructive;
}

export function floodFill(level, theme) {
  if (level >= 3) return theme.destructive;
  if (level >= 1) return theme.warning;
  return theme.info;
}

/**
 * Live --primary (and full chart theme) as place-photo tokens update on <html style>.
 * Leaflet needs concrete colors, not CSS variables.
 */
export function useChartTheme() {
  const [theme, setTheme] = useState(() => getChartTheme());

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const sync = () => setTheme(getChartTheme());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

