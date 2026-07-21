import { cn } from '@/lib/utils';

export function ChartFrame({ children, className, height = 180, label, empty }) {
  if (empty) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground', className)}
        style={{ height }}
        role="img"
        aria-label={label}
      >
        Graf není k dispozici
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)} style={{ height }} role="img" aria-label={label}>
      {children}
    </div>
  );
}
