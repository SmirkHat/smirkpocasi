export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;

  const rows = payload
    .map((entry) => {
      if (entry.value == null || entry.value === '') return null;
      const formatted = formatter
        ? formatter(entry.value, entry.name, entry)
        : `${entry.name}: ${entry.value}`;
      if (formatted == null || formatted === false) return null;
      return { key: `${entry.dataKey}-${entry.name}`, color: entry.color, formatted };
    })
    .filter(Boolean);

  if (!rows.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      {label ? <div className="mb-1 font-medium text-foreground">{label}</div> : null}
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
            <span>{row.formatted}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
