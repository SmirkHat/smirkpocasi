export const FIELD_META = {
  temperature: { label: 'Teplota', unit: '°C', limit: 2, limitLabel: 'chyba 2 °C', withinLabel: 'Trefa ±2 °C' },
  wind: { label: 'Vítr', unit: 'km/h', limit: 5, limitLabel: 'chyba 5 km/h', withinLabel: 'Trefa ±5 km/h' },
  rain: { label: 'Srážky', unit: 'mm', limit: 0.2, limitLabel: 'ETS 0,2', withinLabel: '' },
} as const

/** Validated against the card surface #222222: every adjacent pair stays apart under colour blindness. */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
export const BASELINE_COLOR = '#c3c2b7'
export const CONTEXT_LINE_COLOR = '#4a4a48'

export const BASELINE_SOURCE = 'persistence'
export const REFERENCE_SOURCE = 'consensus_open'
export const FULL_CONSENSUS_SOURCE = 'consensus'

/** Below this a rank says more about the sample than about the source. */
export const MIN_PAIRS_FOR_RANK = 200
export const MIN_DAYS_FOR_RANK = 14
export const MIN_PAIRS_TO_PLOT = 30

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)} %`
}

export function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const percent = value * 100
  if (Math.abs(percent) < 0.05) return '0 %'
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`
}

export function formatSigned(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value), digits)}`
}

function czechDays(days: number) {
  if (days === 1) return '1 den'
  return days >= 2 && days <= 4 ? `${days} dny` : `${days} dní`
}

export function formatHorizon(hours: number | null | undefined) {
  if (!hours) return '—'
  return hours < 48 ? `${hours} h` : czechDays(Math.round(hours / 24))
}

export function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : value.toLocaleString('cs-CZ')
}

export type Highlight = { id: string; slot: number }

/** A newly highlighted source takes the lowest free colour and keeps it, so a filter never repaints the others. */
export function toggleHighlight(highlights: Highlight[], id: string) {
  if (highlights.some((entry) => entry.id === id)) return highlights.filter((entry) => entry.id !== id)
  const used = new Set(highlights.map((entry) => entry.slot))
  const slot = SERIES_COLORS.findIndex((_, index) => !used.has(index))
  return slot === -1 ? highlights : [...highlights, { id, slot }]
}
