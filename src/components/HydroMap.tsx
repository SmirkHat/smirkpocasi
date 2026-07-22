import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { floodFill, useChartTheme } from './charts/chartTheme'
import { formatHydroName, formatPlaceName } from '../utils/formatters'

const OSM_MAX_NATIVE_ZOOM = 19
const MAP_MAX_ZOOM = 18

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
}

function Recenter({ center, zoom, bounds }) {
  const map = useMap()

  useEffect(() => {
    window.requestAnimationFrame(() => map.invalidateSize())
  }, [map])

  useEffect(() => {
    if (bounds?.length >= 2) {
      map.fitBounds(bounds, { padding: [24, 28], maxZoom: 10 })
      window.requestAnimationFrame(() => map.invalidateSize())
      return
    }
    const [lat, lon] = center || []
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    map.setView([lat, lon], zoom, { animate: false })
    window.requestAnimationFrame(() => map.invalidateSize())
  }, [bounds, center, map, zoom])

  return null
}

function LocationMarker({ position, label, color }) {
  if (!Number.isFinite(position?.[0]) || !Number.isFinite(position?.[1])) return null

  return (
    <CircleMarker
      center={position}
      pathOptions={{ color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1 }}
      radius={8}
      zIndexOffset={1000}
    >
      {label ? (
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          {label}
        </Tooltip>
      ) : null}
    </CircleMarker>
  )
}

function countryAccent(country, theme) {
  if (country === 'SK') return theme.success
  if (country === 'DE') return theme.warning
  if (COUNTRY_COLOR[country]) return COUNTRY_COLOR[country]
  return theme.info
}

function markerStyle(station, theme, selected) {
  const flood = floodFill(station.floodLevel, theme)
  const accent = countryAccent(station.country, theme)
  const base =
    station.country && station.country !== 'CZ'
      ? {
          color: accent,
          weight: selected ? 3 : 2,
          fillColor: station.floodLevel > 0 ? flood : accent,
          fillOpacity: station.floodLevel > 0 ? 0.95 : 0.75,
          radius: selected ? 9 : station.floodLevel > 0 ? 7 : 5,
        }
      : {
          color: selected ? '#ffffff' : flood,
          weight: selected ? 3 : 1.5,
          fillColor: flood,
          fillOpacity: station.floodLevel > 0 ? 0.95 : 0.7,
          radius: selected ? 9 : station.floodLevel > 0 ? 7 : 5,
        }

  return base
}

function StationMarker({ station, theme, selected, onSelect }) {
  const style = markerStyle(station, theme, selected)

  return (
    <CircleMarker
      center={[station.lat, station.lon]}
      pathOptions={style}
      radius={style.radius}
      eventHandlers={{
        click: (event) => {
          event.originalEvent?.stopPropagation?.()
          onSelect?.(station)
        },
      }}
    >
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
  )
}

export default function HydroMap({
  location,
  stations = [],
  selectedId = null,
  onSelectStation = null,
  className,
}) {
  const theme = useChartTheme()
  const center = useMemo(() => {
    const lat = Number(location?.lat)
    const lon = Number(location?.lon)
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon]
    return [49.8, 15.5]
  }, [location?.lat, location?.lon])

  const markers = useMemo(
    () =>
      (stations || []).filter(
        (s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)),
      ),
    [stations],
  )

  const orderedMarkers = useMemo(() => {
    const rank = { CZ: 0, DE: 1, SK: 2, PL: 3, FR: 4, UK: 5, IE: 6, CH: 7, US: 8, CA: 9 }
    return [...markers].sort((a, b) => (rank[a.country] ?? 0) - (rank[b.country] ?? 0))
  }, [markers])

  const bounds = useMemo(() => {
    if (markers.length < 2) return null
    return markers.map((s) => [s.lat, s.lon])
  }, [markers])

  return (
    <div
      className={cn(
        'relative h-80 overflow-hidden rounded-md border border-border bg-[#0b0f14] sm:h-[28rem] lg:h-[36rem]',
        '[&_.leaflet-container]:!absolute [&_.leaflet-container]:!inset-0 [&_.leaflet-container]:!h-full [&_.leaflet-container]:!min-h-0 [&_.leaflet-container]:!w-full [&_.leaflet-container]:!rounded-md',
        className,
      )}
    >
      <MapContainer
        center={center}
        zoom={6}
        maxZoom={MAP_MAX_ZOOM}
        scrollWheelZoom
        zoomControl={false}
        attributionControl={false}
        className="leaflet-map bg-[#0b0f14]"
      >
        <Recenter center={center} zoom={6} bounds={bounds} />
        <TileLayer
          className="osm-dark-tiles"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxNativeZoom={OSM_MAX_NATIVE_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
        />
        {orderedMarkers.map((station) => (
          <StationMarker
            key={station.id}
            station={station}
            theme={theme}
            selected={selectedId != null && String(selectedId) === String(station.id)}
            onSelect={onSelectStation}
          />
        ))}
        <LocationMarker
          position={center}
          color={theme.primary}
          label={formatPlaceName(location?.name) || location?.name}
        />
      </MapContainer>
    </div>
  )
}
