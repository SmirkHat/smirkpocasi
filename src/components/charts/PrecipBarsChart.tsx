import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adaptNowcastPrecip } from '../../utils/chartAdapters';
import { formatPrecipitation } from '../../utils/formatters';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import { getChartTheme } from './chartTheme';

export default function PrecipBarsChart({ aladin, limit = 10 }) {
  const data = useMemo(() => adaptNowcastPrecip(aladin, limit), [aladin, limit]);
  const theme = useMemo(() => getChartTheme(), []);
  const maxPrecip = Math.max(...data.map((row) => row.precip), 0.1);

  if (!data.length) return null;

  return (
    <ChartFrame label="Graf srážkového výhledu Aladin" height={160}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: theme.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(value) => `${Number(value).toFixed(value >= 1 ? 0 : 1)}`}
          />
          <Tooltip
            content={<ChartTooltip formatter={(value) => `Srážky: ${formatPrecipitation(value)}`} />}
          />
          <Bar dataKey="precip" name="precip" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((row) => (
              <Cell
                key={row.fullLabel}
                fill={theme.info}
                fillOpacity={row.precip <= 0 ? 0.22 : 0.35 + (row.precip / maxPrecip) * 0.65}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
