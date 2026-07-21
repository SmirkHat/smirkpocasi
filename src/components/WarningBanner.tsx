import { useState } from 'react';
import { HiExclamationTriangle } from 'react-icons/hi2';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const severityVariant = {
  Extreme: 'error',
  Severe: 'error',
  Moderate: 'warning',
  Minor: 'secondary',
};

/** CAP severity is always English enum — show Czech labels in UI. */
const severityLabel = {
  Extreme: 'Extrémní',
  Severe: 'Vysoké',
  Moderate: 'Střední',
  Minor: 'Nízké',
  Unknown: 'Neznámé',
};

function shortenWarningText(text, maxLen = 180) {
  if (!text) return null;
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/u)[0] || cleaned;
  if (firstSentence.length <= maxLen) return firstSentence;
  return `${firstSentence.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

/** "Region (town1, town2, …)" → keep region + a few towns when the list is long. */
function formatWarningArea(area) {
  const match = String(area || '').match(/^(.+?)\s*\((.+)\)\s*$/u);
  if (!match) return area;
  const [, region, citiesRaw] = match;
  const cities = citiesRaw.split(',').map((part) => part.trim()).filter(Boolean);
  if (cities.length <= 4) return area;
  return `${region} (${cities.slice(0, 3).join(', ')} +${cities.length - 3})`;
}

function WarningCard({ warning }) {
  const [expanded, setExpanded] = useState(false);
  const variant = severityVariant[warning.severity] || 'warning';
  const shortDescription = shortenWarningText(warning.description);
  const fullDescription = warning.description?.replace(/\s+/g, ' ').trim() || null;
  const canExpand = Boolean(fullDescription && shortDescription && fullDescription !== shortDescription);
  const areas = (warning.areas || []).slice(0, 4).map(formatWarningArea);

  return (
    <Alert variant={variant}>
      <HiExclamationTriangle className="size-5 shrink-0" aria-hidden="true" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        <span>{warning.headline || warning.event}</span>
        <Badge variant={variant}>{severityLabel[warning.severity] || warning.severity}</Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-1">
          {fullDescription ? (
            <p>{expanded || !canExpand ? fullDescription : shortDescription}</p>
          ) : null}
          {canExpand ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto self-start px-0 py-0 text-xs"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Méně' : 'Více'}
            </Button>
          ) : null}
          {areas.length ? (
            <p className="text-xs opacity-80">
              {areas.join(' · ')}
              {warning.areas.length > 4 ? '…' : ''}
            </p>
          ) : null}
          <p className="text-xs opacity-80">
            {warning.onset ? `Od ${new Date(warning.onset).toLocaleString('cs-CZ')}` : null}
            {warning.expires ? ` · do ${new Date(warning.expires).toLocaleString('cs-CZ')}` : null}
            {warning.web ? (
              <>
                {' · '}
                <a className="underline underline-offset-2" href={warning.web} rel="noreferrer" target="_blank">
                  ČHMÚ
                </a>
              </>
            ) : null}
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default function WarningBanner({ warnings, attribution }) {
  if (!warnings?.length) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {warnings.slice(0, 3).map((warning) => (
        <WarningCard key={warning.id} warning={warning} />
      ))}
      {attribution ? <p className="text-xs text-muted-foreground">{attribution}</p> : null}
    </div>
  );
}
