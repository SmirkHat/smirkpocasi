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
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ForecastDay, HourlyCalculation, HourlyCalculations, HourlyPoint } from '../utils/hourlyForecast';
import { ROBUST_FIELD } from '../utils/robustAggregate';
import {
  formatDay,
  formatPercent,
  formatPrecipitation,
  formatTemperature,
  formatTime,
  formatWind,
  formatWindDirection,
} from '../utils/formatters';
import { getWeatherInfo } from '../utils/weatherCodes';
import { ChartFrame } from './charts/ChartFrame';
import { ChartTooltip } from './charts/ChartTooltip';
import { getChartTheme } from './charts/chartTheme';

type TabId = 'temp' | 'precip' | 'wind';

type CalculationKey = keyof HourlyCalculations;

type ForecastSourceMeta = {
  id: string;
  name?: string;
  url?: string | null;
};

const EMPTY_SERIES_NAMES: Record<string, string> = {};
const EMPTY_SOURCE_META: ForecastSourceMeta[] = [];
// Rows past the tooltip's height are only reachable by scrolling it, which recharts blocks by default.
const CALCULATION_TOOLTIP_STYLE = { pointerEvents: 'auto' as const };

const calculationConfig: Record<
  TabId,
  Array<{
    key: CalculationKey;
    label: string;
    format: (value: number | null) => string;
  }>
> = {
  temp: [{ key: 'temperature', label: 'Teplota', format: formatTemperature }],
  precip: [
    { key: 'precipMm', label: 'Srážky', format: formatPrecipitation },
    { key: 'precipProb', label: 'Pravděpodobnost', format: formatPercent },
  ],
  wind: [
    { key: 'windSpeed', label: 'Rychlost', format: formatWind },
    { key: 'windDirection', label: 'Směr', format: formatWindDirection },
  ],
};

const calculationMethodLabel = {
  'robust-mean': 'robustní vážený průměr',
  'weighted-mean': 'vážený průměr',
  'circular-mean': 'kruhový vážený průměr',
};

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
    fullLabel: `${formatDay(hour.time)} ${formatTime(hour.time)}`,
    temperature: hour.temperature,
    precipMm: hour.precipMm ?? 0,
    precipProb: hour.precipProb,
    windSpeed: hour.windSpeed,
    windDirection: hour.windDirection,
    calculations: hour.calculations,
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

function formatWeight(weight: number) {
  return Number(weight).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
}

