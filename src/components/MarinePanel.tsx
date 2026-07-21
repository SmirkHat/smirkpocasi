import { Waves } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { Card, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getChartTheme } from './charts/chartTheme';

function formatSeaTemp(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(1)} °C`;
}

function sstFill(temp) {
  if (!Number.isFinite(temp)) return 'var(--muted-foreground)';
  if (temp < 16) return '#38bdf8';
  if (temp < 20) return '#22d3ee';
  if (temp < 24) return '#2dd4bf';
  if (temp < 27) return '#f59e0b';
  return '#f97316';
}

function formatWave(height) {
  if (!Number.isFinite(height)) return null;
  if (height < 0.1) return 'klidné';
  return `${height.toFixed(1)} m`;
}

function formatTrend(trend) {
  if (trend == null || !Number.isFinite(trend) || Math.abs(trend) < 0.3) return null;
  const arrow = trend > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(trend).toFixed(1)} °C / 7 d`;
}

function TempSparkline({ history, temperature }) {
  const theme = getChartTheme();
  const data = (history || []).map((row) => ({ v: row.v }));
  if (data.length < 2) return null;
  const color = sstFill(temperature);

  return (
    <div className="mt-2 h-8 w-full max-w-[200px]" role="img" aria-label="Průběh teploty vody">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color || theme.info}
            fill={color || theme.info}
            fillOpacity={0.2}
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ForecastStrip({ forecast, temperature }) {
  const theme = getChartTheme();
  const data = (forecast || []).map((row) => ({
    day: String(row.date || '').slice(5),
    t: row.temperature,
  }));
  if (data.length < 2) return null;
  const color = sstFill(temperature);

  return (
    <div className="mt-3 h-28 w-full" role="img" aria-label="Předpověď teploty vody na 7 dní">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <XAxis dataKey="day" tick={{ fill: theme.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            domain={['dataMin - 1', 'dataMax + 1']}
            tick={{ fill: theme.muted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <RechartsTooltip
            contentStyle={{
              background: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => [`${Number(value).toFixed(1)} °C`, 'Voda']}
          />
          <Area
            type="monotone"
            dataKey="t"
            stroke={color || theme.info}
            fill={color || theme.info}
            fillOpacity={0.18}
            strokeWidth={2}
            isAnimationActive={false}
            dot={{ r: 2.5, fill: color || theme.info, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function waveMeta(spot) {
  const parts = [];
  const wave = formatWave(spot.waveHeight);
  if (wave) {
    parts.push(
      spot.waveDirectionLabel ? `Vlny ${wave} od ${spot.waveDirectionLabel}` : `Vlny ${wave}`,
    );
  }
  if (spot.wavePeriod != null) parts.push(`${spot.wavePeriod} s`);
  if (spot.windWaveHeight != null && spot.swellWaveHeight != null) {
    parts.push(`vítr ${formatWave(spot.windWaveHeight)} · swell ${formatWave(spot.swellWaveHeight)}`);
  }
  return parts;
}

export default function MarinePanel({ data, loading, error }) {
  const spots = data?.spots || [];
  const nearest = data?.nearest;

  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Moře</CardTitle>
        </CardHeader>
        <CardPanel className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardPanel>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Moře</CardTitle>
        </CardHeader>
        <CardPanel>
          <p className="text-sm text-destructive">{error}</p>
        </CardPanel>
      </Card>
    );
  }

  if (!spots.length) return null;

  const nearestMeta = nearest ? waveMeta(nearest) : [];
  const nearestTrend = nearest ? formatTrend(nearest.trend) : null;

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Moře · teplota vody</CardTitle>
        {data?.attribution ? (
          <p className="text-xs text-muted-foreground">{data.attribution}</p>
        ) : null}
        {error ? <p className="text-xs text-warning">{error} · starší data</p> : null}
      </CardHeader>
      <CardPanel>
        {nearest ? (
          <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Nejbližší pláž
              {nearest.distanceKm != null ? ` · ${nearest.distanceKm} km` : ''}
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-foreground">{nearest.name}</p>
                <p className="truncate text-xs text-muted-foreground">{nearest.region}</p>
              </div>
              <p className="shrink-0 text-2xl font-semibold tabular-nums" style={{ color: sstFill(nearest.temperature) }}>
                {formatSeaTemp(nearest.temperature)}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {nearestMeta.map((part) => (
                <span key={part}>{part}</span>
              ))}
              {nearestTrend ? (
                <span className={cn(nearest.trend > 0 ? 'text-warning' : 'text-success')}>{nearestTrend}</span>
              ) : null}
            </div>
            <TempSparkline history={nearest.history} temperature={nearest.temperature} />
            <ForecastStrip forecast={nearest.forecast} temperature={nearest.temperature} />
          </div>
        ) : null}

        <div className="divide-y divide-border">
          {spots.map((spot) => {
            const meta = waveMeta(spot);
            const trend = formatTrend(spot.trend);
            return (
              <div
                key={spot.id}
                className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 py-3 text-left first:pt-0 last:pb-0"
              >
                <Waves
                  className="mt-0.5 size-6"
                  style={{ color: sstFill(spot.temperature) }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{spot.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {spot.region}
                    {spot.distanceKm != null ? ` · ${spot.distanceKm} km` : ''}
                  </div>
                  {meta.length || trend ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {meta.map((part) => (
                        <span key={part}>{part}</span>
                      ))}
                      {trend ? (
                        <span className={cn(spot.trend > 0 ? 'text-warning' : 'text-success')}>{trend}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <span
                  className={cn('text-sm font-semibold tabular-nums')}
                  style={{ color: sstFill(spot.temperature) }}
                >
                  {formatSeaTemp(spot.temperature)}
                </span>
              </div>
            );
          })}
        </div>
      </CardPanel>
    </Card>
  );
}
