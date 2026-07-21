import { useMemo } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adaptMeteostatDays } from '../../utils/chartAdapters';
import { formatPrecipitation, formatTemperature } from '../../utils/formatters';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import { getChartTheme } from './chartTheme';

export default function MeteostatHistoryChart({ days }) {
  const data = useMemo(() => adaptMeteostatDays(days), [days]);
  const theme = useMemo(() => getChartTheme(), []);

  if (!data.length) return null;

  return (
    <ChartFrame label="Historie teplot a srážek Meteostat" height={210} className="mb-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="meteostatRange" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.primary} stopOpacity={0.45} />
              <stop offset="100%" stopColor={theme.chart2} stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: theme.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="temp"
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(value) => `${Math.round(value)}°`}
          />
          <YAxis yAxisId="precip" orientation="right" hide />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value, name, entry) => {
                  if (name === 'precip') return `Srážky: ${formatPrecipitation(value)}`;
                  if (name === 'span') {
                    const row = entry?.payload;
                    return `Min–max: ${formatTemperature(row?.tmin)} – ${formatTemperature(row?.tmax)}`;
                  }
                  if (name === 'tavg') return `Průměr: ${formatTemperature(value)}`;
                  if (name === 'base') return null;
                  return `${name}: ${value}`;
                }}
              />
            }
          />
          <Area
            yAxisId="temp"
            type="monotone"
            dataKey="base"
            stackId="range"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            yAxisId="temp"
            type="monotone"
            dataKey="span"
            name="span"
            stackId="range"
            stroke={theme.primary}
            strokeWidth={1.5}
            fill="url(#meteostatRange)"
            isAnimationActive={false}
          />
          <Bar
            yAxisId="precip"
            dataKey="precip"
            name="precip"
            fill={theme.info}
            fillOpacity={0.5}
            radius={[3, 3, 0, 0]}
            maxBarSize={20}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
