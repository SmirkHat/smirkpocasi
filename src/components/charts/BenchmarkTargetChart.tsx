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
import type { TargetReport } from '../../hooks/useBenchmark'
import { CONTEXT_LINE_COLOR, FIELD_META, SERIES_COLORS, formatNumber } from '../../utils/benchmarkFormat'
import type { Highlight } from '../../utils/benchmarkFormat'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import { getChartTheme } from './chartTheme'

export function rowsByLead(series: TargetReport['series']) {
  const rows = new Map<number, Record<string, number>>()
  for (const entry of series) {
    for (const point of entry.points) {
      const row = rows.get(point.leadHours) ?? { leadHours: point.leadHours }
      row[entry.id] = point.value
      rows.set(point.leadHours, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.leadHours - a.leadHours)
}

function leadLabel(hours: number) {
  return hours >= 48 ? `${Math.round(hours / 24)} d` : `${hours} h`
}

export default function BenchmarkTargetChart({ report, highlights }: { report: TargetReport; highlights: Highlight[] }) {
  const theme = useMemo(() => getChartTheme(), [])
  const rows = useMemo(() => rowsByLead(report.series), [report.series])
  const slotOf = new Map(highlights.map((entry) => [entry.id, entry.slot]))
  const meta = FIELD_META[report.field]

  return (
    <ChartFrame label="Jak se předpověď na vybranou hodinu měnila s blížícím se časem" height={280} empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} vertical={false} />
          <XAxis
            dataKey="leadHours"
            type="number"
            reversed
            domain={['dataMax', 0]}
            allowDecimals={false}
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme.border }}
            tickFormatter={leadLabel}
            minTickGap={24}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={report.field === 'rain'}
            tickFormatter={(value) => formatNumber(value, report.field === 'rain' ? 1 : 0)}
          />
          {report.observed !== null ? (
            <ReferenceLine
              y={report.observed}
              stroke={theme.foreground}
              strokeWidth={1}
              ifOverflow="extendDomain"
              label={{
                value: `Naměřeno ${formatNumber(report.observed, 1)} ${meta.unit}`,
                position: 'insideTopRight',
                fill: theme.foreground,
                fontSize: 11,
              }}
            />
          ) : null}
          <Tooltip
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload}
                label={`${leadLabel(Number(label))} předem`}
                formatter={(value, name) => `${name}: ${formatNumber(value, 1)} ${meta.unit}`}
              />
            )}
          />
          {report.series.map((entry) => {
            const slot = slotOf.get(entry.id)
            const color = slot === undefined ? CONTEXT_LINE_COLOR : SERIES_COLORS[slot]
            return (
              <Line
                key={entry.id}
                dataKey={entry.id}
                name={entry.name}
                stroke={color}
                strokeWidth={slot === undefined ? 1 : 2}
                dot={slot === undefined ? false : { r: 4, fill: color, stroke: theme.card, strokeWidth: 2 }}
                activeDot={slot === undefined ? false : { r: 6, fill: color, stroke: theme.card, strokeWidth: 2 }}
                tooltipType={slot === undefined ? 'none' : undefined}
                connectNulls
                isAnimationActive={false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
