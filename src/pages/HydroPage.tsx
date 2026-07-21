import { useMemo, useState } from 'react';
import { HiMagnifyingGlass } from 'react-icons/hi2';
import { ClientOnly } from '@tanstack/react-router';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { AppPage, PageHeader } from '../components/AppChrome';
import HydroMap from '../components/HydroMap';
import HydroPanel from '../components/HydroPanel';
import MarinePanel from '../components/MarinePanel';
import { useHydro } from '../hooks/useHydro';
import { useMarine } from '../hooks/useMarine';
import { useWeatherStore } from '../store/weatherStore';
import { formatPlaceName } from '../utils/formatters';

function matchesFilter(station, filter) {
  const q = String(filter || '').trim().toLowerCase();
  if (!q) return true;
  return (
    String(station.name || '').toLowerCase().includes(q) ||
    String(station.river || '').toLowerCase().includes(q)
  );
}

export default function HydroPage() {
  const location = useWeatherStore((state) => state.location);
  const [filter, setFilter] = useState('');
  const hydro = useHydro(50, location, '');
  const marine = useMarine(location, 16);

  const profiles = useMemo(() => {
    const list = hydro.data?.profiles || [];
    return list.filter((p) => matchesFilter(p, filter));
  }, [hydro.data?.profiles, filter]);

  const mapStations = useMemo(() => {
    const list = hydro.data?.mapStations || [];
    return list.filter((p) => matchesFilter(p, filter));
  }, [hydro.data?.mapStations, filter]);

  const panelData = hydro.data
    ? { ...hydro.data, profiles, total: profiles.length }
    : hydro.data;

  const showRivers = hydro.available;
  const showMarine = Boolean(marine.data?.spots?.length) || marine.loading || Boolean(marine.error);
  const nothing = !showRivers && !showMarine && !marine.loading;

  return (
    <AppPage>
      <PageHeader
        title="Voda"
        eyebrow={formatPlaceName(location?.name) || undefined}
        backTo="/"
        description="Řeky v okolí a teplota moře na dovolenkových plážích."
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
          <MarinePanel data={marine.data} loading={marine.loading} error={marine.error} />

          {showRivers ? (
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
                <p className="shrink-0 text-sm font-medium text-muted-foreground" aria-live="polite">
                  Mapa {mapStations.length}
                  {profiles.length ? ` · detail ${profiles.length}` : ''}
                </p>
              </div>

              <div>
                {hydro.loading && !hydro.data ? (
                  <Skeleton className="h-36 w-full rounded-md sm:h-44" />
                ) : (
                  <ClientOnly fallback={<Skeleton className="h-36 w-full rounded-md sm:h-44" />}>
                    <HydroMap location={location} stations={mapStations} />
                  </ClientOnly>
                )}
              </div>

              <HydroPanel data={panelData} loading={hydro.loading} error={hydro.error} limit={50} />
            </section>
          ) : (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle>Řeky mimo pokrytí</EmptyTitle>
                <EmptyDescription>
                  Hydrologie toků: CZ / SK / DE / PL / CH / FR / UK / IE / US / CA. Teplotu moře výše máš
                  globálně.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      )}
    </AppPage>
  );
}
