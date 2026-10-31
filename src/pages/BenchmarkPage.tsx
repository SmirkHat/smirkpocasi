import { useEffect, useMemo, useRef, useState } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { AppPage, PageHeader } from '../components/AppChrome'
import BenchmarkTable, { rankedSources } from '../components/BenchmarkTable'
import BenchmarkLeadChart, { leadChartRows } from '../components/charts/BenchmarkLeadChart'
import BenchmarkTargetChart, { rowsByLead } from '../components/charts/BenchmarkTargetChart'
import { useBenchmark, useBenchmarkTarget } from '../hooks/useBenchmark'
import type { BenchmarkReport, TargetReport } from '../hooks/useBenchmark'
import type { BenchmarkDataset, BenchmarkField } from '../server/benchmark/config'
import {
  BASELINE_COLOR,
  BASELINE_SOURCE,
  FIELD_META,
  FULL_CONSENSUS_SOURCE,
  REFERENCE_SOURCE,
  SERIES_COLORS,
  formatCount,
  formatNumber,
  toggleHighlight,
} from '../utils/benchmarkFormat'
import type { Highlight } from '../utils/benchmarkFormat'
import { formatDateTime } from '../utils/formatters'
import { pragueDayKey } from '../utils/hourlyForecast'
import { parsePragueTime } from '../utils/weatherMath'

// Until live numbers can be ranked, the archive with months behind it is the better first view.
const LIVE_READY_MS = 14 * 86_400_000
const STALE_AFTER_MS = 12 * 3_600_000
const TARGET_DAYS = 14
const TARGET_HOURS = [0, 3, 6, 9, 12, 15, 18, 21]
const DEFAULT_TARGET_HOUR = 15
const DEFAULT_HIGHLIGHTED_SOURCES = 3

const SELECT_CLASS =
  'h-9 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24'

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select className={SELECT_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function StatusLine({ report, dataset }: { report: BenchmarkReport; dataset: BenchmarkDataset }) {
  const { status } = report
  const lastSnapshotMs = status.lastSnapshot === null ? null : status.lastSnapshot * 1000
  const asDate = (epochSeconds: number) => formatDateTime(new Date(epochSeconds * 1000).toISOString())
  const stopped = lastSnapshotMs !== null && Date.now() - lastSnapshotMs > STALE_AFTER_MS

  return (
    <div className="mb-4 flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {dataset === 'live'
          ? status.firstSnapshot === null
            ? 'Sběr právě začíná, první snímek se ještě ukládá.'
            : `Měříme od ${asDate(status.firstSnapshot)}. Poslední snímek ${asDate(status.lastSnapshot as number)}, celkem ${formatCount(status.livePairs)} porovnaných hodnot.`
          : `Starší běhy modelů z archivu Open-Meteo proti stanicím ČHMÚ, celkem ${formatCount(status.archivePairs)} porovnaných hodnot.`}
      </p>
      {stopped ? (
        <Alert variant="warning">
          <AlertTitle>Sběr se zastavil</AlertTitle>
          <AlertDescription>Poslední snímek je starší než 12 hodin, nová data nepřibývají.</AlertDescription>
        </Alert>
      ) : null}
      {status.lastErrors.length ? (
        <Alert variant="warning">
          <AlertTitle>Poslední sběr hlásil chyby: {status.lastErrors.length}</AlertTitle>
          <AlertDescription>{status.lastErrors[0]}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function Legend({ sources, highlights }: { sources: { id: string; name: string }[]; highlights: Highlight[] }) {
  const names = new Map(sources.map((source) => [source.id, source.name]))
  const baseline = names.get(BASELINE_SOURCE)
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {highlights.flatMap((entry) =>
        names.has(entry.id)
          ? [
              <li key={entry.id} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[entry.slot] }} aria-hidden="true" />
                {names.get(entry.id)}
              </li>,
            ]
          : [],
      )}
      {baseline ? (
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: BASELINE_COLOR }} aria-hidden="true" />
          {baseline}
        </li>
      ) : null}
      <li>Tence: ostatní zdroje</li>
    </ul>
  )
}

