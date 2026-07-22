import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useUiStore } from '../store/uiStore';
import { formatTemperature, formatPlaceName } from '../utils/formatters';

function CreditLine({ image, credit }) {
  if (!credit) return null;
  const text = String(credit || '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <a
      className="absolute top-2.5 right-2.5 z-1 max-w-[min(42%,11rem)] rounded-md bg-black/40 px-1.5 py-1 text-[0.625rem] leading-snug text-white/65 no-underline backdrop-blur-sm hover:underline hover:underline-offset-2 sm:top-3 sm:right-3 sm:max-w-[13rem] sm:text-[0.6875rem]"
      href={image.pageUrl || image.fileUrl}
      rel="noreferrer"
      target="_blank"
      title={text}
    >
      <span className="line-clamp-2 break-words">Foto: {text}</span>
    </a>
  );
}

export function WeatherHeroSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <section
        aria-busy="true"
        aria-label="Načítám aktuální počasí"
        className="anim-rise relative isolate flex min-h-72 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-[linear-gradient(150deg,var(--card)_0%,var(--app-bg)_50%,var(--card)_100%)] sm:min-h-96 lg:min-h-112"
      >
        <div className="relative z-1 flex flex-col gap-1 p-5 sm:p-6 lg:p-8">
          <Skeleton className="h-7 w-40 rounded-md bg-white/20 sm:h-8 sm:w-52 dark:bg-white/15" />

          <div className="mt-1 flex items-end justify-between gap-4">
            <Skeleton className="h-16 w-36 rounded-md bg-white/25 sm:h-24 sm:w-48 lg:h-28 lg:w-56 dark:bg-white/15" />
            <Skeleton className="size-[clamp(4.5rem,12vw,8rem)] shrink-0 rounded-full bg-white/20 dark:bg-white/12" />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Skeleton className="h-5 w-28 rounded-md bg-white/20 sm:h-6 sm:w-36 dark:bg-white/12" />
            <Skeleton className="h-4 w-24 rounded-md bg-white/15 sm:h-5 sm:w-28 dark:bg-white/10" />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Hero: location, temperature, condition, and day max/min. */
export default function WeatherHero({
  location,
  info,
  WeatherIcon,
  temperature,
  tempMax,
  tempMin,
  image,
  credit,
  offline,
}) {
  const openLocationPicker = useUiStore((state) => state.openLocationPicker);
  const placeName = formatPlaceName(location?.name) || 'Vybraná poloha';
  const heroBgStyle = image?.imageUrl
    ? { backgroundImage: `url("${image.imageUrl.replace(/"/g, '%22')}")` }
    : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <section
        aria-label={`Aktuální počasí pro ${placeName}`}
        className={cn(
          'anim-rise relative isolate flex min-h-72 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-cover bg-center sm:min-h-96 lg:min-h-112',
          !image?.imageUrl &&
            'bg-[linear-gradient(150deg,var(--card)_0%,var(--app-bg)_50%,var(--card)_100%)]',
        )}
        style={heroBgStyle}
      >
        {image?.imageUrl ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.12)_0%,rgb(0_0_0/0.2)_40%,rgb(0_0_0/0.66)_78%,rgb(0_0_0/0.88)_100%)]"
          />
        ) : null}
        <div className="relative z-1 flex flex-col gap-1 p-5 sm:p-6 lg:p-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={openLocationPicker}
              aria-haspopup="dialog"
              aria-label={`Změnit lokaci · ${placeName}`}
              className="group flex min-w-0 max-w-full items-center gap-1.5 rounded-lg text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <h1 className="min-w-0 truncate text-[clamp(1.375rem,3.5vw,2rem)] font-bold leading-tight tracking-tight text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.55)]">
                {placeName}
              </h1>
              <MapPin
                className="size-5 shrink-0 text-white/80 drop-shadow-[0_2px_8px_rgb(0_0_0/0.45)] transition-colors group-hover:text-white sm:size-6"
                aria-hidden="true"
                strokeWidth={2.25}
              />
            </button>
            {offline ? <Badge variant="warning">Offline</Badge> : null}
          </div>

          <div className="flex items-end justify-between gap-4">
            <p
              className="text-[clamp(4rem,13vw,7.5rem)] font-bold leading-none tracking-tighter text-white tabular-nums [text-shadow:0_4px_24px_rgb(0_0_0/0.5)]"
              aria-label={`Teplota ${formatTemperature(temperature)}`}
            >
              {temperature == null ? '—' : `${Math.round(temperature)}°`}
            </p>
            <WeatherIcon
              aria-hidden="true"
              className="size-[clamp(4.5rem,12vw,8rem)] shrink-0 text-white/95 drop-shadow-[0_4px_20px_rgb(0_0_0/0.5)]"
            />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-white/90 [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
            <p className="text-lg font-semibold">{info.label}</p>
            <p className="text-base font-medium text-white/75 tabular-nums">
              <span aria-label={`Maximum ${formatTemperature(tempMax)}`}>↑ {tempMax == null ? '—' : `${Math.round(tempMax)}°`}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span aria-label={`Minimum ${formatTemperature(tempMin)}`}>↓ {tempMin == null ? '—' : `${Math.round(tempMin)}°`}</span>
            </p>
          </div>
        </div>

        <CreditLine credit={credit} image={image} />
      </section>
    </div>
  );
}
