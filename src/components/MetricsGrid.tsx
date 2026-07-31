import { CloudRain } from 'lucide-react';
import {
  WiBarometer,
  WiCloudy,
  WiDaySunny,
  WiDirectionUp,
  WiHumidity,
  WiStrongWind,
  WiSunrise,
  WiSunset,
  WiThermometer
} from 'react-icons/wi';
import { Card } from '@/components/ui/card';
import { Meter, MeterIndicator, MeterTrack } from '@/components/ui/meter';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { FieldSources, type FieldSourceEntry } from './FieldSources';
import {
  formatPrecipitation,
  formatPressure,
  formatTemperature,
  formatTime,
  formatUvIndex,
  formatVisibility,
  formatWind,
} from '../utils/formatters';
import { formatDayMinutes, toLocalDayMinutes } from '../utils/weatherMath';
import { firstAvailable, firstDailyValue, nextHourlyValue } from '../utils/forecast';

type FieldSourcesMap = Record<string, FieldSourceEntry[] | undefined> | null | undefined;

function windCompass(value) {
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) return null;
  const directions = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
  const normalized = ((degrees % 360) + 360) % 360;
  return {
    degrees: Math.round(normalized),
    label: directions[Math.round(normalized / 45) % directions.length]
  };
}

function uvLevel(value) {
  if (value == null) return null;
  if (value < 3) return 'Nízký';
  if (value < 6) return 'Střední';
  if (value < 8) return 'Vysoký';
  if (value < 11) return 'Velmi vysoký';
  return 'Extrémní';
}

function clampPercent(value, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(0, number));
}

function MetricTile({
  icon: Icon,
  label,
  value = null,
  unit = null,
  detail = null,
  meter = null,
  meterMax = 100,
  className = null,
  children = null,
  sources = null,
  formatSourceValue = null,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  label: string
  value?: string | number | null
  unit?: string | null
  detail?: string | null
  meter?: number | null
  meterMax?: number
  className?: string | null
  children?: React.ReactNode
  sources?: FieldSourceEntry[] | null
  formatSourceValue?: ((value: number) => string) | null
}) {
  const meterValue = meter == null ? null : clampPercent(meter, meterMax);

  return (
    <Card className={cn('flex min-h-31 flex-col justify-between gap-3 p-4', className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-4.5 shrink-0" aria-hidden="true" />
        <h3 className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide">{label}</h3>
      </div>
      <div className="flex flex-col gap-1.5">
        {children || (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value ?? '—'}</span>
            {unit ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
          </div>
        )}
        {meterValue != null ? (
          <Meter value={meterValue} min={0} max={meterMax} aria-label={label}>
            <MeterTrack className="h-1 rounded-full">
              <MeterIndicator className="rounded-full" />
            </MeterTrack>
          </Meter>
        ) : null}
        {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
        <FieldSources formatValue={formatSourceValue ?? undefined} sources={sources} />
      </div>
    </Card>
  );
}

function MetricTileSkeleton({ className = null }: { className?: string | null }) {
  return (
    <Card className={cn('flex min-h-31 flex-col justify-between gap-3 p-4', className)} aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <Skeleton className="size-4.5 rounded-md" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-1 w-full rounded-full" />
        <Skeleton className="h-3 w-28" />
      </div>
    </Card>
  );
}

export function HumidityPrecipTilesSkeleton({ className = null }: { className?: string | null }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)} aria-busy="true" aria-label="Načítám vlhkost a srážky">
      <MetricTileSkeleton />
      <MetricTileSkeleton />
    </div>
  );
}

export function MetricsGridSkeleton() {
  return (
    <>
      <MetricTileSkeleton className="col-span-1 lg:col-span-2" />
      <MetricTileSkeleton className="col-span-1 lg:col-span-2" />
      <MetricTileSkeleton className="col-span-1 lg:col-span-2" />
      <MetricTileSkeleton className="col-span-1 lg:col-span-2" />
      <MetricTileSkeleton className="col-span-1 lg:col-span-2" />
      <MetricTileSkeleton className="col-span-1 lg:col-span-2" />
    </>
  );
}

/** Compact humidity + precip pair for the sidebar under air quality. */
function formatPercentSource(value: number) {
  return `${Math.round(value)} %`;
}

/** Compact humidity + precip pair for the sidebar under air quality. */
export function HumidityPrecipTiles({
  weather,
  consensusValues,
  /** Prefer merged hourly-day sum (same series as ForecastExplorer). */
  todayPrecipMm = null,
  fieldSources = null,
  className = null,
}: {
  weather?: any
  consensusValues?: any
  todayPrecipMm?: number | null
  fieldSources?: FieldSourcesMap
  className?: string | null
}) {
  const current = weather?.current;
  const daily = weather?.daily;
  const hourly = weather?.hourly;

  const humidity = consensusValues?.humidity ?? current?.relative_humidity_2m;
  const precipitationChance =
    consensusValues?.precipitationProbability ?? nextHourlyValue(hourly, 'precipitation_probability');
  const todayPrecipitation =
    todayPrecipMm != null && Number.isFinite(Number(todayPrecipMm))
      ? Number(todayPrecipMm)
      : firstDailyValue(daily, 'precipitation_sum');

  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <MetricTile
        icon={WiHumidity}
        label="Vlhkost"
        value={humidity == null ? '—' : Math.round(humidity)}
        unit="%"
        meter={humidity}
        sources={fieldSources?.humidity}
        formatSourceValue={formatPercentSource}
      />
      <MetricTile
        icon={CloudRain}
        label="Srážky"
        value={precipitationChance == null ? '—' : Math.round(precipitationChance)}
        unit="%"
        meter={precipitationChance}
        detail={todayPrecipitation == null ? null : `Dnes ${formatPrecipitation(todayPrecipitation)}`}
        sources={fieldSources?.precipitationProbability}
        formatSourceValue={formatPercentSource}
      />
    </div>
  );
}

