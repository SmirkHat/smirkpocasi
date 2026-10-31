import { useEffect, useMemo, useState } from 'react';
import { HiPause, HiPlay } from 'react-icons/hi2';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import { CircleMarker, ImageOverlay, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CHMI_RADAR_BOUNDS, locationInChmiRadarCoverage } from '../utils/geo';
import { buildExtrapolatedRainviewerFrames, estimateRainviewerMotion } from '../utils/radarExtrapolate';
import { RAINVIEWER_RECOLOR_SOURCE_SCHEME, createRainviewerColorTable, colorizeChmiRadar } from '../config/rainviewer';
import { useUiStore } from '../store/uiStore';
import { formatPlaceName } from '../utils/formatters';
import { useChartTheme } from './charts/chartTheme';
import 'leaflet/dist/leaflet.css';
import { apiUrl } from '@/lib/apiBase'

const RAINVIEWER_MAX_NATIVE_ZOOM = 7;
const MAP_MAX_ZOOM = 20;
const OSM_MAX_NATIVE_ZOOM = 19;
const RAW_RADAR_SOURCE_SCHEME = 0;
const DEFAULT_CHMI_BOUNDS = [
  [CHMI_RADAR_BOUNDS.latMin, CHMI_RADAR_BOUNDS.lonMin],
  [CHMI_RADAR_BOUNDS.latMax, CHMI_RADAR_BOUNDS.lonMax]
];

const UNIVERSAL_BLUE_SOURCE_STOPS = [
  [-10, 99, 97, 89, 20],
  [14, 222, 208, 151, 190],
  [15, 136, 221, 238, 255],
  [20, 0, 163, 224, 255],
  [34, 0, 71, 104, 255],
  [35, 255, 238, 0, 255],
  [44, 255, 129, 0, 255],
  [45, 255, 68, 0, 255],
  [54, 93, 0, 0, 255],
  [55, 255, 170, 255, 255],
  [64, 255, 78, 255, 255],
  [65, 255, 255, 255, 255],
  [74, 255, 255, 255, 255],
  [75, 0, 255, 0, 255],
  [95, 0, 255, 0, 255]
];

const UNIVERSAL_BLUE_SOURCE_TABLE = buildSourceTable(UNIVERSAL_BLUE_SOURCE_STOPS);

function interpolateChannel(start, end, ratio) {
  return Math.round(start + (end - start) * ratio);
}

function buildSourceTable(stops) {
  const entries = [];

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];
    const range = next[0] - previous[0] || 1;

    for (let dbz = Math.max(-10, previous[0]); dbz <= next[0]; dbz += 1) {
      if (entries.some((entry) => entry.dbz === dbz)) continue;
      const ratio = (dbz - previous[0]) / range;
      entries.push({
        dbz,
        red: interpolateChannel(previous[1], next[1], ratio),
        green: interpolateChannel(previous[2], next[2], ratio),
        blue: interpolateChannel(previous[3], next[3], ratio),
        alpha: interpolateChannel(previous[4], next[4], ratio)
      });
    }
  }

  return entries;
}

function isNearGrayscale(red, green, blue) {
  // Canvas color management often nudges R/G/B by 1–2 on "raw" tiles. Exact equality then fails,
  // and the Universal Blue reverse map turns light rain into ~40 dBZ orange.
  return Math.abs(red - green) <= 2 && Math.abs(green - blue) <= 2 && Math.abs(red - blue) <= 2;
}

function isProbablyRawTile(pixels) {
  let checked = 0;
  let grayscale = 0;

  for (let index = 0; index < pixels.length; index += 64) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha === 0) continue;

    checked += 1;
    if (isNearGrayscale(red, green, blue)) grayscale += 1;
  }

  return checked > 16 && grayscale / checked > 0.9;
}

