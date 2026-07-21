import { useEffect, useState } from 'react';
import { HiCheckCircle, HiMagnifyingGlass, HiMapPin, HiStar, HiTrash, HiXMark } from 'react-icons/hi2';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { AppPage, PageHeader } from '../components/AppChrome';
import MeteostatHistoryChart from '../components/charts/MeteostatHistoryChart';
import { useLocation } from '../hooks/useLocation';
import { useMeteostatHistory } from '../hooks/useMeteostatHistory';
import { useNavigate } from '@tanstack/react-router';
import { useWeatherStore } from '../store/weatherStore';
import { formatPlaceName } from '../utils/formatters';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

function placeDetail(place) {
  return [place.label, place.subtitle].filter(Boolean).join(' · ');
}

function GeocodeAttribution() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>
        Našeptává{' '}
        <a className="hover:text-foreground" href="https://open-meteo.com/en/docs/geocoding-api" rel="noreferrer" target="_blank">
          Open-Meteo
        </a>
        {' · '}
        <a className="hover:text-foreground" href="https://photon.komoot.io/" rel="noreferrer" target="_blank">
          Photon
        </a>
        {' · '}
        <a className="hover:text-foreground" href="https://nominatim.org/" rel="noreferrer" target="_blank">
          Nominatim
        </a>
      </span>
      <a className="hover:text-foreground" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">
        © OpenStreetMap
      </a>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { useGps, loadingGps, gpsError } = useLocation();
  const location = useWeatherStore((state) => state.location);
  const favorites = useWeatherStore((state) => state.favorites);
  const setLocation = useWeatherStore((state) => state.setLocation);
  const addFavorite = useWeatherStore((state) => state.addFavorite);
  const removeFavorite = useWeatherStore((state) => state.removeFavorite);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const trimmedQuery = query.trim();
  const meteostat = useMeteostatHistory(location);
  const apiKeyProvidersEnabled = import.meta.env.VITE_ENABLE_API_KEY_PROVIDERS === 'true';

  useEffect(() => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`/api/geocode?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error || 'Našeptávání se nepodařilo.');
          return payload;
        })
        .then((items) => setResults(Array.isArray(items) ? items : []))
        .catch((searchError) => {
          if (searchError.name !== 'AbortError') {
            setResults([]);
            setError(searchError.message);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [trimmedQuery]);

  function choosePlace(place) {
    const nextLocation = {
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      ...(place.label ? { label: place.label } : {}),
      ...(place.fullName ? { fullName: place.fullName } : {}),
      ...(place.source ? { source: place.source } : {})
    };
    setLocation(nextLocation);
    addFavorite(nextLocation);
    navigate({ to: '/' });
  }

  function chooseFavorite(favorite) {
    setLocation(favorite);
    navigate({ to: '/' });
  }

  return (
    <AppPage>
      <PageHeader
        title="Výběr lokace"
        eyebrow="Lokace"
        backTo="/"
        description="Vyberte město nebo uložené místo pro předpověď."
        actions={
          <Button type="button" variant="outline" onClick={useGps} loading={loadingGps}>
            <HiMapPin aria-hidden="true" />
            {loadingGps ? 'Hledám' : 'Moje poloha'}
          </Button>
        }
      />

      <form
        className="mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) choosePlace(results[0]);
        }}
      >
        <InputGroup className="h-12">
          <InputGroupAddon>
            <HiMagnifyingGlass aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-autocomplete="list"
            aria-controls="location-suggestions"
            aria-expanded={results.length > 0}
            aria-label="Hledat město nebo adresu"
            autoComplete="off"
            placeholder="Město nebo obec"
            role="combobox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Vymazat hledání"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setError(null);
                }}
              >
                <HiXMark aria-hidden="true" />
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </form>

      {gpsError ? (
        <Alert className="mb-4" variant="error">
          <AlertDescription>{gpsError}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert className="mb-4" variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Našeptávání</CardTitle>
            <CardAction>
              {loading ? <Badge variant="secondary">Hledám...</Badge> : null}
            </CardAction>
          </CardHeader>
          <CardPanel>
            {trimmedQuery.length < MIN_QUERY_LENGTH ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HiMagnifyingGlass aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Začněte psát lokaci</EmptyTitle>
                  <EmptyDescription>Výsledky se doplňují automaticky.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
            {trimmedQuery.length >= MIN_QUERY_LENGTH && results.length === 0 && !loading ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HiMapPin aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Nic jsem nenašel</EmptyTitle>
                  <EmptyDescription>Zkuste kratší název nebo přesnější adresu.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
            {results.length > 0 ? (
              <div id="location-suggestions" className="divide-y divide-border" role="listbox">
                {results.map((place) => (
                  <button
                    key={place.id || `${place.lat}-${place.lon}`}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 py-3 text-left first:pt-0 last:pb-0"
                    onClick={() => choosePlace(place)}
                  >
                    <HiMapPin className="size-6 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{formatPlaceName(place.name)}</span>
                      {placeDetail(place) ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{placeDetail(place)}</span> : null}
                    </span>
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {place.source || 'Open-Meteo'}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : null}
            <GeocodeAttribution />
          </CardPanel>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moje oblíbené</CardTitle>
          </CardHeader>
          <CardPanel className="divide-y divide-border">
            {favorites.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HiStar aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Žádné oblíbené lokace</EmptyTitle>
                  <EmptyDescription>Vyhledané město se po výběru uloží mezi oblíbené.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
            {favorites.map((favorite) => {
              const active = location.name === favorite.name && location.lat === favorite.lat && location.lon === favorite.lon;
              const detail = favorite.label && favorite.label !== favorite.name
                ? `${favorite.label} · ${favorite.lat}, ${favorite.lon}`
                : `${favorite.lat}, ${favorite.lon}`;
              return (
                <div key={`${favorite.name}-${favorite.lat}-${favorite.lon}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <HiStar className="size-6 text-warning" aria-hidden="true" />
                  <button type="button" className="min-w-0 text-left" onClick={() => chooseFavorite(favorite)}>
                    <div className="truncate text-sm font-semibold text-foreground">{formatPlaceName(favorite.name)}</div>
                    <div className="truncate text-xs text-muted-foreground">{detail}</div>
                  </button>
                  <div className="flex items-center gap-1">
                    {active ? (
                      <Badge variant="success" className="hidden gap-1 sm:inline-flex">
                        <HiCheckCircle className="size-4" aria-hidden="true" />
                        Aktivní
                      </Badge>
                    ) : null}
                    <Button type="button" variant="destructive-outline" size="icon-sm" aria-label={`Odebrat ${formatPlaceName(favorite.name) || favorite.name}`} onClick={() => removeFavorite(favorite)}>
                      <HiTrash aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardPanel>
        </Card>
      </div>

      {apiKeyProvidersEnabled ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Historie (Meteostat)</CardTitle>
            <CardAction>
              {meteostat.loading ? <Badge variant="secondary">Načítám...</Badge> : null}
            </CardAction>
          </CardHeader>
          <CardPanel>
            {meteostat.data?.disabled ? (
              <p className="text-sm text-muted-foreground">
                Meteostat je zapnutý flagem, ale na serveru chybí <code>METEOSTAT_KEY</code>.
              </p>
            ) : null}
            {meteostat.error ? (
              <Alert variant="error">
                <AlertDescription>{meteostat.error}</AlertDescription>
              </Alert>
            ) : null}
            {meteostat.data?.station ? (
              <p className="mb-3 text-xs text-muted-foreground">
                Bod {meteostat.data.station.name}
                {meteostat.data.attribution ? ` · ${meteostat.data.attribution}` : ''}
              </p>
            ) : null}
            {meteostat.data?.days?.length ? (
              <>
              <MeteostatHistoryChart days={meteostat.data.days} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Den</th>
                      <th className="py-1 pr-3 font-medium">Ø</th>
                      <th className="py-1 pr-3 font-medium">Min</th>
                      <th className="py-1 pr-3 font-medium">Max</th>
                      <th className="py-1 font-medium">Srážky</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meteostat.data.days.map((day) => (
                      <tr key={day.date} className="border-t border-border">
                        <td className="py-1.5 pr-3">{day.date}</td>
                        <td className="py-1.5 pr-3">{day.tavg != null ? `${day.tavg}°` : '—'}</td>
                        <td className="py-1.5 pr-3">{day.tmin != null ? `${day.tmin}°` : '—'}</td>
                        <td className="py-1.5 pr-3">{day.tmax != null ? `${day.tmax}°` : '—'}</td>
                        <td className="py-1.5">{day.prcp != null ? `${day.prcp} mm` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            ) : null}
          </CardPanel>
        </Card>
      ) : null}
    </AppPage>
  );
}
