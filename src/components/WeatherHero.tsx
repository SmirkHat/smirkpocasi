import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatTemperature, formatPlaceName } from '../utils/formatters';

function truncateCredit(value, maxLength = 42) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function CreditLine({ image, credit }) {
  if (!credit) return null;
  return (
    <a
      className="absolute right-2.5 bottom-2.5 z-1 inline-block max-w-[min(60%,20rem)] truncate rounded-md bg-black/45 px-2 py-1 text-[0.6875rem] text-white/70 no-underline backdrop-blur-sm hover:underline hover:underline-offset-4 max-sm:max-w-[80%]"
      href={image.pageUrl || image.fileUrl}
      rel="noreferrer"
      target="_blank"
      title={credit}
    >
      Foto: {truncateCredit(credit, 56)}
    </a>
  );
}

export function WeatherHeroSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <div className="flex min-h-72 flex-col justify-end gap-4 rounded-2xl border border-border/55 bg-card/48 p-6 backdrop-blur-xl backdrop-saturate-150 sm:min-h-96 lg:p-8">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-24 w-56" />
        <Skeleton className="h-5 w-64" />
      </div>
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
  const heroBgStyle = image?.imageUrl
    ? { backgroundImage: `url("${image.imageUrl.replace(/"/g, '%22')}")` }
    : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <section
        aria-label={`Aktuální počasí pro ${formatPlaceName(location?.name) || 'vybranou polohu'}`}
        className={cn(
          'anim-rise relative isolate flex min-h-72 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-cover bg-center sm:min-h-96 lg:min-h-112',
          !image?.imageUrl && 'bg-[linear-gradient(150deg,#1a2a3a_0%,var(--background)_48%,#2d1d08_100%)]'
        )}
        style={heroBgStyle}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.12)_0%,rgb(0_0_0/0.2)_40%,rgb(0_0_0/0.66)_78%,rgb(0_0_0/0.88)_100%)]"
        />

        <div className="relative z-1 flex flex-col gap-1 p-5 sm:p-6 lg:p-8">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 truncate text-[clamp(1.375rem,3.5vw,2rem)] font-bold leading-tight tracking-tight text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.55)]">
              {formatPlaceName(location?.name) || 'Vybraná poloha'}
            </h1>
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