function ForecastCalculationSection({
  calculation,
  label,
  formatValue,
  sourceNames,
}: {
  calculation?: HourlyCalculation;
  label: string;
  formatValue: (value: number | null) => string;
  sourceNames: Record<string, string>;
}) {
  if (!calculation?.inputs.length) return null;

  return (
    <section className="border-t border-border/70 pt-2 first:border-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{formatValue(calculation.result)}</span>
      </div>
      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
        {calculationMethodLabel[calculation.method]}
      </p>
      <div className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {calculation.inputs.map((input, index) => (
          <div
            className={cn(
              'flex min-w-0 items-baseline justify-between gap-2 tabular-nums',
              input.included ? 'text-muted-foreground' : 'text-destructive-foreground line-through',
            )}
            key={`${input.source}-${index}`}
          >
            <span className="min-w-0 truncate">{sourceNames[input.source] || input.source}</span>
            <span className="shrink-0">
              {formatValue(input.value)} · váha {formatWeight(input.weight)}
              {input.exclusionReason === 'outlier' ? ' · odlehlé' : ''}
              {input.exclusionReason === 'invalid' ? ' · mimo rozsah' : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ForecastCalculationTooltip({
  active,
  payload,
  tab,
  sourceNames,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ReturnType<typeof chartRows>[number] }>;
  tab: TabId;
  sourceNames: Record<string, string>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const calculations = row.calculations();

  return (
    <div className="max-h-[50vh] w-80 max-w-[calc(100vw-3rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md sm:max-h-[70vh] sm:w-[36rem]">
      <div className="mb-2 font-medium text-foreground">{row.fullLabel}</div>
      <div className="flex flex-col gap-2">
        {calculationConfig[tab].map((metric) => (
          <ForecastCalculationSection
            calculation={calculations[metric.key]}
            formatValue={metric.format}
            key={metric.key}
            label={metric.label}
            sourceNames={sourceNames}
          />
        ))}
      </div>
    </div>
  );
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

function TempChart({
  rows,
  showCalculations,
  sourceNames,
}: {
  rows: ReturnType<typeof chartRows>;
  showCalculations: boolean;
  sourceNames: Record<string, string>;
}) {
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
            wrapperStyle={showCalculations ? CALCULATION_TOOLTIP_STYLE : undefined}
            content={
              showCalculations ? (
                <ForecastCalculationTooltip sourceNames={sourceNames} tab="temp" />
              ) : (
                <ChartTooltip formatter={(value) => `Teplota: ${formatTemperature(value)}`} />
              )
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

function PrecipChart({
  rows,
  showCalculations,
  sourceNames,
}: {
  rows: ReturnType<typeof chartRows>;
  showCalculations: boolean;
  sourceNames: Record<string, string>;
}) {
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
            wrapperStyle={showCalculations ? CALCULATION_TOOLTIP_STYLE : undefined}
            content={
              showCalculations ? (
                <ForecastCalculationTooltip sourceNames={sourceNames} tab="precip" />
              ) : (
                <ChartTooltip
                  formatter={(value, name) =>
                    name === 'precipProb'
                      ? `Pravděpodobnost: ${Math.round(Number(value))} %`
                      : `Srážky: ${formatPrecipitation(value)}`
                  }
                />
              )
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

function WindChart({
  rows,
  showCalculations,
  sourceNames,
}: {
  rows: ReturnType<typeof chartRows>;
  showCalculations: boolean;
  sourceNames: Record<string, string>;
}) {
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
            <Tooltip
              wrapperStyle={showCalculations ? CALCULATION_TOOLTIP_STYLE : undefined}
              content={
                showCalculations ? (
                  <ForecastCalculationTooltip sourceNames={sourceNames} tab="wind" />
                ) : (
                  <ChartTooltip formatter={(value) => `Vítr: ${formatWind(value)}`} />
                )
              }
            />
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

type ForecastSourceStat = {
  id: string;
  name: string;
  url: string | null;
  weight: number;
  included: number;
  total: number;
  excluded: number;
};

function summarizeForecastSources(
  day: ForecastDay,
  tab: TabId,
  sourceNames: Record<string, string>,
  sourceUrls: Record<string, string | null>,
): ForecastSourceStat[] {
  const stats = new Map<string, ForecastSourceStat>();

  for (const hour of day.hours) {
    const calculations = hour.calculations();
    for (const metric of calculationConfig[tab]) {
      for (const input of calculations[metric.key].inputs) {
        const current = stats.get(input.source) || {
          id: input.source,
          name: sourceNames[input.source] || input.source,
          url: sourceUrls[input.source] || null,
          weight: input.weight,
          included: 0,
          total: 0,
          excluded: 0,
        };
        current.total += 1;
        current.included += input.included ? 1 : 0;
        current.excluded += input.included ? 0 : 1;
        stats.set(input.source, current);
      }
    }
  }

  return [...stats.values()].sort(
    (a, b) => b.included - a.included || b.weight - a.weight || a.name.localeCompare(b.name, 'cs'),
  );
}

function dailyCalculationCopy(day: ForecastDay, tab: TabId) {
  if (tab === 'temp') {
    const count = day.hours.filter((hour) => hour.temperature != null).length;
    return `Denní ${formatTemperature(day.tempMin)} / ${formatTemperature(day.tempMax)} = minimum / maximum z ${count} hodinových výsledků.`;
  }
  if (tab === 'precip') {
    const count = day.hours.filter((hour) => hour.precipMm != null).length;
    return `Denní úhrn ${formatPrecipitation(day.precipSum)} = součet ${count} hodinových výsledků.`;
  }
  return null;
}

const calculationExplanation: Record<TabId, string> = {
  temp: `Hodinový bod je robustní vážený průměr: vzdálené hodnoty se přitáhnou k ostatním, takže jeden model výsledek neodtáhne. Při alespoň 4 vstupech se odlehlé teploty vyřadí s minimální tolerancí ${ROBUST_FIELD.temperature.tolerance} °C.`,
  precip: `Srážky i pravděpodobnost jsou vážené průměry. Při alespoň 4 vstupech se vyřadí jen odlehlé hodnoty, s minimální tolerancí ${ROBUST_FIELD.precipitation.tolerance} mm, respektive ${ROBUST_FIELD.precipitationProbability.tolerance} procentních bodů.`,
  wind: `Rychlost je robustní vážený průměr s minimální tolerancí filtru ${ROBUST_FIELD.windSpeed.tolerance} km/h. Směr je kruhový průměr vážený rychlostí větru, takže slabý vítr ho skoro neovlivní.`,
};

function ForecastCalculationPanel({
  day,
  tab,
  sourceNames,
  sourceUrls,
}: {
  day: ForecastDay;
  tab: TabId;
  sourceNames: Record<string, string>;
  sourceUrls: Record<string, string | null>;
}) {
  const stats = useMemo(
    () => summarizeForecastSources(day, tab, sourceNames, sourceUrls),
    [day, tab, sourceNames, sourceUrls],
  );
  const dailyCopy = dailyCalculationCopy(day, tab);

  return (
    <section
      className="rounded-lg border border-border/70 bg-muted/25 p-3"
      aria-label="Zdroje a výpočet předpovědi"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Výpočet předpovědi</h3>
        <span className="text-[0.6875rem] text-muted-foreground">Zdroje: {stats.length}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {calculationExplanation[tab]} Odlehlost = max(základní tolerance, 4× MAD); pokud by po filtru
        zůstala menšina vstupů, filtr se nepoužije.
      </p>
      {dailyCopy ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{dailyCopy}</p> : null}

      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Modely použité ve vybraném dni">
        {stats.map((source) => {
          const content = (
            <>
              <span className="font-medium text-foreground">{source.name}</span>
              <span>váha {formatWeight(source.weight)}</span>
              <span>{source.included}/{source.total} vstupů</span>
              {source.excluded ? <span className="text-destructive-foreground">−{source.excluded}</span> : null}
            </>
          );
          const className =
            'inline-flex flex-wrap items-center gap-x-1.5 rounded-md border border-border/65 bg-background/60 px-2 py-1 text-[0.6875rem] text-muted-foreground';
          const title =
            `${source.name}: váha ${formatWeight(source.weight)}, ve výpočtu ${source.included} z ${source.total} vstupů` +
            (source.excluded ? `, vyřazeno ${source.excluded}` : '');

          return (
            <li key={source.id}>
              {source.url ? (
                <a
                  className={cn(className, 'transition-colors hover:border-foreground/30 hover:bg-muted/70')}
                  href={source.url}
                  rel="noreferrer"
                  target="_blank"
                  title={title}
                >
                  {content}
                </a>
              ) : (
                <span className={className} title={title}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[0.6875rem] text-muted-foreground">
        Přesné hodnoty, váhy a případně vyřazené vstupy zobrazíš najetím nebo klepnutím na konkrétní bod grafu.
      </p>
    </section>
  );
}

export default function ForecastExplorer({
  days,
  seriesNames = EMPTY_SERIES_NAMES,
  sourceMeta = EMPTY_SOURCE_META,
  showCalculations = false,
  fallback = null,
}: {
  days: ForecastDay[];
  seriesNames?: Record<string, string>;
  sourceMeta?: ForecastSourceMeta[];
  showCalculations?: boolean;
  fallback?: ReactNode;
}) {
  const sourceNames = useMemo(
    () => ({
      ...seriesNames,
      ...Object.fromEntries(sourceMeta.map((source) => [source.id, source.name || source.id])),
    }),
    [seriesNames, sourceMeta],
  );
  const sourceUrls = useMemo(
    () => ({
      openmeteo: 'https://open-meteo.com/en/docs',
      ...Object.fromEntries(sourceMeta.map((source) => [source.id, source.url || null])),
    }),
    [sourceMeta],
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
            <TempChart rows={rows} showCalculations={showCalculations} sourceNames={sourceNames} />
          </TabsPanel>
          <TabsPanel value="precip" className="pt-3">
            <PrecipChart rows={rows} showCalculations={showCalculations} sourceNames={sourceNames} />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              mm / hodinu
              {activeDay.precipSum != null ? ` · denní úhrn ${formatPrecipitation(activeDay.precipSum)}` : ''}
            </p>
          </TabsPanel>
          <TabsPanel value="wind" className="pt-3">
            <WindChart rows={rows} showCalculations={showCalculations} sourceNames={sourceNames} />
            <p className="mt-2 text-center text-xs text-muted-foreground">km/h · šipka ve směru proudění</p>
          </TabsPanel>
        </Tabs>

        {showCalculations ? (
          <ForecastCalculationPanel
            day={activeDay}
            sourceNames={sourceNames}
            sourceUrls={sourceUrls}
            tab={tab}
          />
        ) : null}

        <WeekOverview days={days} activeKey={activeKey!} onSelect={setSelectedKey} />
      </CardPanel>
    </Card>
  );
}
