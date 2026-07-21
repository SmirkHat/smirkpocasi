import { WiFlood } from 'react-icons/wi';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import HydroLevelsChart, { HydroSparkline } from './charts/HydroLevelsChart';
import { floodFill, getChartTheme } from './charts/chartTheme';
import { formatHydroName, formatFlow } from '../utils/formatters';

const SPA_COLORS = {
  0: 'success',
  1: 'warning',
  2: 'warning',
  3: 'destructive',
};

const SPA_LABELS = {
  0: 'Normál',
  1: '1. SPA',
  2: '2. SPA',
  3: '3. SPA',
};

function formatTrend(trend) {
  if (trend == null || !Number.isFinite(trend) || Math.abs(trend) < 0.5) return null;
  const arrow = trend > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(trend).toFixed(0)} cm`;
}

/** Visual track: dry → current → SPA1/2/3 on a shared scale. */
function SpaGauge({ height, dry, spa1, spa2, spa3, floodLevel }) {
  const theme = getChartTheme();
  if (height == null || spa1 == null) return null;

  const max = Math.max(spa3 ?? spa2 ?? spa1 * 1.4, height, spa1) * 1.05;
  const min = Math.min(dry ?? 0, height, spa1) * 0.85;
  const span = max - min || 1;
  const pct = (v) => `${Math.max(0, Math.min(100, ((v - min) / span) * 100))}%`;

  return (
    <div className="mt-2" aria-hidden="true">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width]"
          style={{ width: pct(height), background: floodFill(floodLevel, theme) }}
        />
        {spa1 != null ? (
          <span className="absolute top-0 h-full w-px bg-warning/80" style={{ left: pct(spa1) }} title="SPA1" />
        ) : null}
        {spa2 != null ? (
          <span className="absolute top-0 h-full w-px bg-warning" style={{ left: pct(spa2) }} title="SPA2" />
        ) : null}
        {spa3 != null ? (
          <span className="absolute top-0 h-full w-px bg-destructive" style={{ left: pct(spa3) }} title="SPA3" />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{dry != null ? `Sucho ${Math.round(dry)}` : ' '}</span>
        <span>SPA1 {Math.round(spa1)} cm</span>
        {spa3 != null ? <span>SPA3 {Math.round(spa3)}</span> : spa2 != null ? <span>SPA2 {Math.round(spa2)}</span> : <span />}
      </div>
    </div>
  );
}

export default function HydroPanel({ data, loading, error, limit }) {
  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stav toků v okolí</CardTitle>
        </CardHeader>
        <CardPanel className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardPanel>
      </Card>
    );
  }
  if (error) return null;
  if (!data?.profiles?.length) return null;

  const profiles = data.profiles.slice(0, limit);
  const withSpa = profiles.filter((p) => p.spaPct != null);

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Stav toků v okolí</CardTitle>
        {data.attribution ? (
          <p className="text-xs text-muted-foreground">{data.attribution}</p>
        ) : null}
      </CardHeader>
      <CardPanel>
        {withSpa.length ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Graf ukazuje naplnění ke stupni SPA&nbsp;1 (v Německu k průměrné povodňové hladině MHW) —
              absolutní centimetry mezi řekami nelze srovnávat.
            </p>
            <HydroLevelsChart profiles={profiles} limit={limit} />
          </>
        ) : null}

        <div className="divide-y divide-border">
          {profiles.map((p) => {
            const trend = formatTrend(p.trend);
            return (
              <div
                key={p.id}
                className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 py-3 text-left first:pt-0 last:pb-0"
              >
                <WiFlood className="mt-0.5 size-7 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{formatHydroName(p.name)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatHydroName(p.river)}
                    {p._dist != null || p.distance != null
                      ? ` · ${Math.round(p.distance ?? p._dist)} km`
                      : ''}
                    {p.country && p.country !== 'CZ' ? ` · ${p.country}` : ''}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {p.flow != null ? <span>{formatFlow(p.flow)} m³/s</span> : null}
                    {p.waterTemperature != null ? (
                      <span>Teplota {Number(p.waterTemperature).toFixed(1)} °C</span>
                    ) : null}
                    {p.spaPct != null ? <span>{Math.round(p.spaPct)} % SPA1</span> : null}
                    {trend ? (
                      <span className={cn(p.trend > 0 ? 'text-warning' : 'text-success')}>{trend}</span>
                    ) : null}
                  </div>
                  <SpaGauge
                    height={p.height}
                    dry={p.dry}
                    spa1={p.spa1}
                    spa2={p.spa2}
                    spa3={p.spa3}
                    floodLevel={p.floodLevel}
                  />
                  <HydroSparkline history={p.history} floodLevel={p.floodLevel} className="mt-2 w-full max-w-[220px]" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    {p.height != null
                      ? `${Math.round(p.height)} cm`
                      : p.flow != null
                        ? `${formatFlow(p.flow)} m³/s`
                        : p.waterTemperature != null
                          ? `${Number(p.waterTemperature).toFixed(1)} °C`
                          : '—'}
                  </span>
                  {p.floodLevel > 0 ? (
                    <Badge variant={SPA_COLORS[p.floodLevel]}>{SPA_LABELS[p.floodLevel]}</Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardPanel>
    </Card>
  );
}
