import { useMemo, useState } from 'react'
import { HiMagnifyingGlass } from 'react-icons/hi2'
import { MapPin } from 'lucide-react'
import { ClientOnly } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { AppPage, PageHeader } from '../components/AppChrome'
import HydroMap from '../components/HydroMap'
import HydroPanel from '../components/HydroPanel'
import MarinePanel from '../components/MarinePanel'
import { useHydro } from '../hooks/useHydro'
import { useMarine } from '../hooks/useMarine'
import { useUiStore } from '../store/uiStore'
import { useWeatherStore } from '../store/weatherStore'
import { formatPlaceName } from '../utils/formatters'
import {
  nearestDistanceKm,
  resolveWaterPriority,
  riverStationDistance,
} from '../utils/waterPriority'

function matchesFilter(station, filter) {
  const q = String(filter || '').trim().toLowerCase()
  if (!q) return true
  return (
    String(station.name || '').toLowerCase().includes(q) ||
    String(station.river || '').toLowerCase().includes(q)
  )
}

export default function HydroPage() {
  const location = useWeatherStore((state) => state.location)
  const openLocationPicker = useUiStore((state) => state.openLocationPicker)
  const [filter, setFilter] = useState('')
  const [selectedStationId, setSelectedStationId] = useState(null)
  const hydro = useHydro(50, location, '')
  const marine = useMarine(location, 16)
  const placeName = formatPlaceName(location?.name) || 'Vybraná poloha'

  const profiles = useMemo(() => {
    const list = hydro.data?.profiles || []
    return list.filter((p) => matchesFilter(p, filter))
  }, [hydro.data?.profiles, filter])

  const mapStations = useMemo(() => {
    return (hydro.data?.mapStations || []).filter(
      (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)),
    )
  }, [hydro.data?.mapStations])

  const panelProfiles = useMemo(() => {
    if (selectedStationId == null) return profiles
    if (profiles.some((p) => String(p.id) === String(selectedStationId))) return profiles

    const fromMap = mapStations.find((s) => String(s.id) === String(selectedStationId))
    if (!fromMap) return profiles
    return [fromMap, ...profiles]
  }, [mapStations, profiles, selectedStationId])

  const panelData = hydro.data
    ? { ...hydro.data, profiles: panelProfiles, total: panelProfiles.length }
    : hydro.data

  function handleSelectStation(station) {
    if (!station?.id) return
    setSelectedStationId(station.id)
    if (filter.trim() && !matchesFilter(station, filter)) {
      setFilter('')
    }
  }

  const showRivers = hydro.available
  const showMarine =
    Boolean(marine.data?.spots?.length) || marine.loading || Boolean(marine.error)
  const nothing = !showRivers && !showMarine && !marine.loading

  const priority = useMemo(() => {
    const nearestRiverKm = nearestDistanceKm(
      (hydro.data?.profiles || []).map(riverStationDistance),
    )
    const nearestSeaKm = nearestDistanceKm([
      marine.data?.nearest?.distanceKm,
      ...(marine.data?.spots || []).map((spot) => spot.distanceKm),
    ])

    // While loading, keep a stable preference from whatever we already know.
    const hasRivers = Boolean(hydro.data?.profiles?.length)
    const hasSeas = Boolean(marine.data?.spots?.length)

    if (hasRivers || hasSeas) {
      return resolveWaterPriority({
        nearestRiverKm,
        nearestSeaKm,
        hasRivers,
        hasSeas,
      })
    }

    // No data yet: inland coverage → rivers first; otherwise seas.
    if (hydro.available) return 'rivers'
    if (marine.loading || marine.data || marine.error) return 'seas'
    return 'rivers'
  }, [hydro.available, hydro.data, marine.data, marine.error, marine.loading])

  const riversFirst = priority !== 'seas'

  const riversSection = showRivers ? (
    <section className="space-y-4" aria-label="Vodní toky">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Vodní toky</h2>
        <p className="text-sm text-muted-foreground">
          ČHMÚ, SHMÚ, PEGELONLINE, Hub&apos;Eau, EA, USGS, IMGW, OPW, WSC a BAFU
          {hydro.data?.attribution ? ` · ${hydro.data.attribution}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <HiMagnifyingGlass aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Filtrovat řeku nebo stanici"
            placeholder="Filtrovat řeku nebo stanici"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </InputGroup>
      </div>

      <div>
        {hydro.loading && !hydro.data ? (
          <Skeleton className="h-80 w-full rounded-md sm:h-[28rem] lg:h-[36rem]" />
        ) : (
          <ClientOnly fallback={<Skeleton className="h-80 w-full rounded-md sm:h-[28rem] lg:h-[36rem]" />}>
            <HydroMap
              location={location}
              stations={mapStations}
              selectedId={selectedStationId}
              onSelectStation={handleSelectStation}
            />
          </ClientOnly>
        )}
      </div>

      <HydroPanel
        data={panelData}
        loading={hydro.loading}
        error={hydro.error}
        limit={50}
        selectedId={selectedStationId}
      />
    </section>
  ) : null

  const seasSection = showMarine ? (
    <MarinePanel data={marine.data} loading={marine.loading} error={marine.error} />
  ) : null

  const riversOutOfCoverage =
    !showRivers && !seasSection ? (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyTitle>Řeky mimo pokrytí</EmptyTitle>
          <EmptyDescription>
            Hydrologie toků: CZ / SK / DE / PL / CH / FR / UK / IE / US / CA. Teplotu moře máš
            globálně.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : null

  return (
    <AppPage>
      <PageHeader
        title="Voda"
        eyebrow={placeName}
        backTo="/"
        description={
          riversFirst
            ? 'Nejdřív vodní toky v okolí, pak teplota moře na dovolenkových plážích.'
            : 'Nejdřív teplota moře v okolí, pak vodní toky tam, kde je máme.'
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openLocationPicker}
            aria-haspopup="dialog"
            aria-label={`Změnit lokaci · ${placeName}`}
          >
            <MapPin aria-hidden="true" />
            {placeName}
          </Button>
        }
      />

      {nothing ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyTitle>Data zatím nejsou</EmptyTitle>
            <EmptyDescription>
              Zkus to znovu za chvíli, nebo změň lokaci.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-6">
          {riversFirst ? (
            <>
              {riversSection}
              {seasSection}
              {riversOutOfCoverage}
            </>
          ) : (
            <>
              {seasSection}
              {riversSection}
            </>
          )}
        </div>
      )}
    </AppPage>
  )
}
