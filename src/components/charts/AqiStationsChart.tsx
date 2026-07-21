import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adaptAqiStations } from '../../utils/chartAdapters';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import { aqiFill, getChartTheme } from './chartTheme';

export default function AqiStationsChart({ stations }) {
  const data = useMemo(() => adaptAqiStations(stations), [stations]);
  const theme = useMemo(() => getChartTheme(), []);

  if (data.length < 2) return null;

  return (
    <ChartFrame label="Porovnání indexu kvality ovzduší na nejbližších stanicích" height={Math.max(140, data.length * 36)} className="mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 6" horizontal={false} />
          <XAxis type="number" domain={[0, 6]} hide />
          <YAxis
            type="category"
            dataKey="shortLabel"
            width={88}
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value, _name, entry) => {
                  const row = entry?.payload;
                  const dist = row?.distanceKm != null ? ` · ${row.distanceKm} km` : '';
                  return `${row?.labelText || 'Index'} (${value})${dist}`;
                }}
              />
            }
          />
          <Bar dataKey="indexValue" name="indexValue" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.label} fill={aqiFill(row.indexValue, theme)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
