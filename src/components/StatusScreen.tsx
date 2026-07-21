import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { CloudOff, CloudSun, Home, MapPinOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { hardRecoverApp, isStaleChunkError } from '../utils/hardRecover'
import { AppPage } from './AppChrome'

type StatusKind = 'not-found' | 'error' | 'crash'

const kindMeta: Record<
  StatusKind,
  { code: string; Icon: typeof CloudOff; accent: string }
> = {
  'not-found': {
    code: '404',
    Icon: MapPinOff,
    accent: 'text-info',
  },
  error: {
    code: 'Chyba',
    Icon: CloudOff,
    accent: 'text-warning',
  },
  crash: {
    code: 'Pád',
    Icon: CloudOff,
    accent: 'text-destructive',
  },
}

export function StatusScreen({
  kind,
  title,
  description,
  detail,
  primary,
  secondary,
  className,
}: {
  kind: StatusKind
  title: string
  description: string
  detail?: string | null
  primary?: ReactNode
  secondary?: ReactNode
  className?: string
}) {
  const meta = kindMeta[kind]
  const Icon = meta.Icon

  return (
    <div
      className={cn(
        'relative mx-auto flex min-h-[min(70dvh,36rem)] w-full max-w-xl flex-col items-center justify-center px-2 py-10 text-center sm:py-16',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-0 mx-auto h-56 w-56 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <p
        className={cn(
          'anim-rise font-mono text-[clamp(4.5rem,18vw,7.5rem)] font-bold leading-none tracking-tighter text-muted-foreground/25',
        )}
      >
        {meta.code}
      </p>

      <div
        className={cn(
          'anim-rise relative -mt-6 flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-card/60 shadow-xs backdrop-blur-xl',
          meta.accent,
        )}
        style={{ animationDelay: '40ms' }}
      >
        <Icon className="size-7" aria-hidden="true" strokeWidth={1.75} />
      </div>

      <h1
        className="anim-rise mt-5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        style={{ animationDelay: '80ms' }}
      >
        {title}
      </h1>
      <p
        className="anim-rise mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base"
        style={{ animationDelay: '120ms' }}
      >
        {description}
      </p>

      {detail ? (
        <pre
          className="anim-rise mt-4 max-h-28 w-full overflow-auto rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-left font-mono text-[0.6875rem] leading-relaxed text-muted-foreground"
          style={{ animationDelay: '160ms' }}
        >
          {detail}
        </pre>
      ) : null}

      <div
        className="anim-rise mt-7 flex flex-wrap items-center justify-center gap-2"
        style={{ animationDelay: '200ms' }}
      >
        {primary}
        {secondary}
      </div>
    </div>
  )
}

export function NotFoundScreen() {
  useEffect(() => {
    document.title = '404 · SmirkPočasí'
  }, [])

  return (
    <AppPage>
      <StatusScreen
        kind="not-found"
        title="Tady nic není"
        description="Tahle adresa v SmirkPočasí neexistuje. Možná je překlep, nebo stránka už zmizela v mlze."
        primary={
          <Button render={<Link to="/" />}>
            <Home aria-hidden="true" />
            Domů na počasí
          </Button>
        }
        secondary={
          <Button render={<Link to="/radar" />} variant="outline">
            <CloudSun aria-hidden="true" />
            Radar
          </Button>
        }
      />
    </AppPage>
  )
}

export function RouteErrorScreen({
  error,
  onRetry,
}: {
  error: Error
  onRetry?: () => void
}) {
  const staleChunk = isStaleChunkError(error)

  useEffect(() => {
    document.title = 'Chyba · SmirkPočasí'
  }, [])

  useEffect(() => {
    if (!staleChunk) return undefined
    const key = 'smirkpocasi:chunk-reload'
    try {
      if (sessionStorage.getItem(key)) return undefined
      sessionStorage.setItem(key, '1')
    } catch {
      // ignore
    }
    void hardRecoverApp('route-chunk')
    return undefined
  }, [staleChunk])

  return (
    <AppPage>
      <StatusScreen
        kind="error"
        title="Něco se pokazilo"
        description={
          staleChunk
            ? 'Aplikace se nepodařilo načíst po hot-reloadu. Obnovení s vyčištěním cache to obvykle spraví.'
            : 'Při načítání stránky nastala chyba. Zkus to znovu, nebo se vrať na přehled počasí.'
        }
        detail={import.meta.env.DEV ? error.message : null}
        primary={
          <Button type="button" onClick={() => void hardRecoverApp('retry')}>
            <RefreshCw aria-hidden="true" />
            Obnovit a vyčistit
          </Button>
        }
        secondary={
          <>
            {onRetry && !staleChunk ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                <RefreshCw aria-hidden="true" />
                Zkusit znovu
              </Button>
            ) : null}
            <Button render={<Link to="/" />} variant="outline">
              <Home aria-hidden="true" />
              Domů
            </Button>
          </>
        }
      />
    </AppPage>
  )
}

/** Standalone crash UI (outside AppPage / when router shell may be broken). */
export function CrashScreen({ error }: { error: Error }) {
  const staleChunk = isStaleChunkError(error)

  useEffect(() => {
    document.title = 'Pád · SmirkPočasí'
  }, [])

  return (
    <div className="relative min-h-dvh bg-app text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_55%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <a
          href="/"
          className="flex w-fit items-center gap-2.5 text-foreground no-underline"
          aria-label="SmirkPočasí — domů"
        >
          <img src="/logo.svg" alt="" width={28} height={17} className="h-7 w-auto" decoding="async" />
          <span className="text-base font-bold tracking-tight">SmirkPočasí</span>
        </a>

        <StatusScreen
          kind="crash"
          title="Aplikace spadla"
          description={
            staleChunk
              ? 'Dev server má zastaralý modul po úpravách kódu. Obnovení s vyčištěním cache to spraví.'
              : 'Zkus obnovit stránku. Pokud problém zůstane, smaž lokální cache přes reset cache.'
          }
          detail={error.message}
          primary={
            <Button type="button" onClick={() => void hardRecoverApp('crash')}>
              <RefreshCw aria-hidden="true" />
              Obnovit a vyčistit
            </Button>
          }
          secondary={
            <>
              <Button render={<a href="/" />} variant="outline">
                <Home aria-hidden="true" />
                Domů
              </Button>
              <Button render={<a href="/clear-sw.html" />} variant="ghost">
                Reset cache
              </Button>
            </>
          }
        />
      </div>
    </div>
  )
}
