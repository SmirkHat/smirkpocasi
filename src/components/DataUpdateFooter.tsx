import { formatDateTimeDetailed } from '@/utils/formatters'
import { cn } from '@/lib/utils'

type ClientMeta = {
  receivedAt?: string | null
  serverHttpDate?: string | null
  serverUpdatedAt?: string | null
}

function skewLabel(serverIso?: string | null, clientIso?: string | null) {
  if (!serverIso || !clientIso) return null
  const server = Date.parse(serverIso)
  const client = Date.parse(clientIso)
  if (!Number.isFinite(server) || !Number.isFinite(client)) return null
  const deltaSec = Math.round((client - server) / 1000)
  if (Math.abs(deltaSec) < 2) return 'Δ < 2 s'
  const sign = deltaSec > 0 ? '+' : '−'
  return `Δ ${sign}${Math.abs(deltaSec)} s`
}

/**
 * Subtle footer stamp: server assembly time + when this device received the payload.
 */
export function DataUpdateFooter({
  updatedAt,
  clientMeta,
  offline = false,
  className,
}: {
  updatedAt?: string | null
  clientMeta?: ClientMeta | null
  offline?: boolean
  className?: string
}) {
  const serverAt = clientMeta?.serverUpdatedAt || updatedAt || clientMeta?.serverHttpDate
  const deviceAt = clientMeta?.receivedAt
  if (!serverAt && !deviceAt) return null

  const skew = skewLabel(serverAt, deviceAt)

  return (
    <footer
      className={cn(
        'mt-8 border-t border-border/50 pt-3 pb-1 text-center text-[0.6875rem] leading-relaxed text-muted-foreground tabular-nums',
        className,
      )}
    >
      {serverAt ? (
        <p>
          <span className="text-muted-foreground/80">Server </span>
          {formatDateTimeDetailed(serverAt)}
        </p>
      ) : null}
      {deviceAt ? (
        <p>
          <span className="text-muted-foreground/80">Zařízení </span>
          {formatDateTimeDetailed(deviceAt)}
          {skew ? <span className="text-muted-foreground/70"> · {skew}</span> : null}
        </p>
      ) : null}
      {offline ? <p className="text-warning">Offline cache</p> : null}
    </footer>
  )
}
