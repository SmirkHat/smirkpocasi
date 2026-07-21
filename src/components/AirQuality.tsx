import { WiDust } from 'react-icons/wi';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAirQuality } from '../hooks/useAirQuality';
import { useWeatherStore } from '../store/weatherStore';

function badgeVariant(label, indexLevel) {
  if (indexLevel?.startsWith('3')) return 'destructive';
  if (indexLevel?.startsWith('2')) return 'warning';
  if (label) return 'success';
  return 'info';
}

function getAqiInfo(aqi) {
  if (aqi == null) return { label: 'Neznámá', variant: 'secondary' };
  if (aqi <= 20) return { label: 'Výborná', variant: 'info' };
  if (aqi <= 40) return { label: 'Dobrá', variant: 'success' };
  if (aqi <= 60) return { label: 'Ušlá', variant: 'warning' };
  if (aqi <= 100) return { label: aqi <= 80 ? 'Špatná' : 'Velmi špatná', variant: 'destructive' };
  return { label: 'Extrémní', variant: 'destructive' };
}

function pollutant(value) {
  return value != null ? `${value} µg/m³` : '—';
}

export default function AirQuality() {
  const location = useWeatherStore((state) => state.location);
  const { data, loading, error } = useAirQuality(location);

  if (loading && !data) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Kvalita ovzduší</CardTitle>
        </CardHeader>
        <CardPanel className="flex flex-col gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-14 w-full" />
        </CardPanel>
      </Card>
    );
  }
  if (error || !data) return null;

  const info = data.label
    ? { label: data.label, variant: badgeVariant(data.label, data.indexLevel) }
    : getAqiInfo(data.aqi);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Kvalita ovzduší</CardTitle>
          <WiDust className="size-6 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardPanel className="flex flex-1 flex-col justify-between gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Badge variant={info.variant}>{info.label}</Badge>
            <div className="mt-2 text-4xl font-semibold tracking-tight text-foreground tabular-nums">
              {data.aqi ?? '—'}
            </div>
            <div className="text-xs text-muted-foreground">Index EAQI</div>
          </div>
          <div className="max-w-[50%] text-right text-xs text-muted-foreground">
            <div>{data.attribution}</div>
            <div>{data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('cs-CZ') : null}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/55 bg-background/40 p-3">
            <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Prach PM2.5</div>
            <div className="mt-1 font-semibold text-foreground tabular-nums">{pollutant(data.pm25)}</div>
          </div>
          <div className="rounded-lg border border-border/55 bg-background/40 p-3">
            <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Prach PM10</div>
            <div className="mt-1 font-semibold text-foreground tabular-nums">{pollutant(data.pm10)}</div>
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}
