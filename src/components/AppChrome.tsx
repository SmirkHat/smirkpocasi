import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { CloudSun, Droplets, Radar } from 'lucide-react'
import { HiArrowLeft } from 'react-icons/hi2'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useImagePalette } from '../hooks/useImagePalette'
import { usePlaceImage } from '../hooks/usePlaceImage'
import { usePlaceTheme } from '../hooks/usePlaceTheme'
import { useUiStore } from '../store/uiStore'
import { useWeatherStore } from '../store/weatherStore'
import { backdropThemeFromDominant } from '../utils/imagePalette'
import LocationPickerDialog from './LocationPickerDialog'

const pageNavItems = [
  { path: '/', label: 'Počasí', Icon: CloudSun },
  { path: '/radar', label: 'Radar', Icon: Radar },
  { path: '/hydro', label: 'Voda', Icon: Droplets },
] as const

function BrandLink({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn('flex min-w-0 items-center gap-2.5 text-foreground no-underline', className)}
      aria-label="SmirkPočasí — domů"
    >
      <img src="/logo.svg" alt="" width={28} height={17} className="h-7 w-auto shrink-0" decoding="async" />
      <span className="truncate text-base font-bold tracking-tight">SmirkPočasí</span>
    </Link>
  )
}

function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 8)
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    return () => window.removeEventListener('scroll', sync)
  }, [])

  return (
    <header className="sticky top-0 z-40 hidden shrink-0 sm:block">
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-24 transition-opacity duration-300',
          'bg-gradient-to-b from-background/55 via-background/20 to-transparent',
          'backdrop-blur-xl backdrop-saturate-150',
          '[mask-image:linear-gradient(to_bottom,black_0%,black_45%,transparent_100%)]',
          '[-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_45%,transparent_100%)]',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLink />
        <nav aria-label="Hlavní navigace" className="flex items-center gap-1">
          {pageNavItems.map(({ path, label, Icon }) => {
            const active = pathname === path
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium no-underline transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" strokeWidth={2} />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}

function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav
      aria-label="Hlavní navigace"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/85 sm:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-1 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),--spacing(1.5))]">
        {pageNavItems.map(({ path, label, Icon }) => {
          const active = pathname === path
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[0.6875rem] font-medium no-underline transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" strokeWidth={active ? 2.25 : 2} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function PlaceBackdrop({ palette }: { palette?: number[][] | null }) {
  const theme = palette?.[0] ? backdropThemeFromDominant(palette[0]) : null
  if (!theme) return null

  return (
    <div
      aria-hidden="true"
      className="place-aurora pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={
        {
          '--place-c1': theme.c1,
          '--place-c2': theme.c2,
          '--place-c3': theme.c3,
          '--place-c4': theme.c4,
        } as CSSProperties
      }
    >
      <div className="place-aurora-wash" />
      <div className="place-aurora-veil" />
      <div className="place-aurora-grain" />
      <div className="place-aurora-fade" />
    </div>
  )
}

export function AppPage({
  children,
  className,
  contentClassName,
  hero,
  fillViewport = false,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  hero?: ReactNode
  /** Lock page to 100dvh with no page scroll (radar). */
  fillViewport?: boolean
}) {
  const location = useWeatherStore((state) => state.location)
  const placeImage = usePlaceImage(location)
  const palette = useImagePalette(placeImage?.imageUrl, { count: 4 })
  usePlaceTheme(palette?.[0] ?? null)
  const locationPickerOpen = useUiStore((state) => state.locationPickerOpen)
  const setLocationPickerOpen = useUiStore((state) => state.setLocationPickerOpen)

  return (
    <div
      className={cn(
        'relative bg-app text-foreground',
        fillViewport
          ? 'flex h-dvh max-h-dvh flex-col overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0'
          : 'min-h-dvh pb-20 sm:pb-0',
        className,
      )}
    >
      <PlaceBackdrop palette={palette} />
      <div className={cn('relative z-10', fillViewport && 'flex min-h-0 flex-1 flex-col')}>
        <TopNav />
        {hero}
        <main
          className={cn(
            'mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8',
            fillViewport && 'flex min-h-0 flex-1 flex-col p-0 sm:p-0 lg:p-0',
            contentClassName,
          )}
        >
          {children}
        </main>
        <BottomNav />
      </div>
      <LocationPickerDialog open={locationPickerOpen} onOpenChange={setLocationPickerOpen} />
    </div>
  )
}

export function PageHeader({
  title,
  eyebrow,
  description,
  backTo,
  actions,
  className,
}: {
  title: string
  eyebrow?: string
  description?: string
  backTo?: string
  actions?: ReactNode
  className?: string
}) {
  const navigate = useNavigate()

  return (
    <header className={cn('mb-4 flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {backTo ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Zpět"
              className="sm:hidden"
              onClick={() => navigate({ to: backTo })}
            >
              <HiArrowLeft aria-hidden="true" />
            </Button>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="truncate text-xs font-medium uppercase tracking-normal text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="truncate text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
              {title}
            </h1>
          </div>
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
