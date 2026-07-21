/**
 * Optional absolute API origin for split deploys.
 * Empty / unset → same-origin `/api/...` (Vercel all-in-one or full VPS).
 * Example: `https://api.pocasi.smht.eu` when UI is on Vercel and API on a VPS.
 */
export function getApiBase(): string {
  const raw = String(import.meta.env.VITE_API_BASE || '').trim()
  return raw.replace(/\/$/, '')
}

/** Build a client URL for an API path (`/api/weather?...`). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const base = getApiBase()
  return base ? `${base}${normalized}` : normalized
}
