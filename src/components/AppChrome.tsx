import type { ReactNode } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { HiArrowLeft, HiExclamationTriangle, HiHome, HiMap, HiMapPin } from 'react-icons/hi2'
import { WiRaindrop } from 'react-icons/wi'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useImagePalette } from '../hooks/useImagePalette'
import { usePlaceImage } from '../hooks/usePlaceImage'
import { useWeatherStore } from '../store/weatherStore'
import { buildMeshBlobs } from '../utils/imagePalette'

const navItems = [
  { path: '/', label: 'Počasí', Icon: HiHome },
  { path: '/radar', label: 'Radar', Icon: HiMap },
  { path: '/hydro', label: 'Voda', Icon: WiRaindrop },
  { path: '/settings', label: 'Lokace', Icon: HiMapPin },
]

function PrepNotice() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8">
      <Alert variant="warning">
        <HiExclamationTriangle className="size-5 shrink-0" aria-hidden="true" />
        <AlertTitle>Aplikace je v přípravě</AlertTitle>
        <AlertDescription>
          <p>
            UI může být rozbité a data nemusí fungovat spolehlivě. Zatím se na SmirkPočasí prosím
            nespoléhej — jde o vývojovou verzi.
          </p>
          <p>
            Hlášení chyb a poznámky piš hlavnímu vývojáři{' '}
            <span className="font-medium text-foreground">@de_dast</span> na Discordu, nebo na{' '}
            <a
              className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
              href="mailto:dast@smirkhat.org"
            >
              dast@smirkhat.org
            </a>
            .
          </p>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const items = navItems

  return (
    <header className="relative z-40 hidden shrink-0 sm:block">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-foreground no-underline" aria-label="SmirkPočasí — domů">
          <img src="/logo.svg" alt="" width={28} height={17} className="h-7 w-auto" decoding="async" />
          <span className="text-base font-bold tracking-tight">SmirkPočasí</span>
        </Link>
        <nav aria-label="Hlavní navigace" className="flex items-center gap-1">
          {items.map(({ path, label, Icon }) => {
            const active = pathname === path
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium no-underline transition-colors',
                  active
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4.5" aria-hidden="true" />
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
  const items = navItems

  return (
    <nav
      aria-label="Hlavní navigace"
      className="fixed inset-x-0 bottom-0 z-40 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),--spacing(2))] sm:hidden"
    >
      <div className={cn('grid gap-1', items.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        {items.map(({ path, label, Icon }) => {
          const active = pathname === path
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium no-underline transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function PlaceBackdrop({ imageUrl }: { imageUrl?: string | null }) {
  const palette = useImagePalette(imageUrl, { count: 5 })
  const blobs = palette ? buildMeshBlobs(palette, imageUrl || '') : []

  if (!blobs.length) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-60 transition-opacity duration-700"
    >
      <div className="place-mesh absolute inset-[-18%]">
        {blobs.map((blob, index) => (
          <div
            key={`${imageUrl}-${index}`}
            className="place-mesh-blob absolute inset-0"
            style={blob}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--app-bg)_92%)]" />
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
      <PlaceBackdrop imageUrl={placeImage?.imageUrl} />
      <div className={cn('relative z-10', fillViewport && 'flex min-h-0 flex-1 flex-col')}>
        <TopNav />
        <PrepNotice />
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