/** Bento tiles for current conditions — 4-col desktop grid under the forecast/radar row. */
export default function MetricsGrid({
  weather,
  consensusValues,
  fieldSources = null,
}: {
  weather?: any
  consensusValues?: any
  fieldSources?: FieldSourcesMap
}) {
  const current = weather?.current;
  const daily = weather?.daily;
  const hourly = weather?.hourly;

  const apparent = consensusValues?.apparentTemperature ?? current?.apparent_temperature;
  const dewPoint = consensusValues?.dewPoint ?? current?.dew_point_2m;
  const windSpeed = consensusValues?.windSpeed ?? current?.windspeed_10m;
  const windGust = consensusValues?.windGust ?? firstAvailable(current, ['windgusts_10m', 'wind_gusts_10m']);
  const wind = windCompass(consensusValues?.windDirection ?? current?.winddirection_10m);
  const uvIndex = consensusValues?.uvIndex ?? current?.uv_index ?? firstDailyValue(daily, 'uv_index_max');
  const pressure = consensusValues?.pressure ?? current?.pressure_msl ?? current?.surface_pressure;
  const cloudCover = consensusValues?.cloudCover ?? current?.cloud_cover;
  const visibility = consensusValues?.visibility ?? current?.visibility;
  const sunrise =
    consensusValues?.sunrise ?? toLocalDayMinutes(firstDailyValue(daily, 'sunrise'));
  const sunset =
    consensusValues?.sunset ?? toLocalDayMinutes(firstDailyValue(daily, 'sunset'));

  return (
    <>
      <MetricTile
        className="col-span-1 lg:col-span-2"
        icon={WiThermometer}
        label="Pocitová teplota"
        value={apparent == null ? '—' : Math.round(apparent)}
        unit="°C"
        detail={dewPoint == null ? null : `Rosný bod ${Math.round(dewPoint)} °C`}
        sources={fieldSources?.apparentTemperature}
        formatSourceValue={formatTemperature}
      />

      <MetricTile
        className="col-span-1 lg:col-span-2"
        icon={WiStrongWind}
        label="Vítr"
        detail={windGust == null ? null : `Nárazy až ${Math.round(windGust)} km/h`}
        sources={fieldSources?.windSpeed}
        formatSourceValue={formatWind}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {windSpeed == null ? '—' : Math.round(windSpeed)}
            </span>
            <span className="text-sm font-medium text-muted-foreground">km/h</span>
          </div>
          {wind ? (
            <span className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground" aria-label={`Směr ${wind.label}, ${wind.degrees} stupňů`}>
              <WiDirectionUp className="size-5 text-primary" style={{ transform: `rotate(${wind.degrees}deg)` }} aria-hidden="true" />
              {wind.label}
            </span>
          ) : null}
        </div>
      </MetricTile>

      <MetricTile
        className="col-span-1 lg:col-span-2"
        icon={WiDaySunny}
        label="UV index"
        value={uvIndex == null ? '—' : Number(uvIndex).toFixed(1).replace(/\.0$/, '')}
        meter={uvIndex}
        meterMax={11}
        detail={uvLevel(uvIndex)}
        sources={fieldSources?.uvIndex}
        formatSourceValue={formatUvIndex}
      />

      <MetricTile
        className="col-span-1 lg:col-span-2"
        icon={WiBarometer}
        label="Tlak"
        value={pressure == null ? '—' : Math.round(pressure)}
        unit="hPa"
        detail="Přepočet na hladinu moře"
        sources={fieldSources?.pressure}
        formatSourceValue={formatPressure}
      />

      <MetricTile
        className="col-span-1 lg:col-span-2"
        icon={WiCloudy}
        label="Oblačnost"
        value={cloudCover == null ? '—' : Math.round(cloudCover)}
        unit="%"
        meter={cloudCover}
        detail={visibility == null ? null : `Viditelnost ${formatVisibility(visibility)}`}
        sources={fieldSources?.cloudCover}
        formatSourceValue={formatPercentSource}
      />

      <MetricTile className="col-span-1 lg:col-span-2" icon={WiSunrise} label="Slunce">
        <div className="flex items-start gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <WiSunrise className="size-4" aria-hidden="true" />
              Východ
            </div>
            <div className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
              {formatDayMinutes(sunrise) ?? '—'}
            </div>
            <FieldSources formatValue={formatTime} sources={fieldSources?.sunrise} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <WiSunset className="size-4" aria-hidden="true" />
              Západ
            </div>
            <div className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
              {formatDayMinutes(sunset) ?? '—'}
            </div>
            <FieldSources formatValue={formatTime} sources={fieldSources?.sunset} />
          </div>
        </div>
      </MetricTile>
    </>
  );
}
