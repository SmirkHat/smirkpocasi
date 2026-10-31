import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { BenchmarkField } from '../server/benchmark/config'
import type { BenchmarkSource, BenchmarkStats } from '../hooks/useBenchmark'
import {
  BASELINE_SOURCE,
  FIELD_META,
  MIN_DAYS_FOR_RANK,
  MIN_PAIRS_FOR_RANK,
  REFERENCE_SOURCE,
  SERIES_COLORS,
  formatCount,
  formatHorizon,
  formatNumber,
  formatPercent,
  formatSigned,
  formatSignedPercent,
} from '../utils/benchmarkFormat'
import type { Highlight } from '../utils/benchmarkFormat'

function enoughData(source: BenchmarkSource, stats: BenchmarkStats) {
  return stats.n >= MIN_PAIRS_FOR_RANK && (source.days === null || source.days >= MIN_DAYS_FOR_RANK)
}

function sortKey(field: BenchmarkField, stats: BenchmarkStats) {
  if (field === 'rain') return -(stats.ets ?? -Infinity)
  return stats.vsReference ?? stats.mae ?? Infinity
}

/** Sources without enough data go last, whatever their numbers happen to say so far. */
export function rankedSources(sources: BenchmarkSource[], field: BenchmarkField, group: string) {
  return [...sources]
    .filter((source) => source.groups[group].n > 0)
    .sort((a, b) => {
      const enoughA = enoughData(a, a.groups[group])
      const enoughB = enoughData(b, b.groups[group])
      if (enoughA !== enoughB) return enoughA ? -1 : 1
      return sortKey(field, a.groups[group]) - sortKey(field, b.groups[group])
    })
}

function HighlightButton({ source, slot, onToggle }: { source: BenchmarkSource; slot: number | undefined; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={slot !== undefined}
      aria-label={`Zvýraznit v grafech: ${source.name}`}
      onClick={() => onToggle(source.id)}
      className="flex size-6 shrink-0 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn('size-3 rounded-full border', slot === undefined ? 'border-muted-foreground/60' : 'border-transparent')}
        style={slot === undefined ? undefined : { background: SERIES_COLORS[slot] }}
      />
    </button>
  )
}

export default function BenchmarkTable({
  sources,
  field,
  group,
  highlights,
  onToggleHighlight,
}: {
  sources: BenchmarkSource[]
  field: BenchmarkField
  group: string
  highlights: Highlight[]
  onToggleHighlight: (id: string) => void
}) {
  const meta = FIELD_META[field]
  const ranked = rankedSources(sources, field, group)
  const slotOf = new Map(highlights.map((entry) => [entry.id, entry.slot]))
  const isRain = field === 'rain'
  const hasAvailability = ranked.some((source) => source.availability !== null)
  let rank = 0

  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead className="hidden w-8 text-right sm:table-cell">#</TableHead>
          <TableHead>Zdroj</TableHead>
          <TableHead className="text-right">Chyba ({meta.unit}{isRain ? '/6 h' : ''})</TableHead>
          {isRain ? (
            <>
              <TableHead className="text-right">ETS</TableHead>
              <TableHead className="text-right">Zachycené deště</TableHead>
              <TableHead className="text-right">Plané poplachy</TableHead>
            </>
          ) : (
            <>
              <TableHead className="text-right">Proti konsenzu</TableHead>
              <TableHead className="text-right">Zkreslení</TableHead>
              <TableHead className="text-right">{meta.withinLabel}</TableHead>
            </>
          )}
          <TableHead className="text-right">Dohled</TableHead>
          <TableHead className="text-right">Dosah</TableHead>
          {hasAvailability ? <TableHead className="text-right">Dostupnost</TableHead> : null}
          <TableHead className="text-right">Párů</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ranked.map((source) => {
          const stats = source.groups[group]
          const counted = enoughData(source, stats)
          if (counted) rank += 1
          return (
            <TableRow key={source.id} className={cn(!counted && 'text-muted-foreground')}>
              <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{counted ? rank : '–'}</TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <HighlightButton source={source} slot={slotOf.get(source.id)} onToggle={onToggleHighlight} />
                  {/* On a phone a long name would push every number out of view. */}
                  <span className="flex w-28 flex-wrap items-center gap-1 whitespace-normal sm:w-auto sm:whitespace-nowrap">
                    <span className={cn(source.id === REFERENCE_SOURCE && 'font-medium')}>{source.name}</span>
                    {source.id === BASELINE_SOURCE ? <Badge variant="outline">srovnání</Badge> : null}
                    {source.restricted ? <Badge variant="secondary">2 stanice</Badge> : null}
                    {counted ? null : <Badge variant="outline">málo dat</Badge>}
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(stats.mae, field === 'wind' ? 1 : 2)}</TableCell>
              {isRain ? (
                <>
                  <TableCell className="text-right tabular-nums">{formatNumber(stats.ets, 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(stats.hitRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(stats.falseAlarmRatio)}</TableCell>
                </>
              ) : (
                <>
                  <TableCell className="text-right tabular-nums">
                    {source.id === REFERENCE_SOURCE ? 'základ' : formatSignedPercent(stats.vsReference)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatSigned(stats.bias, field === 'wind' ? 1 : 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(stats.withinShare)}</TableCell>
                </>
              )}
              <TableCell className="text-right tabular-nums">{formatHorizon(source.horizonHours)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatHorizon(source.reachHours)}</TableCell>
              {hasAvailability ? <TableCell className="text-right tabular-nums">{formatPercent(source.availability)}</TableCell> : null}
              <TableCell className="text-right tabular-nums">{formatCount(stats.n)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
