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
    if (red === green && green === blue) grayscale += 1;
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

function colorizeRadarTile(imageData, colorTable) {
  const pixels = imageData.data;
  const rawTile = isProbablyRawTile(pixels);

  for (let index = 0; index < pixels.length; index += 4) {
    const sourceAlpha = pixels[index + 3];
    if (sourceAlpha === 0) continue;

    const tableIndex = rawTile ? pixels[index] * 4 : (estimateDbzFromUniversalBlue(pixels[index], pixels[index + 1], pixels[index + 2], sourceAlpha) + 32) * 4;
    const targetAlpha = colorTable[tableIndex + 3];

    if (!rawTile && targetAlpha === 0) continue;

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
          colorizeRadarTile(imageData, colorTable);
          context.putImageData(imageData, 0, 0);
          done(null, canvas);
        } catch (error) {
          done(error, canvas);
        }
      };
      image.onerror = () => done(new Error('RainViewer raw tile failed.'), canvas);
      image.src = `${frame.host}${frame.path}/256/${coords.z}/${coords.x}/${coords.y}/${RAINVIEWER_RECOLOR_SOURCE_SCHEME}/1_1.png`;

      return canvas;
    };

    const applyShift = () => {
      const center = map.getCenter();
      const from = map.latLngToLayerPoint(center);
      const to = map.latLngToLayerPoint([center.lat + shiftLat, center.lng + shiftLon]);
      wrap.style.transform = `translate3d(${to.x - from.x}px, ${to.y - from.y}px, 0)`;
    };

    layer.addTo(map);
    applyShift();
    const raf1 = window.requestAnimationFrame(applyShift);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(applyShift));
    map.on('move zoom viewreset', applyShift);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
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
        if (!cancelled) setOverlayUrl(frame.url);
      }
    };
    image.onerror = () => {
      if (!cancelled) setOverlayUrl(frame.url);
    };
    image.src = frame.url;

    return () => {
      cancelled = true;
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
    map.setView([lat, lon], zoom, { animate: true });
    // Leaflet often needs a size refresh after layout (aside card / fullscreen).
    window.requestAnimationFrame(() => map.invalidateSize());
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
const CHMI_CACHE_KEY = 'smirkpocasi:chmi-radar-frames-v5';
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

function buildRainviewerFrames(data) {
  const host = data.host || 'https://tilecache.rainviewer.com';
  const past = (data.radar?.past || []).map((frame) => ({
    ...frame,
    host,
    source: 'rainviewer',
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
      source: 'rainviewer',
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

function defaultSourceFor(location) {
  const chmiOk = locationInChmiRadarCoverage(location);
  try {
    const stored = localStorage.getItem(SOURCE_KEY);
    if (stored === 'chmi' && chmiOk) return 'chmi';
    if (stored === 'rainviewer') return 'rainviewer';
  } catch {
    // ignore
  }
  return chmiOk ? 'chmi' : 'rainviewer';
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
      setSource('rainviewer');
      setAnimationEnabled(false);
      setFrames([]);
    }
  }, [chmiAvailable, source]);

  useEffect(() => {
    try {
      localStorage.setItem(SOURCE_KEY, source);
    } catch {
      // ignore
    }
  }, [source]);

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

    const cached = readJsonCache(RAINVIEWER_CACHE_KEY);
    const cacheFresh = Boolean(cached?.pastFrames?.length && Date.now() - cached.updatedAt < RAINVIEWER_CACHE_TTL);

    const showFrames = (nextFrames) => {
      if (!alive || !nextFrames?.length) return;
      setFrames(nextFrames);
      setFrameIndex(latestObservationIndex(nextFrames));
    };

    if (cached?.pastFrames?.length) showFrames(cached.pastFrames);

    const enrich = async (baseFrames) => {
      try {
        showFrames(await withRainviewerExtrapolation(baseFrames, center[0], center[1]));
      } catch {
        // Keep history frames already shown.
      }
    };

    if (cacheFresh) {
      enrich(cached.pastFrames);
      return () => {
        alive = false;
      };
    }

    fetchRainviewerMaps()
      .then(async (data) => {
        if (!alive) return;
        const pastAndApiNowcast = buildRainviewerFrames(data);
        if (!pastAndApiNowcast.length) {
          if (!cached?.pastFrames?.length) setFrames([]);
          return;
        }
        writeJsonCache(RAINVIEWER_CACHE_KEY, {
          pastFrames: pastAndApiNowcast,
          updatedAt: Date.now()
        });
        showFrames(pastAndApiNowcast);
        await enrich(pastAndApiNowcast);
      })
      .catch(() => {
        if (alive && !cached?.pastFrames?.length) setFrames([]);
      });

    return () => {
      alive = false;
    };
  }, [center, source]);

  const activeFrame = frames[frameIndex];
  const activeOverlay = activeFrame?.source || source;
  const observationIndex = latestObservationIndex(frames);
  const hasForecast = frames.some((frame) => frame.kind === 'nowcast');
  const nowMarkerProgress = frames.length > 1 ? observationIndex / (frames.length - 1) : 0;
  const attribution = source === 'chmi' ? 'ČHMÚ' : 'RainViewer';

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
            if (next !== 'chmi' && next !== 'rainviewer') return;
            if (next === 'chmi' && !chmiAvailable) return;
            setSource(next);
            setAnimationEnabled(false);
          }}
        >
          <TabsList
            variant="default"
            className="border border-border bg-background shadow-xs"
            aria-label="Zdroj radaru"
          >
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
            <span className="rounded-md border border-border bg-background px-1.5 py-0.5">{attribution}</span>
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
