import { useEffect, useState } from 'react'
import { HiCheckCircle, HiMagnifyingGlass, HiMapPin, HiStar, HiTrash, HiXMark } from 'react-icons/hi2'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { apiUrl } from '@/lib/apiBase'
import MeteostatHistoryChart from './charts/MeteostatHistoryChart'
import { useLocation } from '../hooks/useLocation'
import { useMeteostatHistory } from '../hooks/useMeteostatHistory'
import { useWeatherStore } from '../store/weatherStore'
import { formatPlaceName } from '../utils/formatters'
import { hapticLight, hapticMedium } from '../utils/haptics'

const MIN_QUERY_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 250

function placeDetail(place: { label?: string; subtitle?: string }) {
  return [place.label, place.subtitle].filter(Boolean).join(' · ')
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
  )
}

export default function LocationPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { useGps, loadingGps, gpsError, gpsNotice } = useLocation()
  const location = useWeatherStore((state) => state.location)
  const favorites = useWeatherStore((state) => state.favorites)
  const setLocation = useWeatherStore((state) => state.setLocation)
  const addFavorite = useWeatherStore((state) => state.addFavorite)
  const removeFavorite = useWeatherStore((state) => state.removeFavorite)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmedQuery = query.trim()
  const meteostat = useMeteostatHistory(open ? location : null)
  const apiKeyProvidersEnabled = import.meta.env.VITE_ENABLE_API_KEY_PROVIDERS === 'true'

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setError(null)
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      setError(null)
      return undefined
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      fetch(apiUrl(`/api/geocode?q=${encodeURIComponent(trimmedQuery)}`), { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null)
          if (!response.ok) throw new Error(payload?.error || 'Našeptávání se nepodařilo.')
          return payload
        })
        .then((items) => setResults(Array.isArray(items) ? items : []))
        .catch((searchError) => {
          if (searchError.name !== 'AbortError') {
            setResults([])
            setError(searchError.message)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [open, trimmedQuery])

  function choosePlace(place: any) {
    const nextLocation = {
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      ...(place.label ? { label: place.label } : {}),
      ...(place.fullName ? { fullName: place.fullName } : {}),
      ...(place.source ? { source: place.source } : {}),
    }
    hapticMedium()
    setLocation(nextLocation)
    addFavorite(nextLocation)
    onOpenChange(false)
  }

  function chooseFavorite(favorite: any) {
    hapticMedium()
    setLocation(favorite)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl sm:max-w-3xl" bottomStickOnMobile>
        <DialogHeader className="pe-12">
          <DialogTitle>Výběr lokace</DialogTitle>
          <DialogDescription>Vyberte město nebo uložené místo pro předpověď.</DialogDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                hapticLight()
                useGps(() => onOpenChange(false))
              }}
              loading={loadingGps}
            >
              <HiMapPin aria-hidden="true" />
              {loadingGps ? 'Zjišťuji polohu' : 'Moje poloha'}
            </Button>
            {location?.name ? (
              <p className="truncate text-xs text-muted-foreground">
                Teď: <span className="font-medium text-foreground">{formatPlaceName(location.name)}</span>
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Nejdřív se zeptá na GPS v prohlížeči. Když to nepůjde, odhadne polohu z IP (Vercel geo / veřejná IP).
          </p>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (results[0]) choosePlace(results[0])
            }}
          >
            <InputGroup className="h-11">
              <InputGroupAddon>
                <HiMagnifyingGlass aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                aria-autocomplete="list"
                aria-controls="location-suggestions"
                aria-expanded={results.length > 0}
                aria-label="Hledat město nebo adresu"
                autoComplete="off"
                autoFocus
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
                      setQuery('')
                      setResults([])
                      setError(null)
                    }}
                  >
                    <HiXMark aria-hidden="true" />
                  </Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </form>

          {gpsError ? (
            <Alert variant="error">
              <AlertDescription>{gpsError}</AlertDescription>
            </Alert>
          ) : null}

          {gpsNotice && !gpsError ? (
            <Alert variant="warning">
              <AlertDescription>{gpsNotice}</AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="min-w-0 rounded-xl border border-border/60 bg-background/40">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                <h3 className="text-sm font-semibold text-foreground">Našeptávání</h3>
                {loading ? <Badge variant="secondary">Hledám...</Badge> : null}
              </div>
              <div className="px-3 py-2">
                {trimmedQuery.length < MIN_QUERY_LENGTH ? (
                  <Empty className="py-8">
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
                  <Empty className="py-8">
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
                        className="grid w-full grid-cols-[auto_1fr] items-center gap-3 py-2.5 text-left first:pt-0 last:pb-0"
                        onClick={() => choosePlace(place)}
                      >
                        <HiMapPin className="size-5 text-primary" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {formatPlaceName(place.name)}
                          </span>
                          {placeDetail(place) ? (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {placeDetail(place)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <GeocodeAttribution />
              </div>
            </section>

            <section className="min-w-0 rounded-xl border border-border/60 bg-background/40">
              <div className="border-b border-border/60 px-3 py-2">
                <h3 className="text-sm font-semibold text-foreground">Moje oblíbené</h3>
              </div>
              <div className="divide-y divide-border px-3 py-2">
                {favorites.length === 0 ? (
                  <Empty className="py-8">
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
                  const active =
                    location.name === favorite.name &&
                    location.lat === favorite.lat &&
                    location.lon === favorite.lon
                  const detail =
                    favorite.label && favorite.label !== favorite.name
                      ? `${favorite.label} · ${favorite.lat}, ${favorite.lon}`
                      : `${favorite.lat}, ${favorite.lon}`
                  return (
                    <div
                      key={`${favorite.name}-${favorite.lat}-${favorite.lon}`}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-2 py-2.5 first:pt-0 last:pb-0"
                    >
                      <HiStar className="size-5 text-warning" aria-hidden="true" />
                      <button type="button" className="min-w-0 text-left" onClick={() => chooseFavorite(favorite)}>
                        <div className="truncate text-sm font-semibold text-foreground">
                          {formatPlaceName(favorite.name)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{detail}</div>
                      </button>
                      <div className="flex items-center gap-1">
                        {active ? (
                          <Badge variant="success" className="hidden gap-1 sm:inline-flex">
                            <HiCheckCircle className="size-3.5" aria-hidden="true" />
                            Aktivní
                          </Badge>
                        ) : null}
                        <Button
                          type="button"
                          variant="destructive-outline"
                          size="icon-sm"
                          aria-label={`Odebrat ${formatPlaceName(favorite.name) || favorite.name}`}
                          onClick={() => removeFavorite(favorite)}
                        >
                          <HiTrash aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          {apiKeyProvidersEnabled ? (
            <section className="rounded-xl border border-border/60 bg-background/40 px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Historie (Meteostat)</h3>
                {meteostat.loading ? <Badge variant="secondary">Načítám...</Badge> : null}
              </div>
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
                  <div className="mt-3 overflow-x-auto">
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
                        {meteostat.data.days.map((day: any) => (
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
            </section>
          ) : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
