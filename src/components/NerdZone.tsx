import { useState } from 'react';
import { HiArrowTopRightOnSquare, HiBeaker, HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { WiThermometer } from 'react-icons/wi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  formatAbsoluteHumidity,
  formatCloudCover,
  formatDateTime,
  formatPercent,
  formatPrecipitation,
  formatPressure,
  formatTemperature,
  formatUvIndex,
  formatVaporPressureDeficit,
  formatVisibility,
  formatWind,
  formatWindDirection
} from '../utils/formatters';
import { getWeatherInfo } from '../utils/weatherCodes';

const observationSourceIds = new Set([
  'opensensemap',
  'chmi',
  'aviation',
  'brightsky',
  'shmu',
  'geosphere',
  'imgw',
  'netatmo',
  'wunderground',
  'inpocasi',
]);

const confidenceCopy = {
  high: { label: 'Shoda zdrojů', variant: 'success' },
  medium: { label: 'Mírná nejistota', variant: 'warning' },
  low: { label: 'Nejistý výhled', variant: 'error' }
};

const derivedFieldLabels = {
  apparentTemperature: 'pocitově',
  absoluteHumidity: 'abs. vlhkost',
  dewPoint: 'rosný bod',
  vaporPressureDeficit: 'VPD',
  weatherCode: 'stav',
  wetBulbTemperature: 'mokrá t.'
};

function sourceSortRank(source) {
  // 1) used in consensus → 2) ok control / unused → 3) pending → 4) errors / missing keys
  if (source.status === 'ok' && source.included) return 0;
  if (source.status === 'ok') return 1;
  if (source.status === 'pending') return 2;
  return 3;
}

function getApiRows(consensus) {
  const sources = consensus?.sources || [];
  const okSources = sources.filter((source) => source.status === 'ok');
  const forecastSources = okSources.filter((source) => !observationSourceIds.has(source.id));
  const includedIds = new Set(consensus?.includedSourceIds || (forecastSources.length ? forecastSources : okSources).map((source) => source.id));

  return sources
    .map((source) => {
      const weatherInfo = source.weatherCode == null ? null : getWeatherInfo(source.weatherCode);
      return {
        ...source,
        condition: source.status === 'ok' ? weatherInfo?.label || '—' : '—',
        ConditionIcon: weatherInfo?.Icon || WiThermometer,
        included: source.included ?? includedIds.has(source.id),
        role: source.type || (observationSourceIds.has(source.id) ? 'Pozorování' : 'Model/API'),
        symbol: source.symbolCode || source.iconName || (source.weatherCode == null ? null : `WMO ${source.weatherCode}`)
      };
    })
    .sort((a, b) => {
      const rank = sourceSortRank(a) - sourceSortRank(b);
      if (rank !== 0) return rank;
      return String(a.name || a.id).localeCompare(String(b.name || b.id), 'cs');
    });
}

function DerivedValue({ source, field, fields, children }) {
  const fieldNames = fields || [field];
  const derived = fieldNames.some((name) => source.derivedFields?.[name]);
  return <span className={derived ? 'italic' : undefined}>{children}</span>;
}

function statusVariant(source) {
  if (source.status === 'pending') return 'secondary';
  if (source.status !== 'ok') return source.status === 'error' ? 'error' : 'outline';
  return source.included ? 'success' : 'secondary';
}

function statusLabel(source) {
  if (source.status === 'pending') return 'Načítám';
  if (source.status === 'no-data') return 'Bez dat';
  if (source.status === 'not-applicable') return 'Mimo oblast';
  if (source.status === 'error') return 'Chyba';
  if (source.status !== 'ok') return source.status;
  if (source.included) return 'Ve výpočtu';
  return observationSourceIds.has(source.id) ? 'Kontrolní data' : 'Mimo výpočet';
}

function statusDotClass(source) {
  if (source.status === 'pending') return 'bg-warning';
  if (source.status !== 'ok') return 'bg-destructive';
  if (source.included) return 'bg-success';
  return 'bg-info';
}