function estimateDbzFromUniversalBlue(red, green, blue, alpha) {
  let closest = UNIVERSAL_BLUE_SOURCE_TABLE[0];
  let closestDistance = Infinity;

  for (const entry of UNIVERSAL_BLUE_SOURCE_TABLE) {
    const redDelta = red - entry.red;
    const greenDelta = green - entry.green;
    const blueDelta = blue - entry.blue;
    const alphaDelta = alpha - entry.alpha;
    const distance = redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta + alphaDelta * alphaDelta * 0.25;

    if (distance < closestDistance) {
      closest = entry;
      closestDistance = distance;
    }
  }

  return closest.dbz;
}

function colorizeRadarTile(imageData, colorTable, { forceRaw = false } = {}) {
  const pixels = imageData.data;
  const rawTile = forceRaw || isProbablyRawTile(pixels);

  for (let index = 0; index < pixels.length; index += 4) {
    const sourceAlpha = pixels[index + 3];
    if (sourceAlpha === 0) continue;

    // LibreWXR scheme 0 is RainViewer-compatible raw (gray ≈ dBZ + 32). Averaging R/G/B
    // absorbs the 1–2 level canvas drift that would otherwise pick the wrong table row.
    const rawValue = rawTile
      ? Math.round((pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3)
      : estimateDbzFromUniversalBlue(pixels[index], pixels[index + 1], pixels[index + 2], sourceAlpha) + 32;
    const tableIndex = Math.max(0, Math.min(255, rawValue)) * 4;
    const targetAlpha = colorTable[tableIndex + 3];

    if (!rawTile && targetAlpha === 0) {
      pixels[index + 3] = 0;
      continue;
    }

    pixels[index] = colorTable[tableIndex];
    pixels[index + 1] = colorTable[tableIndex + 1];
    pixels[index + 2] = colorTable[tableIndex + 2];
    pixels[index + 3] = rawTile ? Math.min(sourceAlpha, targetAlpha) : targetAlpha;
  }
}

function RainviewerFrame({ frame }) {
  const map = useMap();
  const colorTable = useMemo(() => createRainviewerColorTable(), []);
  const shiftLat = Number(frame?.shiftLat) || 0;
  const shiftLon = Number(frame?.shiftLon) || 0;

  useEffect(() => {
    if (!frame) return undefined;

    let pane = map.getPane('radarShift');
    if (!pane) {
      pane = map.createPane('radarShift');
      pane.style.zIndex = 450;
    }

    let wrap = pane.querySelector('.radar-extrap-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'radar-extrap-wrap';
      wrap.style.position = 'absolute';
      wrap.style.left = '0';
      wrap.style.top = '0';
      wrap.style.width = '100%';
      wrap.style.height = '100%';
      wrap.style.pointerEvents = 'none';
      pane.appendChild(wrap);
    }

    const layer = L.gridLayer({
      attribution: '',
      maxNativeZoom: RAINVIEWER_MAX_NATIVE_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      opacity: 0.65,
      pane: 'radarShift',
      tileSize: 256,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1
    });

    const originalOnAdd = layer.onAdd.bind(layer);
    layer.onAdd = function onAdd(mapInstance) {
      originalOnAdd(mapInstance);
      const container = this.getContainer();
      if (wrap && container && container.parentNode !== wrap) {
        wrap.appendChild(container);
      }
    };

    layer.createTile = (coords, done) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          context.drawImage(image, 0, 0);
          const imageData = context.getImageData(0, 0, 256, 256);
          // LibreWXR scheme 0 is raw reflectivity; never reverse-map it as Universal Blue.
          colorizeRadarTile(imageData, colorTable, { forceRaw: frame.source === 'librewxr' });
          context.putImageData(imageData, 0, 0);
          done(null, canvas);
        } catch (error) {
          done(error, canvas);
        }
      };
      image.onerror = () => done(new Error('RainViewer raw tile failed.'), canvas);
      const colorScheme = frame.source === 'librewxr' ? RAW_RADAR_SOURCE_SCHEME : RAINVIEWER_RECOLOR_SOURCE_SCHEME;
      image.src = `${frame.host}${frame.path}/256/${coords.z}/${coords.x}/${coords.y}/${colorScheme}/1_1.png`;

      return canvas;
    };

    let active = true;
    let delayedRaf;
    const applyShift = () => {
      if (!active || !map.getContainer().isConnected) return;
      const center = map.getCenter();
      const from = map.latLngToLayerPoint(center);
      const to = map.latLngToLayerPoint([center.lat + shiftLat, center.lng + shiftLon]);
      wrap.style.transform = `translate3d(${to.x - from.x}px, ${to.y - from.y}px, 0)`;
    };

    layer.addTo(map);
    applyShift();
    const raf1 = window.requestAnimationFrame(applyShift);
    const raf2 = window.requestAnimationFrame(() => {
      delayedRaf = window.requestAnimationFrame(applyShift);
    });
    map.on('move zoom viewreset', applyShift);

    return () => {
      active = false;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (delayedRaf) window.cancelAnimationFrame(delayedRaf);
      map.off('move zoom viewreset', applyShift);
      wrap.style.transform = '';
      layer.removeFrom(map);
    };
  }, [colorTable, frame, map, shiftLat, shiftLon]);

  return null;
}

