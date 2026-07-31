import { useState } from 'react'
import { cn } from '@/lib/utils'

export type FieldSourceEntry = {
  id: string
  name: string
  url?: string | null
  value?: number | null
  weight?: number
}

function sourceFaviconUrl(url?: string | null) {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    if (!host) return null
    return `https://icons.duckduckgo.com/ip3/${host}.ico`
  } catch {
    return null
  }
}

function SourceFavicon({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = sourceFaviconUrl(url)
  if (!src || failed) {
    return (
      <span
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted text-[0.5rem] font-bold text-muted-foreground"
        aria-hidden="true"
      >
        {(name || '?').slice(0, 1).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="size-3.5 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  )
}

function formatEntryTitle(entry: FieldSourceEntry, formatValue?: (value: number) => string) {
  const raw = entry.value
  if (raw == null || !Number.isFinite(Number(raw))) return entry.name
  const formatted = formatValue ? formatValue(Number(raw)) : String(raw)
  return `${entry.name}: ${formatted}`
}

/** Tiny provider chips for a consensus field (nerd breakdown mode). */
export function FieldSources({
  sources,
  formatValue,
  className,
}: {
  sources?: FieldSourceEntry[] | null
  formatValue?: (value: number) => string
  className?: string
}) {
  if (!sources?.length) return null

  const summary = sources.map((entry) => formatEntryTitle(entry, formatValue)).join(' · ')

  return (
    <ul
      className={cn('mt-1 flex max-w-full flex-wrap items-center gap-1', className)}
      aria-label={`Zdroje: ${summary}`}
      title={summary}
    >
      {sources.map((entry) => {
        const label = formatEntryTitle(entry, formatValue)
        return (
          <li key={entry.id} className="min-w-0" title={label} aria-label={label}>
            <span className="inline-flex items-center gap-0.5 rounded-sm border border-border/60 bg-background/50 px-1 py-0.5">
              <SourceFavicon name={entry.name} url={entry.url} />
              <span className="max-w-16 truncate text-[0.625rem] leading-none text-muted-foreground">
                {entry.name}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
