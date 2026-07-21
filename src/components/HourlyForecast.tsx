import { useMemo } from 'react';
import { WiRaindrop } from 'react-icons/wi';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useDragScroll } from '../hooks/useDragScroll';
import { formatTime } from '../utils/formatters';
import { getWeatherInfo } from '../utils/weatherCodes';
import HourlyTempChart from './charts/HourlyTempChart';

function nextHours(hourly) {
  if (!hourly?.time?.length) return [];

  const now = new Date();
  const hours = [];
  for (let i = 0; i < hourly.time.length && hours.length < 24; i += 1) {
    const time = new Date(hourly.time[i]);
    if (time <= now) continue;
    hours.push({
      time,
      temperature: hourly.temperature_2m[i],
      weatherCode: hourly.weathercode?.[i] || hourly.weather_code?.[i],
      precipProb: hourly.precipitation_probability?.[i]
    });
  }
  return hours;
}

/** Horizontal hourly strip: time, icon, temperature; precip only when chance > 0%. */
export default function HourlyForecast({ hourly }) {
  const hours = useMemo(() => nextHours(hourly), [hourly]);
  const { ref, dragging } = useDragScroll('x');
  if (!hours.length) return null;

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Hodinová předpověď</CardTitle>
        <CardDescription>Dalších 24 hodin</CardDescription>
      </CardHeader>
      <CardPanel>
        <div
          ref={ref}
          className={cn(
            '-mx-6 overflow-x-auto overscroll-x-contain px-6 [scrollbar-width:thin] touch-pan-x select-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
          role="list"
          aria-label="Předpověď po hodinách"
        >
          <div className="flex gap-2 pb-1">
            {hours.map((h, i) => {
              const info = getWeatherInfo(h.weatherCode);
              const WeatherIcon = info.Icon;

              return (
                <div
                  key={h.time.toISOString()}
                  role="listitem"
                  aria-label={`${formatTime(h.time)}: ${info.label}, ${h.temperature == null ? 'bez dat' : `${Math.round(h.temperature)} stupňů`}${h.precipProb > 0 ? `, srážky ${h.precipProb} %` : ''}`}
                  className={cn(
                    'flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-1.5 py-3 text-center transition-colors sm:w-17',
                    i === 0 && 'border-primary/40 bg-primary/5'
                  )}
                >
                  <div className="text-[0.6875rem] font-semibold text-muted-foreground">
                    {i === 0 ? 'Teď' : formatTime(h.time)}
                  </div>
                  <WeatherIcon className="size-9 shrink-0 text-primary" aria-hidden="true" title={info.label} />
                  <div className="text-[0.9375rem] font-bold text-foreground tabular-nums">
                    {h.temperature == null ? '—' : `${Math.round(h.temperature)}°`}
                  </div>
                  <div className="flex h-4 items-center justify-center gap-0.5 text-[0.6875rem] font-semibold text-info">
                    {h.precipProb > 0 ? (
                      <>
                        <WiRaindrop className="size-3.5" aria-hidden="true" />
                        {h.precipProb}%
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <HourlyTempChart hourly={hourly} />
      </CardPanel>
    </Card>
  );
}