function ChmiFrame({ frame, bounds }) {
  const colorTable = useMemo(() => createRainviewerColorTable(), []);
  const [overlayUrl, setOverlayUrl] = useState(null);

  useEffect(() => {
    if (!frame?.url) {
      setOverlayUrl(null);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = null;
    const controller = new AbortController();
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        colorizeChmiRadar(imageData, colorTable);
        context.putImageData(imageData, 0, 0);
        if (!cancelled) setOverlayUrl(canvas.toDataURL('image/png'));
      } catch {
        if (!cancelled) setOverlayUrl(objectUrl);
      }
    };
    image.onerror = () => {
      if (!cancelled) setOverlayUrl(null);
    };

    const load = async () => {
      let response = await fetch(frame.url, { signal: controller.signal });
      if (!response.ok) {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        if (cancelled) return;
        const separator = frame.url.includes('?') ? '&' : '?';
        response = await fetch(`${frame.url}${separator}retry=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
      }
      if (cancelled) return;
      if (!response.ok) {
        setOverlayUrl(null);
        return;
      }
      const blob = await response.blob();
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      image.src = objectUrl;
    };
    void load().catch(() => {
      if (!cancelled) setOverlayUrl(null);
    });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [colorTable, frame]);

  if (!overlayUrl) return null;
  return <ImageOverlay bounds={bounds || DEFAULT_CHMI_BOUNDS} opacity={0.72} url={overlayUrl} zIndex={400} />;
}

function Recenter({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    const [lat, lon] = center || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.stop();
    map.setView([lat, lon], zoom, { animate: false });
    const raf = window.requestAnimationFrame(() => {
      if (map.getContainer().isConnected) map.invalidateSize({ animate: false });
    });
    return () => {
      window.cancelAnimationFrame(raf);
      // Leaving the page removes the map before this runs, and stopping a removed map throws,
      // which takes the next page down with it.
      if (map.getContainer().isConnected) map.stop();
    };
  }, [center, map, zoom]);

  return null;
}

function LocationMarker({ position, label }) {
  const theme = useChartTheme();
  if (!Number.isFinite(position?.[0]) || !Number.isFinite(position?.[1])) return null;

  return (
    <CircleMarker
      center={position}
      pathOptions={{
        color: '#ffffff',
        weight: 2,
        fillColor: theme.primary,
        fillOpacity: 1,
      }}
      radius={8}
    >
      {label ? (
        <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent={false}>
          {label}
        </Tooltip>
      ) : null}
    </CircleMarker>
  );
}

const RAINVIEWER_CACHE_KEY = 'smirkpocasi:rainviewer-frames-v7';
const RAINVIEWER_CACHE_TTL = 5 * 60 * 1000;
const LIBREWXR_CACHE_KEY = 'smirkpocasi:librewxr-frames-v2';
const LIBREWXR_CACHE_TTL = 5 * 60 * 1000;
const CHMI_CACHE_KEY = 'smirkpocasi:chmi-radar-frames-v6';
const CHMI_CACHE_TTL = 2 * 60 * 1000;
const SOURCE_KEY = 'smirkpocasi:radar-source';

let rainviewerRequest = null;
let chmiRequest = null;

function readJsonCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeJsonCache(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const TILE_SOURCE_HOST = {
  rainviewer: 'https://tilecache.rainviewer.com',
  librewxr: 'https://api.librewxr.net'
};

function buildRainviewerFrames(data, source = 'rainviewer') {
  const host = data.host || TILE_SOURCE_HOST[source] || 'https://tilecache.rainviewer.com';
  const past = (data.radar?.past || []).map((frame) => ({
    ...frame,
    host,
    source,
    kind: 'history',
    timeMs: Number(frame.time) * 1000
  }));
  // Free public API currently returns nowcast: []; paid/self-hosted may still fill it.
  const nowcast = (data.radar?.nowcast || []).map((frame) => {
    const timeMs = Number(frame.time) * 1000;
    const lastPastMs = past.at(-1)?.timeMs;
    const lead = Number.isFinite(lastPastMs) ? Math.round((timeMs - lastPastMs) / 60000) : 0;
    return {
      ...frame,
      host,
      source,
      kind: 'nowcast',
      timeMs,
      lead: lead > 0 ? lead : undefined
    };
  });
  return [...past, ...nowcast];
}

function buildChmiFrames(data) {
  return (data.frames || []).map((frame) => ({
    ...frame,
    source: 'chmi',
    kind: frame.type === 'nowcast' ? 'nowcast' : 'history',
    timeMs: Date.parse(frame.time),
    lead: Number(frame.lead) || 0
  }));
}

async function withRainviewerExtrapolation(frames, centerLat, centerLon) {
  const past = frames.filter((frame) => frame.kind !== 'nowcast');
  const apiNowcast = frames.filter((frame) => frame.kind === 'nowcast' && !frame.extrapolated);
  if (apiNowcast.length || past.length < 1) return frames;

  const last = past.at(-1);
  const prev = past.at(-2) || last;
  let motion;
  try {
    motion = await estimateRainviewerMotion(prev, last, centerLat, centerLon);
  } catch {
    motion = null;
  }

  const extrapolated = buildExtrapolatedRainviewerFrames(
    last,
    motion || { latPerMin: 0, lonPerMin: 0, speedKmH: 0, method: 'persistence' }
  );
  return extrapolated.length ? [...past, ...extrapolated] : past;
}

function latestObservationIndex(frames) {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (frames[index]?.kind !== 'nowcast') return index;
  }
  return Math.max(0, frames.length - 1);
}

function formatRadarThumbTime(frame) {
  const timeMs = Number(frame?.timeMs);
  if (!Number.isFinite(timeMs)) return '—';
  return new Date(timeMs).toLocaleTimeString('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function frameStatusLabel(frame, frameIndex, observationIndex) {
  if (frame?.kind === 'nowcast') {
    const lead = Number(frame.lead);
    const leadText = Number.isFinite(lead) && lead > 0 ? `+${lead} min` : 'Předpověď';
    if (frame.extrapolated) {
      if (frame.motionMethod === 'wind700') return `${leadText} · odhad (vítr)`;
      return `${leadText} · odhad`;
    }
    if (frame.source === 'chmi') return `${leadText} · ČHMÚ`;
    return leadText;
  }
  if (frameIndex === observationIndex) return 'Teď';
  return 'Historie';
}

function fetchChmiRadarFrames() {
  chmiRequest ||= fetch(apiUrl('/api/chmi-radar?action=frames'))
    .then((response) => {
      if (!response.ok) throw new Error('ČHMÚ radar metadata failed.');
      return response.json();
    })
    .finally(() => {
      chmiRequest = null;
    });
  return chmiRequest;
}

function fetchRainviewerMaps() {
  rainviewerRequest ||= fetch(apiUrl('/api/rainviewer'))
    .then((response) => {
      if (!response.ok) throw new Error('RainViewer metadata request failed.');
      return response.json();
    })
    .finally(() => {
      rainviewerRequest = null;
    });
  return rainviewerRequest;
}

let libreWxrRequest = null;

function fetchLibreWxrMaps() {
  libreWxrRequest ||= fetch(apiUrl('/api/librewxr'))
    .then((response) => {
      if (!response.ok) throw new Error('LibreWXR metadata request failed.');
      return response.json();
    })
    .finally(() => {
      libreWxrRequest = null;
    });
  return libreWxrRequest;
}

function rememberSource(source) {
  try {
    localStorage.setItem(SOURCE_KEY, source);
  } catch {
    // ignore
  }
}

function RadarAttribution({ source }) {
  const className = 'rounded-md border border-border bg-background px-1.5 py-0.5';
  if (source !== 'librewxr') {
    return <span className={className}>{source === 'chmi' ? 'ČHMÚ' : 'RainViewer'}</span>;
  }

  return (
    <span className={className}>
      Data:{' '}
      <a className="underline underline-offset-2" href="https://librewxr.net/" rel="noreferrer" target="_blank">
        LibreWXR (librewxr.net)
      </a>
      {' · '}
      <a
        className="underline underline-offset-2"
        href="https://github.com/JoshuaKimsey/LibreWXR#data-sources"
        rel="noreferrer"
        target="_blank"
        title="EUMETNET OPERA, DPC, NOAA, ECMWF, DMI, DWD a další"
      >
        zdroje dat
      </a>
    </span>
  );
}

function defaultSourceFor(location) {
  const chmiOk = locationInChmiRadarCoverage(location);
  try {
    const stored = localStorage.getItem(SOURCE_KEY);
    if (stored === 'librewxr') return 'librewxr';
    if (stored === 'chmi' && chmiOk) return 'chmi';
    if (stored === 'rainviewer') return 'rainviewer';
  } catch {
    // ignore
  }
  return 'librewxr';
}

export default function RadarMap({ location, fullscreen = false }) {
  const openLocationPicker = useUiStore((state) => state.openLocationPicker);
  const placeName = formatPlaceName(location?.name) || location?.name || 'Lokace';
  const center = useMemo(() => [location?.lat || 50.0755, location?.lon || 14.4378], [location?.lat, location?.lon]);
  const initialZoom = fullscreen ? 9 : 8;
  const chmiAvailable = locationInChmiRadarCoverage(location);
  const [source, setSource] = useState(() => defaultSourceFor(location));
  const [frames, setFrames] = useState([]);
  const [chmiBounds, setChmiBounds] = useState(DEFAULT_CHMI_BOUNDS);
  const [frameIndex, setFrameIndex] = useState(0);
  const [animationEnabled, setAnimationEnabled] = useState(false);

  useEffect(() => {
    if (!chmiAvailable && source === 'chmi') {
      setSource('librewxr');
      setAnimationEnabled(false);
      setFrames([]);
    }
  }, [chmiAvailable, source]);

  useEffect(() => {
    let alive = true;

    if (source === 'chmi') {
      const cached = readJsonCache(CHMI_CACHE_KEY);
      const cacheHasNowcast = cached?.frames?.some((frame) => frame.type === 'nowcast');
      if (cached?.frames?.length) {
        const nextFrames = buildChmiFrames(cached);
        setFrames(nextFrames);
        setFrameIndex(latestObservationIndex(nextFrames));
        if (cached.bounds) setChmiBounds(cached.bounds);
      }
      if (cached && cacheHasNowcast && Date.now() - cached.updatedAt < CHMI_CACHE_TTL) return undefined;

      fetchChmiRadarFrames()
        .then((data) => {
          if (!alive) return;
          writeJsonCache(CHMI_CACHE_KEY, { ...data, updatedAt: Date.now() });
          if (data.bounds) setChmiBounds(data.bounds);
          const nextFrames = buildChmiFrames(data);
          setFrames(nextFrames);
          setFrameIndex(latestObservationIndex(nextFrames));
        })
        .catch(() => {
          if (alive && !cached?.frames?.length) setFrames([]);
        });

      return () => {
        alive = false;
      };
    }

    const tileConfig =
      source === 'rainviewer'
        ? { cacheKey: RAINVIEWER_CACHE_KEY, ttl: RAINVIEWER_CACHE_TTL, fetchMaps: fetchRainviewerMaps, sourceName: 'rainviewer' }
        : { cacheKey: LIBREWXR_CACHE_KEY, ttl: LIBREWXR_CACHE_TTL, fetchMaps: fetchLibreWxrMaps, sourceName: 'librewxr' };

    const cached = readJsonCache(tileConfig.cacheKey);
    const cacheFresh = Boolean(cached?.pastFrames?.length && Date.now() - cached.updatedAt < tileConfig.ttl);

    const showFrames = (nextFrames) => {
      if (!alive || !nextFrames?.length) return;
      setFrames(nextFrames);
      setFrameIndex(latestObservationIndex(nextFrames));
    };

    const enrich = async (baseFrames) => {
      try {
        showFrames(await withRainviewerExtrapolation(baseFrames, center[0], center[1]));
      } catch {
        // Keep history frames already shown.
      }
    };

    if (cacheFresh) {
      showFrames(cached.pastFrames);
      enrich(cached.pastFrames);
      return () => {
        alive = false;
      };
    }

    tileConfig
      .fetchMaps()
      .then(async (data) => {
        if (!alive) return;
        const pastAndApiNowcast = buildRainviewerFrames(data, tileConfig.sourceName);
        if (!pastAndApiNowcast.length) {
          setFrames([]);
          return;
        }
        writeJsonCache(tileConfig.cacheKey, {
          pastFrames: pastAndApiNowcast,
          updatedAt: Date.now()
        });
        showFrames(pastAndApiNowcast);
        await enrich(pastAndApiNowcast);
      })
      .catch(() => {
        if (!alive) return;
        setFrames([]);
        // The public LibreWXR instance promises no uptime: an outage must not leave the default radar empty.
        if (source === 'librewxr') setSource(chmiAvailable ? 'chmi' : 'rainviewer');
      });

    return () => {
      alive = false;
    };
  }, [center, chmiAvailable, source]);

  const activeFrame = frames[frameIndex];
  const activeOverlay = activeFrame?.source || source;
  const observationIndex = latestObservationIndex(frames);
  const hasForecast = frames.some((frame) => frame.kind === 'nowcast');
  const nowMarkerProgress = frames.length > 1 ? observationIndex / (frames.length - 1) : 0;

  useEffect(() => {
    if (!animationEnabled || frames.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % frames.length);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [animationEnabled, frames.length]);

  return (
    <div className={cn('relative h-full w-full bg-[#0b0f14]', fullscreen && 'radar-fullscreen min-h-0 flex-1')}>
      <MapContainer
        center={center}
        zoom={initialZoom}
        maxZoom={MAP_MAX_ZOOM}
        scrollWheelZoom={fullscreen}
        zoomControl={false}
        attributionControl={false}
        className="leaflet-map h-full w-full bg-[#0b0f14]"
      >
        <Recenter center={center} zoom={initialZoom} />
        <TileLayer
          className="osm-dark-tiles"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxNativeZoom={OSM_MAX_NATIVE_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
        />
        {activeOverlay === 'chmi' ? (
          <ChmiFrame bounds={chmiBounds} frame={activeFrame} />
        ) : (
          <RainviewerFrame frame={activeFrame} />
        )}
        <LocationMarker label={formatPlaceName(location?.name) || location?.name} position={center} />
      </MapContainer>

      {fullscreen ? (
        <div className="absolute top-3 right-3 z-5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="max-w-[12rem] border border-border bg-background shadow-xs"
            onClick={openLocationPicker}
            aria-haspopup="dialog"
            aria-label={`Změnit lokaci · ${placeName}`}
          >
            <MapPin aria-hidden="true" />
            <span className="truncate">{placeName}</span>
          </Button>
        </div>
      ) : null}

      <div className="absolute top-3 left-3 z-5">
        <Tabs
          value={source}
          onValueChange={(next) => {
            if (next !== 'librewxr' && next !== 'chmi' && next !== 'rainviewer') return;
            if (next === 'chmi' && !chmiAvailable) return;
            setSource(next);
            rememberSource(next);
            setAnimationEnabled(false);
          }}
        >
          <TabsList
            variant="default"
            className="border border-border bg-background shadow-xs"
            aria-label="Zdroj radaru"
          >
            <TabsTab value="librewxr">LibreWXR</TabsTab>
            <TabsTab
              value="chmi"
              disabled={!chmiAvailable}
              title={chmiAvailable ? undefined : 'ČHMÚ radar jen v pokrytí MAX_Z (ČR a okolí DE/SK)'}
              className="data-disabled:pointer-events-auto data-disabled:cursor-not-allowed"
            >
              ČHMÚ
            </TabsTab>
            <TabsTab value="rainviewer">RainViewer</TabsTab>
          </TabsList>
        </Tabs>
      </div>

      {frames.length > 0 && (
        <div className="absolute inset-x-3 bottom-3 z-5 flex flex-col gap-2">
          <div className="rounded-lg border border-border bg-background px-2.5 py-2 shadow-xs">
            <div className="mb-1.5 flex items-center gap-2">
              {frames.length > 1 && (
                <Button
                  size="icon-sm"
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  aria-label={animationEnabled ? 'Zastavit animaci' : 'Přehrát animaci'}
                  onClick={() => setAnimationEnabled((enabled) => !enabled)}
                >
                  {animationEnabled ? <HiPause aria-hidden="true" /> : <HiPlay aria-hidden="true" />}
                </Button>
              )}
              <div className="min-w-0 flex-1 text-center">
                <div className="text-sm font-semibold tabular-nums leading-none">{formatRadarThumbTime(activeFrame)}</div>
                <div className="mt-0.5 text-[0.625rem] text-muted-foreground">
                  {frameStatusLabel(activeFrame, frameIndex, observationIndex)}
                </div>
              </div>
              {frames.length > 1 ? (
                <Button
                  size="icon-sm"
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  aria-label="Skok na teď"
                  title="Teď"
                  onClick={() => {
                    setAnimationEnabled(false);
                    setFrameIndex(observationIndex);
                  }}
                >
                  <span className="text-[0.625rem] font-semibold">Teď</span>
                </Button>
              ) : (
                <span className="size-8 shrink-0" aria-hidden="true" />
              )}
            </div>

            {frames.length > 1 && (
              <div className="relative">
                {hasForecast && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0.5 bottom-0.5 z-0 w-px bg-foreground/35"
                    style={{ left: `${nowMarkerProgress * 100}%` }}
                    title="Teď"
                  />
                )}
                <Slider
                  aria-label="Čas radaru"
                  min={0}
                  max={frames.length - 1}
                  step={1}
                  value={[frameIndex]}
                  onValueChange={(values) => {
                    const next = Array.isArray(values) ? values[0] : values;
                    if (!Number.isFinite(next)) return;
                    setAnimationEnabled(false);
                    setFrameIndex(Math.round(next));
                  }}
                />
                {hasForecast && (
                  <div className="mt-1 flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>historie</span>
                    <span>předpověď →</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-2 text-[0.625rem] text-muted-foreground">
            <RadarAttribution source={source} />
            <div
              className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5"
              aria-label="Legenda intenzity srážek"
            >
              <span>slabé</span>
              <span
                aria-hidden="true"
                className="h-1.5 w-14 rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#22d3ee_18%,#34d399_36%,#a3e635_50%,#facc15_62%,#fb923c_74%,#ef4444_84%,#7f1d1d_94%,#ffffff_100%)]"
              />
              <span>silné</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