function derivedSummary(source) {
  const fields = Object.entries(source.derivedFields || {})
    .filter(([, derived]) => derived)
    .map(([field]) => derivedFieldLabels[field])
    .filter(Boolean);
  const qualityIssues = source.qualityIssues || [];

  if (!fields.length && !qualityIssues.length) return '—';

  return [
    fields.length ? `Dopočteno: ${fields.join(', ')}` : null,
    qualityIssues.length ? `Mimo výpočet: ${qualityIssues.join(', ')}` : null
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatDistance(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return null;
  return distance < 10 ? `${distance.toFixed(1)} km od místa` : `${Math.round(distance)} km od místa`;
}

function formatPrecipitationRange(source) {
  if (source.precipitationMin == null && source.precipitationMax == null) return '—';
  return `${formatPrecipitation(source.precipitationMin)} / ${formatPrecipitation(source.precipitationMax)}`;
}

function formatCloudLayers(source) {
  const layers = [source.cloudCoverLow, source.cloudCoverMedium, source.cloudCoverHigh].map(formatCloudCover);
  return layers.every((value) => value === '—') ? '—' : layers.join(' / ');
}

function formatSourceHost(url) {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function sourceFaviconUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (!host) return null;
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch {
    return null;
  }
}

function SourceFavicon({ url, name }) {
  const [failed, setFailed] = useState(false);
  const src = sourceFaviconUrl(url);
  if (!src || failed) {
    return (
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[0.5rem] font-bold text-muted-foreground"
        aria-hidden="true"
      >
        {(name || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="size-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

function NerdStat({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-border/55 bg-background/40 p-3">
      <div className="text-[0.6875rem] font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function ApiValue({ source, label, value, field, fields }) {
  return (
    <div className="min-w-0">
      <div className="text-[0.6875rem] font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground">
        <DerivedValue field={field} fields={fields} source={source}>
          {value}
        </DerivedValue>
      </div>
    </div>
  );
}

type ApiField = { label: string; field?: string; fields?: string[]; value: (source) => string };

const apiPrimaryFields: ApiField[] = [
  { label: 'Teplota', field: 'temperature', value: (source) => formatTemperature(source.temperature) },
  { label: 'Pocitově', field: 'apparentTemperature', value: (source) => formatTemperature(source.apparentTemperature) },
  { label: 'Srážky', field: 'precipitation', value: (source) => formatPrecipitation(source.precipitation) },
  { label: 'Vítr', field: 'windSpeed', value: (source) => formatWind(source.windSpeed) },
  { label: 'Vlhkost', field: 'humidity', value: (source) => formatPercent(source.humidity) },
  { label: 'Tlak', field: 'pressure', value: (source) => formatPressure(source.pressure) }
];

const apiSecondaryFields: ApiField[] = [
  { label: 'Rosný bod', field: 'dewPoint', value: (source) => formatTemperature(source.dewPoint) },
  { label: 'Mokrá teplota', field: 'wetBulbTemperature', value: (source) => formatTemperature(source.wetBulbTemperature) },
  { label: 'Prav. srážek', field: 'precipitationProbability', value: (source) => formatPercent(source.precipitationProbability) },
  { label: 'Rozsah srážek', fields: ['precipitationMin', 'precipitationMax'], value: formatPrecipitationRange },
  { label: 'Nárazy', field: 'windGust', value: (source) => formatWind(source.windGust) },
  { label: 'Směr', field: 'windDirection', value: (source) => formatWindDirection(source.windDirection) },
  { label: 'Oblačnost', field: 'cloudCover', value: (source) => formatCloudCover(source.cloudCover) },
  { label: 'Vrstvy oblaků', fields: ['cloudCoverLow', 'cloudCoverMedium', 'cloudCoverHigh'], value: formatCloudLayers },
  { label: 'Mlha', field: 'fogArea', value: (source) => formatPercent(source.fogArea) },
  { label: 'Viditelnost', field: 'visibility', value: (source) => formatVisibility(source.visibility) },
  { label: 'UV', field: 'uvIndex', value: (source) => formatUvIndex(source.uvIndex) },
  { label: 'VPD', field: 'vaporPressureDeficit', value: (source) => formatVaporPressureDeficit(source.vaporPressureDeficit) },
  { label: 'Abs. vlhkost', field: 'absoluteHumidity', value: (source) => formatAbsoluteHumidity(source.absoluteHumidity) },
  { label: 'Nejistota', field: 'temperatureSpread', value: (source) => formatTemperature(source.temperatureSpread) }
];

const expertMetrics = [
  {
    key: 'dewPoint',
    label: 'Rosný bod',
    format: formatTemperature,
    description: 'Teplota, při které vzduch dosáhne nasycení vodní párou.'
  },
  {
    key: 'wetBulbTemperature',
    label: 'Mokrá teplota',
    format: formatTemperature,
    description: 'Odhad chladicího efektu odpařování z teploty a relativní vlhkosti.'
  },
  {
    key: 'vaporPressureDeficit',
    label: 'Deficit páry (VPD)',
    format: formatVaporPressureDeficit,
    description: 'Deficit tlaku vodní páry. Vyšší hodnota znamená sušší vzduch a rychlejší vysušování.'
  },
  {
    key: 'absoluteHumidity',
    label: 'Absolutní vlhkost',
    format: formatAbsoluteHumidity,
    description: 'Kolik gramů vodní páry je přibližně v metru krychlovém vzduchu.'
  }
];

function ExpertMetricsGrid({ consensusValues }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {expertMetrics.map((metric) => (
        <div key={metric.key} className="rounded-lg border border-border/55 bg-background/40 p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6875rem] font-medium uppercase tracking-normal text-muted-foreground">{metric.label}</span>
            <Badge variant="secondary" size="sm">odhad</Badge>
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {metric.format(consensusValues?.[metric.key])}
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{metric.description}</p>
        </div>
      ))}
    </div>
  );
}

function SourceValuesPanel({ source }) {
  const Icon = source.ConditionIcon;
  const details = derivedSummary(source);
  const distance = formatDistance(source.distanceKm);

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {source.condition}
        </span>
        {distance ? <span>{distance}</span> : null}
        {source.symbol ? <span className="truncate">{source.symbol}</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {apiPrimaryFields.map((item) => (
          <ApiValue
            field={item.field}
            fields={item.fields}
            key={item.label}
            label={item.label}
            source={source}
            value={item.value(source)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-3 lg:grid-cols-4">
        {apiSecondaryFields.map((item) => (
          <ApiValue
            field={item.field}
            fields={item.fields}
            key={item.label}
            label={item.label}
            source={source}
            value={item.value(source)}
          />
        ))}
      </div>

      {details !== '—' ? <p className="text-xs leading-snug text-muted-foreground">{details}</p> : null}
      {source.error ? <p className="text-xs leading-snug text-destructive-foreground">{source.error}</p> : null}
      {source.attribution ? <p className="text-xs leading-snug text-muted-foreground">{source.attribution}</p> : null}
    </div>
  );
}

function SourceTableRows({ source }) {
  const [open, setOpen] = useState(false);
  const detailId = `source-detail-${source.id}`;

  return (
    <>
      <TableRow className={cn(source.status !== 'ok' && source.status !== 'pending' && 'opacity-70')}>
        <TableCell className="max-w-0 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(source))} aria-hidden="true" />
            <SourceFavicon name={source.name} url={source.url} />
            <span className="min-w-0 truncate font-medium text-foreground" title={source.name}>
              {source.name}
            </span>
            {source.url ? (
              <a
                aria-label={`Otevřít ${formatSourceHost(source.url) || source.name}`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                href={source.url}
                rel="noreferrer"
                target="_blank"
                title={formatSourceHost(source.url) || source.url}
              >
                <HiArrowTopRightOnSquare className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="py-1.5">
          <Badge className="max-w-full truncate" variant={statusVariant(source)}>
            {statusLabel(source)}
          </Badge>
        </TableCell>
        <TableCell className="py-1.5 text-right">
          <Button
            aria-controls={detailId}
            aria-expanded={open}
            className="h-7 px-2"
            onClick={() => setOpen((value) => !value)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Detaily
            {open ? <HiChevronUp aria-hidden="true" /> : <HiChevronDown aria-hidden="true" />}
          </Button>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell className="whitespace-normal border-t border-border py-3" colSpan={3} id={detailId}>
            <SourceValuesPanel source={source} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function ApiSourcesTable({ rows }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[46%]">Zdroj</TableHead>
          <TableHead className="w-[34%]">Stav</TableHead>
          <TableHead className="w-[20%] text-right">Data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell className="text-muted-foreground" colSpan={3}>
              Zatím žádné zdroje.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((source) => <SourceTableRows key={source.id} source={source} />)
        )}
      </TableBody>
    </Table>
  );
}

/**
 * Expertní data (rozptyl zdrojů, VPD, dopočtené metriky) — inline dropdown dolů.
 */
export default function NerdZone({ consensus, updatedAt, offline }) {
  const [open, setOpen] = useState(false);
  const rows = getApiRows(consensus);
  const okCount = rows.filter((source) => source.status === 'ok').length;
  const includedCount = rows.filter((source) => source.included).length;
  const unavailableCount = rows.filter((source) => source.status !== 'ok' && source.status !== 'pending').length;
  const confidence = confidenceCopy[consensus?.confidence] || confidenceCopy.low;
  const divergence = Number.isFinite(consensus?.divergence) ? `±${consensus.divergence.toFixed(1)}°` : '—';
  const consensusValues = consensus?.consensus;
  const panelId = 'nerd-zone-panel';

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/48 backdrop-blur-xl backdrop-saturate-150">
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className="h-auto w-full justify-between rounded-none px-4 py-6 hover:bg-muted/50"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-2 text-left">
          <HiBeaker className="size-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">Nerd zóna</span>
            <span className="block text-xs font-normal text-muted-foreground">Zdroje a expertní data</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {rows.length ? <Badge variant="secondary">{rows.length} zdrojů</Badge> : null}
          <Badge variant={confidence.variant}>{confidence.label}</Badge>
          {open ? <HiChevronUp className="size-5" aria-hidden="true" /> : <HiChevronDown className="size-5" aria-hidden="true" />}
        </span>
      </Button>

      {open ? (
        <div id={panelId} className="border-t border-border px-4 py-5">
          <p className="mb-5 text-sm text-muted-foreground">
            Konsensus skládá modely a API do jednoho výstupu; pozorování slouží jako kontrolní vrstva.
            {updatedAt ? ` Aktualizováno ${formatDateTime(updatedAt)}.` : ''}
            {offline ? ' Zobrazuji offline data.' : ''}
          </p>

          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NerdStat label="Celkem" value={rows.length} detail="zapojených zdrojů" />
              <NerdStat label="Dostupné" value={okCount} detail={unavailableCount ? `${unavailableCount} bez dat` : 'vše běží'} />
              <NerdStat label="Ve výpočtu" value={includedCount} detail="pro hlavní hodnoty" />
              <NerdStat label={confidence.label} value={divergence} detail="rozptyl teploty" />
            </div>

            <section aria-label="Expertní metriky" className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Expertní metriky</h3>
              <ExpertMetricsGrid consensusValues={consensusValues} />
            </section>

            <section aria-label="Zdroje počasí" className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Zdroje počasí</h3>
              <p className="text-xs text-muted-foreground">
                Stav zahrnuje i to, jestli zdroj vstupuje do konsensu. Detaily se otevřou pod řádkem zdroje.
              </p>
              <ApiSourcesTable rows={rows} />
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
