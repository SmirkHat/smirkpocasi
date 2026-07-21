import { useMemo, useState, type ReactNode } from 'react';
import { WiRaindrop } from 'react-icons/wi';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { buildMergedForecastDays, type ForecastDay, type HourlyPoint } from '../utils/hourlyForecast';
import { formatDay, formatPrecipitation, formatTemperature, formatTime, formatWind } from '../utils/formatters';
import { getWeatherInfo } from '../utils/weatherCodes';
import { ChartFrame } from './charts/ChartFrame';
import { ChartTooltip } from './charts/ChartTooltip';
import { getChartTheme } from './charts/chartTheme';

type TabId = 'temp' | 'precip' | 'wind';

function dayLabel(day: ForecastDay, index: number) {
  if (index === 0) return 'Dnes';
  if (index === 1) return 'Zítra';
  return formatDay(day.date);
}

function WeekOverview({
  days,
  activeKey,
  onSelect,
}: {
  days: ForecastDay[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const temperatures = days.flatMap((day) => [day.tempMin, day.tempMax]).filter((value) => Number.isFinite(value));
  const rangeMin = temperatures.length ? Math.min(...temperatures) : 0;
  const rangeMax = temperatures.length ? Math.max(...temperatures) : 0;
  const range = Math.max(rangeMax - rangeMin, 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-border/70 pt-3">
      <p className="mb-2 shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Týdenní přehled
      </p>
      <div className="min-h-0" role="listbox" aria-label="Výběr dne">
        {days.map((day, index) => {
          const info = getWeatherInfo(day.weatherCode);
          const WeatherIcon = info.Icon;
          const selected = day.key === activeKey;
          const start = Number.isFinite(day.tempMin) ? ((day.tempMin! - rangeMin) / range) * 100 : 0;
          const end = Number.isFinite(day.tempMax) ? ((day.tempMax! - rangeMin) / range) * 100 : 100;

          return (
            <button
              key={day.key}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(day.key)}
              className={cn(
                'grid w-full grid-cols-[5.5rem_2rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors sm:grid-cols-[6.5rem_2.25rem_minmax(0,1fr)_3rem] sm:gap-3',
                selected ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <div className="min-w-0">
                <div className={cn('truncate text-sm', selected ? 'font-bold text-foreground' : 'font-semibold')}>
                  {dayLabel(day, index)}
                </div>
                <div className="truncate text-xs text-muted-foreground">{info.label}</div>
              </div>
              <WeatherIcon className="size-7 shrink-0 justify-self-center text-primary sm:size-8" aria-hidden="true" title={info.label} />
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground sm:w-8">
                  {day.tempMin == null ? '—' : `${Math.round(day.tempMin)}°`}
                </span>
                <div className="relative h-1.5 min-w-8 flex-1 rounded-full bg-background/80" aria-hidden="true">
                  <span
                    className="absolute inset-y-0 min-w-1.5 rounded-full bg-[linear-gradient(90deg,var(--info),var(--primary))]"
                    style={{ left: `${start}%`, width: `${Math.max(6, end - start)}%` }}
                  />
                </div>
                <span className="w-7 shrink-0 text-sm font-semibold tabular-nums text-foreground sm:w-8">
                  {day.tempMax == null ? '—' : `${Math.round(day.tempMax)}°`}
                </span>
              </div>
              <div className="flex items-center justify-end gap-0.5 text-xs font-semibold tabular-nums text-info">
                {day.precipSum != null && day.precipSum > 0 ? (
                  <>
                    <WiRaindrop className="size-3.5 shrink-0" aria-hidden="true" />
                    {day.precipSum < 1 ? day.precipSum.toFixed(1) : Math.round(day.precipSum)}
                  </>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function chartRows(hours: HourlyPoint[]) {
  return hours.map((hour) => ({
    key: hour.key,
    label: formatTime(hour.time),
    fullLabel: hour.time.toLocaleString('cs-CZ'),
    temperature: hour.temperature,
    precipMm: hour.precipMm ?? 0,
    precipProb: hour.precipProb,
    windSpeed: hour.windSpeed,
    windDirection: hour.windDirection,
    tempLabel: hour.temperature == null ? '' : `${Math.round(hour.temperature)}`,
    precipLabel:
      (hour.precipMm ?? 0) < 0.05
        ? '0'
        : hour.precipMm! >= 1
          ? `${Math.round(hour.precipMm!)}`
          : hour.precipMm!.toFixed(1),
    windLabel: hour.windSpeed == null ? '' : `${Math.round(hour.windSpeed)}`,
  }));
}

/** Show tick/label every 3 hours (Google-style density). */
function tickEvery3h(label: string, index: number) {
  return index % 3 === 0 ? label : '';
}

function WindArrow({ degrees }: { degrees: number | null | undefined }) {
  if (degrees == null || !Number.isFinite(degrees)) {
    return <span className="inline-block size-3 rounded-full bg-muted-foreground/30" aria-hidden="true" />;
  }
  // Meteorological "from" → point arrow downwind.
  const rotate = Number(degrees) + 180;
  return (
    <span
      className="inline-flex size-4 items-center justify-center text-muted-foreground"
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      ↓
    </span>
  );
}

function TempChart({ rows }: { rows: ReturnType<typeof chartRows> }) {
  const theme = useMemo(() => getChartTheme(), []);
  return (
    <ChartFrame label="Hodinová teplota" height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 28, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="forecastTempFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.primary} stopOpacity={0.4} />
              <stop offset="100%" stopColor={theme.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            tickFormatter={tickEvery3h}
          />
          <YAxis
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(value) => `${Math.round(value)}°`}
          />
          <Tooltip
            content={
              <ChartTooltip formatter={(value) => `Teplota: ${formatTemperature(value)}`} />
            }
          />
          <Area
            type="monotone"
            dataKey="temperature"
            name="temperatureFill"
            stroke="none"
            fill="url(#forecastTempFill)"
            isAnimationActive={false}
            tooltipType="none"
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="temperature"
            name="temperature"
            stroke={theme.primary}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: theme.primary, stroke: theme.card, strokeWidth: 2 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="tempLabel"
              position="top"
              content={({ x, y, value, index }) => {
                if (index % 3 !== 0 || !value) return null;
                return (
                  <text x={x} y={Number(y) - 8} textAnchor="middle" fill={theme.foreground} fontSize={12} fontWeight={600}>
                    {value}°
                  </text>
                );
              }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function PrecipChart({ rows }: { rows: ReturnType<typeof chartRows> }) {
  const theme = useMemo(() => getChartTheme(), []);
  const maxPrecip = Math.max(...rows.map((row) => row.precipMm), 0.5);

  return (
    <ChartFrame label="Hodinové srážky v milimetrech" height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 28, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            tickFormatter={tickEvery3h}
          />
          <YAxis
            domain={[0, Math.ceil(maxPrecip * 1.15 * 10) / 10]}
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(value) => `${Number(value).toFixed(value >= 1 ? 0 : 1)}`}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value, name) =>
                  name === 'precipProb'
                    ? `Pravděpodobnost: ${Math.round(Number(value))} %`
                    : `Srážky: ${formatPrecipitation(value)}`
                }
              />
            }
          />
          <Bar
            dataKey="precipMm"
            name="precipMm"
            fill={theme.info}
            fillOpacity={0.55}
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="precipLabel"
              position="top"
              content={({ x, y, value, index, width }) => {
                if (index % 3 !== 0) return null;
                const cx = Number(x) + Number(width || 0) / 2;
                return (
                  <text x={cx} y={Number(y) - 6} textAnchor="middle" fill={theme.foreground} fontSize={11} fontWeight={600}>
                    {value === '0' ? '0' : `${value}`}
                  </text>
                );
              }}
            />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function WindChart({ rows }: { rows: ReturnType<typeof chartRows> }) {
  const theme = useMemo(() => getChartTheme(), []);

  return (
    <div className="space-y-3">
      <ChartFrame label="Hodinový vítr" height={160}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 28, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={theme.border} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: theme.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              tickFormatter={tickEvery3h}
            />
            <YAxis
              tick={{ fill: theme.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(value) => `${Math.round(value)}`}
            />
            <Tooltip content={<ChartTooltip formatter={(value) => `Vítr: ${formatWind(value)}`} />} />
            <Line
              type="monotone"
              dataKey="windSpeed"
              stroke={theme.chart2 || theme.warning}
              strokeWidth={2.25}
              dot={false}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="windLabel"
                position="top"
                content={({ x, y, value, index }) => {
                  if (index % 3 !== 0 || !value) return null;
                  return (
                    <text x={x} y={Number(y) - 8} textAnchor="middle" fill={theme.foreground} fontSize={11} fontWeight={600}>
                      {value}
                    </text>
                  );
                }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="grid grid-cols-8 gap-1 sm:grid-cols-8" aria-hidden="true">
        {rows
          .filter((_, index) => index % 3 === 0)
          .slice(0, 8)
          .map((row) => (
            <div key={row.key} className="flex flex-col items-center gap-1 text-center">
              <span className="text-[0.6875rem] font-semibold tabular-nums text-foreground">
                {row.windSpeed == null ? '—' : `${Math.round(row.windSpeed)}`}
              </span>
              <WindArrow degrees={row.windDirection} />
              <span className="text-[0.625rem] text-muted-foreground">{row.label}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export function ForecastExplorerSkeleton() {
  return (
    <Card className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Načítám předpověď">
      <CardHeader className="shrink-0 pb-0">
        <CardTitle>Podrobná předpověď</CardTitle>
        <CardDescription>Hodinový graf a týdenní přehled</CardDescription>
      </CardHeader>
      <CardPanel className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <div className="flex gap-4 border-b pb-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-14" />
          </div>
          <Skeleton className="mt-3 h-[220px] w-full rounded-md" />
          <Skeleton className="mx-auto mt-2 h-3 w-40" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-border/70 pt-3">
          <p className="mb-2 shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Týdenní přehled
          </p>
          <div className="flex flex-col gap-1" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className="grid w-full grid-cols-[5.5rem_2rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-lg px-2 py-2 sm:grid-cols-[6.5rem_2.25rem_minmax(0,1fr)_3rem] sm:gap-3"
              >
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="size-7 justify-self-center rounded-full sm:size-8" />
                <div className="flex min-w-0 items-center gap-2">
                  <Skeleton className="h-4 w-7 shrink-0 sm:w-8" />
                  <Skeleton className="h-1.5 min-w-8 flex-1 rounded-full" />
                  <Skeleton className="h-4 w-7 shrink-0 sm:w-8" />
                </div>
                <Skeleton className="h-3.5 w-6 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}

/**
 * Google-style day explorer: tabs for temp / precip mm / wind,
 * merged hourly series from every forecast-capable source.
 */
export default function ForecastExplorer({
  hourly,
  daily,
  forecastSeries = [],
  fallback = null,
}: {
  hourly?: any;
  daily?: any;
  forecastSeries?: Array<{ id: string; name?: string; weight: number; kind: string; data: any }>;
  fallback?: ReactNode;
}) {
  const { days } = useMemo(
    () => buildMergedForecastDays({ hourly, daily, forecastSeries }),
    [hourly, daily, forecastSeries]
  );
  const [tab, setTab] = useState<TabId>('precip');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activeKey = selectedKey && days.some((day) => day.key === selectedKey) ? selectedKey : days[0]?.key;
  const activeDay = days.find((day) => day.key === activeKey) || days[0];
  const rows = useMemo(() => (activeDay ? chartRows(activeDay.hours) : []), [activeDay]);

  if (!days.length || !activeDay) return fallback;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 pb-0">
        <CardTitle>Podrobná předpověď</CardTitle>
        <CardDescription>Hodinový graf a týdenní přehled</CardDescription>
      </CardHeader>
      <CardPanel className="flex min-h-0 flex-1 flex-col gap-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)} className="shrink-0">
          <div className="border-b">
            <TabsList variant="underline">
              <TabsTab className="rounded-none" value="temp">Teplota</TabsTab>
              <TabsTab className="rounded-none" value="precip">Srážky</TabsTab>
              <TabsTab className="rounded-none" value="wind">Vítr</TabsTab>
            </TabsList>
          </div>

          <TabsPanel value="temp" className="pt-3">
            <TempChart rows={rows} />
          </TabsPanel>
          <TabsPanel value="precip" className="pt-3">
            <PrecipChart rows={rows} />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              mm / hodinu
              {activeDay.precipSum != null ? ` · denní úhrn ${formatPrecipitation(activeDay.precipSum)}` : ''}
            </p>
          </TabsPanel>
          <TabsPanel value="wind" className="pt-3">
            <WindChart rows={rows} />
            <p className="mt-2 text-center text-xs text-muted-foreground">km/h · šipka ve směru proudění</p>
          </TabsPanel>
        </Tabs>

        <WeekOverview days={days} activeKey={activeKey!} onSelect={setSelectedKey} />
      </CardPanel>
    </Card>
  );
}
