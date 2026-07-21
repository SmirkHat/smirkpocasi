import { useMemo } from 'react'
import { Droplets, Waves } from 'lucide-react'
import { HiArrowsPointingOut } from 'react-icons/hi2'
import { WiFlood } from 'react-icons/wi'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useHydro } from '../hooks/useHydro'
import { useMarine } from '../hooks/useMarine'
import { formatFlow, formatHydroName } from '../utils/formatters'
import {
  nearestDistanceKm,
  resolveWaterPriority,
  riverStationDistance,
  type WaterPriorityMode,
} from '../utils/waterPriority'

const PREVIEW_LIMIT = 4

function sstColor(temp: number | null | undefined) {
  if (!Number.isFinite(Number(temp))) return 'var(--muted-foreground)'
  const value = Number(temp)
  if (value < 16) return '#38bdf8'
  if (value < 20) return '#22d3ee'
  if (value < 24) return '#2dd4bf'
  if (value < 27) return '#f59e0b'
  return '#f97316'
}

function formatKm(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null
  return `${Math.round(km)} km`
}

function formatSeaTemp(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(1)} °C`
}

type Mode = WaterPriorityMode

/**
 * Home teaser for /hydro — rivers win unless the nearest sea is strictly closer.
 */
export default function VodaPreview({
  location,
}: {
  location: { lat?: number; lon?: number; name?: string } | null
}) {
  const navigate = useNavigate()
  const hydro = useHydro(PREVIEW_LIMIT, location, '')
  const marine = useMarine(location, PREVIEW_LIMIT)

  const preview = useMemo(() => {
    const rivers = (hydro.data?.profiles || []).slice(0, PREVIEW_LIMIT)
    const seas = (marine.data?.spots || []).slice(0, PREVIEW_LIMIT)
    const nearestRiverKm = nearestDistanceKm(rivers.map(riverStationDistance))
    const nearestSeaKm = nearestDistanceKm([
      marine.data?.nearest?.distanceKm,
      ...seas.map((spot) => spot.distanceKm),
    ])

    const hasRivers = rivers.length > 0
    const hasSeas = seas.length > 0
    const mode = resolveWaterPriority({
      nearestRiverKm,
      nearestSeaKm,
      hasRivers,
      hasSeas,
    })

    return {
      mode,
      rivers,
      seas,
      nearestRiverKm,
      nearestSeaKm,
      secondary:
        mode === 'rivers' && hasSeas
          ? {
              label: marine.data?.nearest?.name || seas[0]?.name,
              distanceKm: nearestSeaKm,
              kind: 'seas' as const,
            }
          : mode === 'seas' && hasRivers
            ? {
                label: formatHydroName(rivers[0]?.river || rivers[0]?.name),
                distanceKm: nearestRiverKm,
                kind: 'rivers' as const,
              }
            : null,
    }
  }, [hydro.data, marine.data])

  const hydroPending = hydro.available && hydro.loading && !hydro.data
  const marinePending = marine.loading && !marine.data
  const loading = hydroPending || marinePending

  if (loading) {
    return (
      <Card aria-busy="true" aria-label="Načítám vodu v okolí">
        <CardHeader className="pb-0">
          <CardTitle>Voda</CardTitle>
        </CardHeader>
        <CardPanel className="space-y-3 pt-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardPanel>
      </Card>
    )
  }

  if (!preview.mode) return null

  const openHydro = () => navigate({ to: '/hydro' })
  const title = preview.mode === 'rivers' ? 'Voda · řeky v okolí' : 'Voda · moře a oceány'
  const description =
    preview.mode === 'rivers'
      ? 'Stav toků z hydrologických stanic'
      : 'Teplota vody na dovolenkových pobřežích'

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <CardAction>
          <Button type="button" variant="ghost" size="sm" onClick={openHydro}>
            <HiArrowsPointingOut aria-hidden="true" />
            Otevřít
          </Button>
        </CardAction>
      </CardHeader>
      <CardPanel className="pt-2">
        {preview.mode === 'rivers' ? (
          <div className="divide-y divide-border">
            {preview.rivers.map((profile) => {
              const km = formatKm(riverStationDistance(profile))
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={openHydro}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 py-3 text-left transition-colors first:pt-1 last:pb-0 hover:bg-muted/40"
                >
                  <WiFlood className="mt-0.5 size-7 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {formatHydroName(profile.name)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatHydroName(profile.river)}
                      {km ? ` · ${km}` : ''}
                      {profile.country && profile.country !== 'CZ' ? ` · ${profile.country}` : ''}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {profile.height != null
                      ? `${Math.round(profile.height)} cm`
                      : profile.flow != null
                        ? `${formatFlow(profile.flow)} m³/s`
                        : profile.waterTemperature != null
                          ? `${Number(profile.waterTemperature).toFixed(1)} °C`
                          : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {preview.seas.map((spot) => {
              const km = formatKm(spot.distanceKm)
              return (
                <button
                  key={spot.id}
                  type="button"
                  onClick={openHydro}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 py-3 text-left transition-colors first:pt-1 last:pb-0 hover:bg-muted/40"
                >
                  <Waves
                    className="mt-0.5 size-6"
                    style={{ color: sstColor(spot.temperature) }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{spot.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {spot.region}
                      {km ? ` · ${km}` : ''}
                    </div>
                  </div>
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: sstColor(spot.temperature) }}
                  >
                    {formatSeaTemp(spot.temperature)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {preview.secondary ? (
          <button
            type="button"
            onClick={openHydro}
            className={cn(
              'mt-3 flex w-full items-center gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5 text-left transition-colors hover:bg-muted/45',
            )}
          >
            {preview.secondary.kind === 'seas' ? (
              <Waves className="size-4 shrink-0 text-info" aria-hidden="true" />
            ) : (
              <Droplets className="size-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {preview.secondary.kind === 'seas' ? 'Nejbližší moře' : 'Nejbližší řeka'}
              {preview.secondary.label ? `: ${preview.secondary.label}` : ''}
              {preview.secondary.distanceKm != null
                ? ` · ${formatKm(preview.secondary.distanceKm)}`
                : ''}
            </span>
            <span className="shrink-0 text-xs font-medium text-primary">Více na Vodě</span>
          </button>
        ) : (
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={openHydro}>
              Podrobnosti na Vodě
            </Button>
          </div>
        )}
      </CardPanel>
    </Card>
  )
}
