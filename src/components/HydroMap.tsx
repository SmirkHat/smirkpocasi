import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';
import { floodFill, getChartTheme } from './charts/chartTheme';
import { formatHydroName, formatPlaceName } from '../utils/formatters';

const OSM_MAX_NATIVE_ZOOM = 19;
const MAP_MAX_ZOOM = 18;

/** Country accent when not in flood (CZ uses floodFill/info). */
const COUNTRY_COLOR = {
  SK: null, // theme.success
  DE: null, // theme.warning
  FR: '#6366f1',
  UK: '#c026d3',
  US: '#0d9488',
  PL: '#dc2626',
  IE: '#16a34a',
  CA: '#ea580c',
  CH: '#be123c',
};

function Recenter({ center, zoom, bounds }) {
  const map = useMap();

  useEffect(() => {
    window.requestAnimationFrame(() => map.invalidateSize());
  }, [map]);

  useEffect(() => {
    if (bounds?.length >= 2) {
      map.fitBounds(bounds, { padding: [12, 20], maxZoom: 10 });
      window.requestAnimationFrame(() => map.invalidateSize());
      return;
    }
    const [lat, lon] = center || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.setView([lat, lon], zoom, { animate: false });
    window.requestAnimationFrame(() => map.invalidateSize());
  }, [bounds, center, map, zoom]);

  return null;
}

function LocationMarker({ position, label }) {
  if (!Number.isFinite(position?.[0]) || !Number.isFinite(position?.[1])) return null;

  return (
    <CircleMarker
      center={position}
      pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#e11d48', fillOpacity: 1 }}
      radius={8}
      zIndexOffset={1000}
    >
      {label ? (
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          {label}
        </Tooltip>
      ) : null}
    </CircleMarker>
  );
}

function countryAccent(country, theme) {
  if (country === 'SK') return theme.success;
  if (country === 'DE') return theme.warning;
  if (COUNTRY_COLOR[country]) return COUNTRY_COLOR[country];
  return theme.info;
}

function markerStyle(station, theme) {
  const flood = floodFill(station.floodLevel, theme);
  const accent = countryAccent(station.country, theme);
  if (station.country && station.country !== 'CZ') {
    return {
      color: accent,
      weight: 2,
      fillColor: station.floodLevel > 0 ? flood : accent,
      fillOpacity: station.floodLevel > 0 ? 0.95 : 0.75,
      radius: station.floodLevel > 0 ? 7 : 5,
    };
  }
  return {
    color: flood,
    weight: 1.5,
    fillColor: flood,
    fillOpacity: station.floodLevel > 0 ? 0.95 : 0.7,
    radius: station.floodLevel > 0 ? 7 : 5,
  };
}

function StationMarker({ station, theme }) {
  const style = markerStyle(station, theme);

  return (
    <CircleMarker center={[station.lat, station.lon]} pathOptions={style} radius={style.radius}>
      <Tooltip direction="top" offset={[0, -6]} opacity={1}>
        <div className="text-xs">
          <div className="font-semibold">{formatHydroName(station.name)}</div>
          <div className="text-muted-foreground">
            {formatHydroName(station.river)}
            {station.height != null ? ` · ${Math.round(station.height)} cm` : ''}
            {station.country ? ` · ${station.country}` : ''}
            {station.floodLevel > 0 ? ` · SPA ${station.floodLevel}` : ''}
          </div>
        </div>
      </Tooltip>
    </CircleMarker>
  );
}

export default function HydroMap({ location, stations = [], className }) {
  const theme = useMemo(() => getChartTheme(), []);
  const center = useMemo(() => {
    const lat = Number(location?.lat);
    const lon = Number(location?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    return [49.8, 15.5];
  }, [location?.lat, location?.lon]);

  const markers = useMemo(
    () =>
      (stations || []).filter(
        (s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)),
      ),
    [stations],
  );

  const orderedMarkers = useMemo(() => {
    const rank = { CZ: 0, DE: 1, SK: 2, PL: 3, FR: 4, UK: 5, IE: 6, CH: 7, US: 8, CA: 9 };
    return [...markers].sort(
      (a, b) => (rank[a.country] ?? 0) - (rank[b.country] ?? 0),
    );
  }, [markers]);

  const bounds = useMemo(() => {
    if (markers.length < 2) return null;
    return markers.map((s) => [s.lat, s.lon]);
  }, [markers]);

  const floodCount = markers.filter((s) => s.floodLevel > 0).length;
  const byCountry = useMemo(() => {
    const counts = {};
    for (const s of markers) {
      const c = s.country || 'CZ';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [markers]);

  const legendCountries = useMemo(() => {
    const order = ['CZ', 'SK', 'DE', 'PL', 'CH', 'FR', 'UK', 'IE', 'US', 'CA'];
    return order.filter((c) => byCountry[c]);
  }, [byCountry]);

  return (
    <div className={cn('relative overflow-hidden rounded-md border border-border', className)}>
      <div className="relative h-36 w-full sm:h-44">
        <MapContainer
          center={center}
          zoom={6}
          maxZoom={MAP_MAX_ZOOM}
          scrollWheelZoom
          zoomControl={false}
          attributionControl={false}
          className="leaflet-map absolute inset-0 h-full w-full"
        >
          <Recenter center={center} zoom={6} bounds={bounds} />
          <TileLayer
            className="osm-dark-tiles"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={OSM_MAX_NATIVE_ZOOM}
            maxZoom={MAP_MAX_ZOOM}
          />
          {orderedMarkers.map((station) => (
            <StationMarker key={station.id} station={station} theme={theme} />
          ))}
          <LocationMarker
            position={center}
            label={formatPlaceName(location?.name) || location?.name}
          />
        </MapContainer>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
        <div className="rounded-md border border-border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-xs backdrop-blur-sm sm:text-[11px]">
          <span className="font-medium text-foreground">{markers.length}</span> stanic
          {legendCountries.map((c) => (
            <span key={c}>
              {' · '}
              {c === 'SK' || c === 'FR' || c === 'UK' || c === 'US' ? (
                <span className="font-medium" style={{ color: countryAccent(c, theme) }}>
                  {c} {byCountry[c]}
                </span>
              ) : (
                <>
                  {c} {byCountry[c]}
                </>
              )}
            </span>
          ))}
          {floodCount > 0 ? (
            <>
              {' · '}
              <span className="font-medium text-warning">{floodCount}</span> se SPA
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-border bg-background/90 px-2 py-1 text-[10px] shadow-xs backdrop-blur-sm sm:text-[11px]">
          {legendCountries.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span
                className="size-2 rounded-full"
                style={{ background: countryAccent(c, theme) }}
              />
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
