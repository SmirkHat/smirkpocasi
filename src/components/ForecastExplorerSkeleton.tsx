import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Lives apart from ForecastExplorer so showing it does not pull in the chart library. */
export function ForecastExplorerSkeleton() {
  return (
    <Card className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Načítám předpověď">
      <CardHeader className="shrink-0 pb-0">
        <CardTitle>Podrobná předpověď</CardTitle>
        <CardDescription>Hodinový graf a týdenní přehled</CardDescription>
      </CardHeader>
      <CardPanel className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <div className="flex gap-4 border-b pb-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-14" />
          </div>
          <Skeleton className="mt-3 h-[220px] w-full rounded-md" />
          <Skeleton className="mx-auto mt-2 h-3 w-40" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-border/70 pt-3">
          <p className="mb-2 shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Týdenní přehled
          </p>
          <div className="flex flex-col gap-1" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className="grid w-full grid-cols-[5.5rem_2rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-lg px-2 py-2 sm:grid-cols-[6.5rem_2.25rem_minmax(0,1fr)_3rem] sm:gap-3"
              >
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="size-7 justify-self-center rounded-full sm:size-8" />
                <div className="flex min-w-0 items-center gap-2">
                  <Skeleton className="h-4 w-7 shrink-0 sm:w-8" />
                  <Skeleton className="h-1.5 min-w-8 flex-1 rounded-full" />
                  <Skeleton className="h-4 w-7 shrink-0 sm:w-8" />
                </div>
                <Skeleton className="h-3.5 w-6 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}
