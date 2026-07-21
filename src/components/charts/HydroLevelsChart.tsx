import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adaptHydroSpaFill } from '../../utils/chartAdapters';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import { floodFill, getChartTheme } from './chartTheme';

/** Comparable fill vs SPA1 (or DE mean-water reference), not absolute cm. */
export default function HydroLevelsChart({ profiles, limit = 8 }) {
  const data = useMemo(() => adaptHydroSpaFill(profiles, limit), [profiles, limit]);
  const theme = useMemo(() => getChartTheme(), []);
  const maxPct = Math.max(120, ...data.map((row) => row.spaPct ?? 0), 100);

  if (!data.length) return null;

  return (
    <ChartFrame
      label="Naplnění ke stupni SPA 1 (CZ) / MHW (DE)"
      height={Math.max(160, data.length * 36)}
      className="mb-4"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 6" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, maxPct]}
            tick={{ fill: theme.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}%`}
            width={36}
          />
          <YAxis
            type="category"
            dataKey="shortLabel"
            width={88}
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine
            x={100}
            stroke={theme.warning}
            strokeDasharray="4 4"
            label={{ value: 'SPA1', fill: theme.warning, fontSize: 10, position: 'insideTopRight' }}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value, _name, entry) => {
                  const row = entry?.payload;
                  const river = row?.river ? ` · ${row.river}` : '';
                  const cm = row?.height != null ? ` · ${Math.round(row.height)} cm` : '';
                  const spa = row?.floodLevel > 0 ? ` · SPA ${row.floodLevel}` : '';
                  return `${Number(value).toFixed(0)} %${cm}${river}${spa}`;
                }}
              />
            }
          />
          <Bar dataKey="spaPct" name="spaPct" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.label} fill={floodFill(row.floodLevel, theme)} fillOpacity={0.88} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function HydroSparkline({ history, floodLevel = 0, className }) {
  const theme = useMemo(() => getChartTheme(), []);
  const data = useMemo(
    () => (Array.isArray(history) ? history.map((p, i) => ({ i, v: p.v, t: p.t })) : []),
    [history],
  );

  if (data.length < 3) return null;

  const stroke = floodFill(floodLevel, theme);
  const min = Math.min(...data.map((d) => d.v));
  const max = Math.max(...data.map((d) => d.v));
  const pad = Math.max(1, (max - min) * 0.15);

  return (
    <div className={className} style={{ height: 36 }} role="img" aria-label="Průběh vodního stavu">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <YAxis domain={[min - pad, max + pad]} hide />
          <XAxis dataKey="i" hide />
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            fill={stroke}
            fillOpacity={0.18}
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
