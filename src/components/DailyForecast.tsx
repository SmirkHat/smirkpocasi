import { WiRaindrop } from 'react-icons/wi';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useDragScroll } from '../hooks/useDragScroll';
import { formatDay, formatTemperature } from '../utils/formatters';
import { getWeatherInfo } from '../utils/weatherCodes';

/** Vertical 7-day outlook with temperature bars on a shared week scale. */
export default function DailyForecast({ daily }) {
  const { ref, dragging } = useDragScroll('y');

  if (!daily?.time?.length) return null;

  const days = daily.time.slice(0, 7).map((time, i) => ({
    date: new Date(time),
    tempMax: daily.temperature_2m_max[i],
    tempMin: daily.temperature_2m_min[i],
    weatherCode: daily.weathercode?.[i] || daily.weather_code?.[i],
    precipSum: daily.precipitation_sum?.[i]
  }));
  const temperatures = days.flatMap((day) => [day.tempMin, day.tempMax]).filter((value) => Number.isFinite(value));
  const rangeMin = temperatures.length ? Math.min(...temperatures) : 0;
  const rangeMax = temperatures.length ? Math.max(...temperatures) : 0;
  const range = Math.max(rangeMax - rangeMin, 1);

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="shrink-0 pb-0">
        <CardTitle>Předpověď na týden</CardTitle>
        <CardDescription>Denní minima a maxima</CardDescription>
      </CardHeader>
      <CardPanel className="flex min-h-0 flex-1 flex-col !pt-0">
        <div
          ref={ref}
          className={cn(
            'max-h-80 min-h-0 flex-1 overflow-y-auto overscroll-y-contain pt-4 [scrollbar-width:thin] touch-pan-y select-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
          role="list"
          aria-label="Předpověď po dnech"
        >
          {days.map((day, i) => {
            const info = getWeatherInfo(day.weatherCode);
            const WeatherIcon = info.Icon;
            const isToday = i === 0;
            const start = Number.isFinite(day.tempMin) ? ((day.tempMin - rangeMin) / range) * 100 : 0;
            const end = Number.isFinite(day.tempMax) ? ((day.tempMax - rangeMin) / range) * 100 : 100;

            return (
              <div
                key={day.date.toISOString()}
                role="listitem"
                aria-label={`${isToday ? 'Dnes' : formatDay(day.date)}: ${info.label}, ${formatTemperature(day.tempMin)} až ${formatTemperature(day.tempMax)}${day.precipSum > 0 ? `, srážky ${day.precipSum.toFixed(1)} mm` : ''}`}
                className={cn(
                  'grid grid-cols-[6.5rem_2.25rem_3.25rem_1fr] items-center gap-2 border-b border-border/70 py-3 last:border-0 last:pb-0 first:pt-0 sm:grid-cols-[7.5rem_2.25rem_4rem_1fr] sm:gap-3',
                  isToday && 'font-medium'
                )}
              >
                <div className="min-w-0">
                  <div className={cn('truncate text-sm text-foreground', isToday ? 'font-bold' : 'font-semibold')}>
                    {isToday ? 'Dnes' : formatDay(day.date)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{info.label}</div>
                </div>
                <WeatherIcon className="size-8 shrink-0 justify-self-center text-primary" aria-hidden="true" title={info.label} />
                <div className="flex items-center justify-end gap-0.5 text-xs font-semibold whitespace-nowrap text-info tabular-nums">
                  {day.precipSum > 0 ? (
                    <>
                      <WiRaindrop className="size-3.5" aria-hidden="true" />
                      {day.precipSum.toFixed(1)}
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                    {day.tempMin == null ? '—' : `${Math.round(day.tempMin)}°`}
                  </span>
                  <div className="relative h-1.5 min-w-12 flex-1 rounded-full bg-muted" aria-hidden="true">
                    <span
                      className="absolute inset-y-0 min-w-1.5 rounded-full bg-[linear-gradient(90deg,var(--info),var(--primary))]"
                      style={{ left: `${start}%`, width: `${Math.max(6, end - start)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-sm font-semibold text-foreground tabular-nums">
                    {day.tempMax == null ? '—' : `${Math.round(day.tempMax)}°`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardPanel>
    </Card>
  );
}
