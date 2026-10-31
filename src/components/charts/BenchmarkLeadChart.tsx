import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BenchmarkField } from '../../server/benchmark/config'
import type { BenchmarkReport, BenchmarkSource } from '../../hooks/useBenchmark'
import {
  BASELINE_COLOR,
  BASELINE_SOURCE,
  CONTEXT_LINE_COLOR,
  FIELD_META,
  MIN_PAIRS_TO_PLOT,
  SERIES_COLORS,
  formatNumber,
} from '../../utils/benchmarkFormat'
import type { Highlight } from '../../utils/benchmarkFormat'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import { getChartTheme } from './chartTheme'

function plottedValue(field: BenchmarkField, stats: BenchmarkSource['curve'][number]['stats']) {
  if (stats.n < MIN_PAIRS_TO_PLOT) return null
  return field === 'rain' ? stats.ets : stats.mae
}

export function leadChartRows(report: BenchmarkReport, field: BenchmarkField) {
  const used = report.buckets.filter((bucket) =>
    report.sources.some((source) => source.curve.some((point) => point.bucket === bucket.id && point.stats.n >= MIN_PAIRS_TO_PLOT)),
  )
  return used.map((bucket) => {
    const row: Record<string, string | number | null> = { label: bucket.label }
    for (const source of report.sources) {
      const point = source.curve.find((candidate) => candidate.bucket === bucket.id)
      row[source.id] = point ? plottedValue(field, point.stats) : null
    }
    return row
  })
}

/** Recharts' automatic ticks run to 8 for a top value of 4.3, which flattens the lines that matter. */
function errorAxis(rows: ReturnType<typeof leadChartRows>, limit: number) {
  const values = rows.flatMap((row) => Object.values(row).filter((value): value is number => typeof value === 'number'))
  const top = Math.ceil(Math.max(limit, ...values))
  return { domain: [0, top], ticks: Array.from({ length: top + 1 }, (_, value) => value) }
}

export default function BenchmarkLeadChart({
  report,
  field,
  highlights,
}: {
  report: BenchmarkReport
  field: BenchmarkField
  highlights: Highlight[]
}) {
  const theme = useMemo(() => getChartTheme(), [])
  const rows = useMemo(() => leadChartRows(report, field), [report, field])
  const meta = FIELD_META[field]
  const slotOf = new Map(highlights.map((entry) => [entry.id, entry.slot]))
  const unit = field === 'rain' ? '' : ` ${meta.unit}`
  const digits = field === 'wind' ? 1 : 2

  const context = report.sources.filter((source) => !slotOf.has(source.id) && source.id !== BASELINE_SOURCE)
  const emphasized = report.sources.filter((source) => slotOf.has(source.id))
  const baseline = report.sources.find((source) => source.id === BASELINE_SOURCE)

  return (
    <ChartFrame
      label={`Jak se ${field === 'rain' ? 'mění úspěšnost' : 'zvětšuje chyba'} s délkou předstihu`}
      height={320}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme.border }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            {...(field === 'rain' ? { domain: [0, 'auto'] } : errorAxis(rows, meta.limit))}
            tickFormatter={(value) => formatNumber(value, field === 'rain' ? 1 : 0)}
          />
          <ReferenceLine y={meta.limit} stroke={theme.muted} strokeWidth={1} strokeDasharray="4 4" ifOverflow="extendDomain" />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value, name) => `${name}: ${formatNumber(value, digits)}${unit}`}
              />
            }
          />
          {context.map((source) => (
            <Line
              key={source.id}
              dataKey={source.id}
              name={source.name}
              stroke={CONTEXT_LINE_COLOR}
              strokeWidth={1}
              dot={false}
              activeDot={false}
              tooltipType="none"
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          {baseline ? (
            <Line
              dataKey={baseline.id}
              name={baseline.name}
              stroke={BASELINE_COLOR}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : null}
          {emphasized.map((source) => {
            const color = SERIES_COLORS[slotOf.get(source.id) as number]
            return (
              <Line
                key={source.id}
                dataKey={source.id}
                name={source.name}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: color, stroke: theme.card, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: color, stroke: theme.card, strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