function CurveTable({ report, field, highlights }: { report: BenchmarkReport; field: BenchmarkField; highlights: Highlight[] }) {
  const rows = leadChartRows(report, field)
  if (!rows.length) return null
  const ids = new Set([...highlights.map((entry) => entry.id), BASELINE_SOURCE])
  const shown = report.sources.filter((source) => ids.has(source.id))
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Hodnoty z grafu v tabulce</summary>
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Předstih</TableHead>
              {shown.map((source) => (
                <TableHead key={source.id} className="text-right">{source.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="whitespace-nowrap">{row.label}</TableCell>
                {shown.map((source) => (
                  <TableCell key={source.id} className="text-right tabular-nums">
                    {formatNumber(row[source.id] as number | null, field === 'wind' ? 1 : 2)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  )
}

// With one point Recharts ignores dot={false} and paints white dots that match no legend entry.
const MIN_POINTS_FOR_LINE = 2

function TooFewPoints() {
  return <p className="py-8 text-center text-sm text-muted-foreground">Na křivku je zatím málo dat. Přibude s dalšími snímky.</p>
}

function TargetTable({ report, highlights }: { report: TargetReport; highlights: Highlight[] }) {
  const ids = new Set(highlights.map((entry) => entry.id))
  const shown = report.series.filter((entry) => ids.has(entry.id))
  const { unit } = FIELD_META[report.field]
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Hodnoty z grafu v tabulce</summary>
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Předem</TableHead>
              {shown.map((entry) => (
                <TableHead key={entry.id} className="text-right">{entry.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsByLead(report.series).map((row) => (
              <TableRow key={row.leadHours}>
                <TableCell className="whitespace-nowrap">{row.leadHours} h</TableCell>
                {shown.map((entry) => (
                  <TableCell key={entry.id} className="text-right tabular-nums">{formatNumber(row[entry.id] ?? null, 1)}</TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell>Naměřeno</TableCell>
              <TableCell colSpan={Math.max(shown.length, 1)} className="text-right tabular-nums">
                {report.observed === null ? 'zatím nezveřejněno' : `${formatNumber(report.observed, 1)} ${unit}`}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </details>
  )
}

function targetDays() {
  const now = Date.now()
  return Array.from({ length: TARGET_DAYS }, (_, index) => {
    const key = pragueDayKey(new Date(now - index * 86_400_000))
    const [, month, day] = key.split('-')
    return { value: key, label: `${Number(day)}. ${Number(month)}.` }
  })
}

function TargetSection({ field, station, stations, highlights }: { field: BenchmarkField; station: string; stations: BenchmarkReport['stations']; highlights: Highlight[] }) {
  const days = useMemo(targetDays, [])
  const [day, setDay] = useState(days[0].value)
  const [hour, setHour] = useState(String(DEFAULT_TARGET_HOUR))
  const [ownStation, setOwnStation] = useState(stations[0].id)
  const selectedStation = station || ownStation
  const valid = parsePragueTime(`${day}T${hour.padStart(2, '0')}:00`).getTime() / 1000
  const target = useBenchmarkTarget({ station: selectedStation, valid, field })

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Jak se předpověď blížila ke skutečnosti</CardTitle>
        <CardDescription>
          Co zdroje říkaly o jedné konkrétní hodině, od prvního snímku až po ten poslední. Vodorovná čára je naměřená hodnota. Komerční zdroje tady nejsou, jejich surové hodnoty neukládáme.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <div className="mb-3 flex flex-wrap gap-3">
          {station ? null : (
            <FilterSelect
              label="Stanice"
              value={ownStation}
              onChange={setOwnStation}
              options={stations.map((entry) => ({ value: entry.id, label: entry.name }))}
            />
          )}
          <FilterSelect label="Den" value={day} onChange={setDay} options={days} />
          <FilterSelect
            label="Hodina"
            value={hour}
            onChange={setHour}
            options={TARGET_HOURS.map((value) => ({ value: String(value), label: `${value}:00` }))}
          />
        </div>
        {target.data?.series.length ? (
          <>
            {rowsByLead(target.data.series).length < MIN_POINTS_FOR_LINE ? (
              <TooFewPoints />
            ) : (
              <>
                <BenchmarkTargetChart report={target.data} highlights={highlights} />
                <Legend sources={target.data.series} highlights={highlights} />
              </>
            )}
            <TargetTable report={target.data} highlights={highlights} />
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {target.loading ? 'Načítám…' : target.error ?? 'Pro tuhle hodinu zatím nejsou uložené předpovědi.'}
          </p>
        )}
      </CardPanel>
    </Card>
  )
}

function Methodology() {
  return (
    <details className="mb-4 rounded-xl border border-border bg-card/48 p-4 text-sm text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Jak se to měří</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p>
          Čtyřikrát denně uložíme, co zdroje předpovídají pro 12 stanic ČHMÚ, přesně tak, jak by to viděl návštěvník. Až nastane předpovězený čas, porovnáme to s naměřenou hodnotou. Předstih je doba mezi uložením a předpovězeným časem, ne stáří běhu modelu.
        </p>
        <p>
          <strong className="font-medium text-foreground">Chyba</strong> je průměrná absolutní odchylka. <strong className="font-medium text-foreground">Proti konsenzu</strong> srovnává zdroj s konsenzem otevřených zdrojů jen na stanicích, měsících a předstizích, kde byl zdroj opravdu měřený, protože jinak by zdroje z lehčích stanic vypadaly lépe. <strong className="font-medium text-foreground">Zkreslení</strong> říká, jestli zdroj systematicky přestřeluje (+) nebo podstřeluje (−).
        </p>
        <p>
          <strong className="font-medium text-foreground">Dosah</strong> je, jak daleko zdroj předpověď vůbec dává. <strong className="font-medium text-foreground">Dohled</strong> je, jak daleko drží teplotu v průměru do 2 °C, vítr do 5 km/h a srážky s ETS aspoň 0,2. Včerejšek je naivní odhad „bude stejně jako včera ve stejnou hodinu“: kdo ho neporazí, nepřidává nic.
        </p>
        <p>
          Srážky se hodnotí po šestihodinových úhrnech a déšť znamená aspoň 0,5 mm. Kratší okna by trestala přeháňku o hodinu vedle dvakrát. Když je během okna 2 °C a méně, srážky se nehodnotí, protože nevyhřívané srážkoměry v chladu nemusí sníh zachytit. ETS 0 znamená úspěšnost náhodného tipu, 1 je dokonalá předpověď.
        </p>
        <p>
          Komerční a neoficiální zdroje mají denní limity nebo nemají žádnou dohodu, takže běží jen na dvou stanicích dvakrát denně. Hodnoty hodnotíme pro bod stanice, kdežto model počítá průměr své buňky, proto žádný zdroj nedosáhne nulové chyby. První pořadí se ukáže po 14 dnech, do té doby jsou čísla jen orientační.
        </p>
        <p>
          DWD ICON v prvních dnech přebírá hodnoty z ICON-D2, proto mají oba stejná čísla. AROME odpovídá jen pro západní část republiky (z našich stanic Praha, Plzeň, České Budějovice, Cheb a Doksany), a proto má méně párů.
        </p>
      </div>
    </details>
  )
}

function defaultHighlights(report: BenchmarkReport, field: BenchmarkField) {
  const preferred = [REFERENCE_SOURCE, FULL_CONSENSUS_SOURCE]
  const present = new Set(report.sources.map((source) => source.id))
  const best = rankedSources(report.sources, field, 'short')
    .map((source) => source.id)
    // Its line would hide under DWD ICON, which is the same numbers for as long as ICON-D2 reaches.
    .filter((id) => id !== BASELINE_SOURCE && id !== 'icon_d2' && !preferred.includes(id))
    .slice(0, DEFAULT_HIGHLIGHTED_SOURCES)
  return [...preferred.filter((id) => present.has(id)), ...best].reduce<Highlight[]>(toggleHighlight, [])
}

export default function BenchmarkPage() {
  const [dataset, setDataset] = useState<BenchmarkDataset>('live')
  const [field, setField] = useState<BenchmarkField>('temperature')
  const [station, setStation] = useState('')
  const [month, setMonth] = useState('')
  const [group, setGroup] = useState('short')
  const [highlights, setHighlights] = useState<Highlight[] | null>(null)
  const datasetChosen = useRef(false)

  const { data, loading, error } = useBenchmark({ dataset, field, station, month })
  const report = data && data.enabled ? (data as BenchmarkReport) : null

  useEffect(() => {
    // A report for the previous filter may still be on screen while the next one loads.
    if (!report || report.filter.dataset !== dataset) return
    const { firstSnapshot, archivePairs } = report.status
    const liveIsYoung = firstSnapshot === null || Date.now() - firstSnapshot * 1000 < LIVE_READY_MS
    if (!datasetChosen.current && dataset === 'live' && liveIsYoung && archivePairs > 0) {
      datasetChosen.current = true
      setDataset('archive')
      return
    }
    datasetChosen.current = true
    if (report.sources.length) setHighlights((current) => current ?? defaultHighlights(report, field))
  }, [report, dataset, field])

  const chooseDataset = (next: BenchmarkDataset) => {
    datasetChosen.current = true
    setMonth('')
    setDataset(next)
  }
  const shown = highlights ?? []
  const meta = FIELD_META[field]

  return (
    <AppPage>
      <PageHeader
        title="Přesnost zdrojů"
        eyebrow="Předpovědi proti stanicím ČHMÚ"
        description="Jak přesně kdo předpovídá, jak daleko dohlédne a jak se zpřesňuje s blížícím se časem."
        backTo="/"
      />

      {error ? (
        <Alert variant="error" className="mb-4">
          <AlertTitle>Výsledky se nepodařilo načíst</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {data && !data.enabled ? (
        <Empty className="mb-4">
          <EmptyHeader>
            <EmptyTitle>Benchmark na tomhle serveru neběží</EmptyTitle>
            <EmptyDescription>
              {(data as { error?: string }).error ?? 'Sběr se zapíná na serveru s trvalým úložištěm proměnnou BENCHMARK_DATA_DIR.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!data && loading ? <Skeleton className="mb-4 h-96 w-full rounded-xl" /> : null}

      {report ? (
        <div className={cn('transition-opacity', loading && 'opacity-60')}>
          <StatusLine report={report} dataset={dataset} />

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Tabs value={field} onValueChange={(value) => setField(value as BenchmarkField)}>
              <TabsList>
                {(Object.keys(FIELD_META) as BenchmarkField[]).map((id) => (
                  <TabsTab key={id} value={id}>{FIELD_META[id].label}</TabsTab>
                ))}
              </TabsList>
            </Tabs>
            <FilterSelect
              label="Data"
              value={dataset}
              onChange={(value) => chooseDataset(value as BenchmarkDataset)}
              options={[
                { value: 'live', label: 'Živý sběr, všechny zdroje' },
                { value: 'archive', label: 'Archiv, jen modely Open-Meteo' },
              ]}
            />
            <FilterSelect
              label="Stanice"
              value={station}
              onChange={setStation}
              options={[{ value: '', label: 'Všechny stanice' }, ...report.stations.map((entry) => ({ value: entry.id, label: entry.name }))]}
            />
            <FilterSelect
              label="Období"
              value={month}
              onChange={setMonth}
              options={[{ value: '', label: 'Celé období' }, ...report.months.map((entry) => ({ value: entry, label: entry }))]}
            />
          </div>

          {report.sources.length === 0 ? (
            <Empty className="mb-4">
              <EmptyHeader>
                <EmptyTitle>Zatím není s čím porovnávat</EmptyTitle>
                <EmptyDescription>
                  {dataset === 'live'
                    ? 'Předpovědi se ukládají. První výsledky přibudou, jakmile nastane předpovězený čas a ČHMÚ zveřejní měření, obvykle do několika hodin.'
                    : 'Archiv se doplňuje na pozadí, jeden měsíc jedné stanice zhruba za půl minuty.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Pořadí</CardTitle>
                  <CardDescription>
                    {field === 'rain'
                      ? 'Seřazeno podle ETS: jak dobře zdroj trefuje déšť oproti náhodě.'
                      : 'Seřazeno podle chyby oproti konsenzu otevřených zdrojů, na stejných stanicích a předstizích.'}{' '}
                    Puntík zvýrazní zdroj v grafech.
                  </CardDescription>
                </CardHeader>
                <CardPanel>
                  <Tabs value={group} onValueChange={setGroup} className="mb-3">
                    <TabsList>
                      {report.groups.map((entry) => (
                        <TabsTab key={entry.id} value={entry.id}>{entry.label}</TabsTab>
                      ))}
                    </TabsList>
                  </Tabs>
                  <div className="overflow-x-auto">
                    <BenchmarkTable
                      sources={report.sources}
                      field={field}
                      group={group}
                      highlights={shown}
                      onToggleHighlight={(id) => setHighlights(toggleHighlight(shown, id))}
                    />
                  </div>
                  {report.unavailable.length ? (
                    <p className="mt-3 text-xs text-muted-foreground">Bez dat, zdroj neodpověděl: {report.unavailable.join(', ')}.</p>
                  ) : null}
                </CardPanel>
              </Card>

              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>{field === 'rain' ? 'Jak úspěšnost klesá s předstihem' : 'Jak chyba roste s předstihem'}</CardTitle>
                  <CardDescription>
                    {field === 'rain' ? 'Svisle ETS, výš je lépe.' : `Svisle průměrná chyba v ${meta.unit}, níž je lépe.`} Přerušovaná čára je hranice dohledu: {meta.limitLabel}.
                  </CardDescription>
                </CardHeader>
                <CardPanel>
                  {leadChartRows(report, field).length < MIN_POINTS_FOR_LINE ? (
                    <TooFewPoints />
                  ) : (
                    <>
                      <ClientOnly fallback={<Skeleton className="h-80 w-full" />}>
                        <BenchmarkLeadChart report={report} field={field} highlights={shown} />
                      </ClientOnly>
                      <Legend sources={report.sources} highlights={shown} />
                    </>
                  )}
                  <CurveTable report={report} field={field} highlights={shown} />
                </CardPanel>
              </Card>
            </>
          )}

          {dataset === 'live' ? (
            <ClientOnly fallback={null}>
              <TargetSection field={field} station={station} stations={report.stations} highlights={shown} />
            </ClientOnly>
          ) : null}

          <Methodology />

          <p className="mb-4 text-xs text-muted-foreground">
            Naměřené hodnoty: ČHMÚ (opendata.chmi.cz). Archiv běhů modelů: Open-Meteo Previous Runs (CC BY 4.0). Názvy zdrojů patří jejich vlastníkům, výsledky platí jen pro naše stanice a období.
          </p>
        </div>
      ) : null}
    </AppPage>
  )
}
