import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adaptHourlySeries } from '../../utils/chartAdapters';
import { formatPercent, formatTemperature } from '../../utils/formatters';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import { getChartTheme } from './chartTheme';

export default function HourlyTempChart({ hourly }) {
  const data = useMemo(() => adaptHourlySeries(hourly, 24), [hourly]);
  const theme = useMemo(() => getChartTheme(), []);

  if (!data.length) return null;

  return (
    <ChartFrame label="Graf teploty a pravděpodobnosti srážek na 24 hodin" height={190} className="mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={theme.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            yAxisId="temp"
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(value) => `${Math.round(value)}°`}
          />
          <YAxis
            yAxisId="precip"
            orientation="right"
            domain={[0, 100]}
            hide
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value, name) =>
                  name === 'precipProb'
                    ? `Srážky: ${formatPercent(value)}`
                    : `Teplota: ${formatTemperature(value)}`
                }
              />
            }
          />
          <Area
            yAxisId="precip"
            type="monotone"
            dataKey="precipProb"
            name="precipProb"
            fill={theme.info}
            fillOpacity={0.18}
            stroke="none"
            isAnimationActive={false}
          />
          <Area
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            stroke="none"
            fill="url(#tempFill)"
            isAnimationActive={false}
            tooltipType="none"
          />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            name="temperature"
            stroke={theme.primary}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: theme.primary, stroke: theme.card, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
