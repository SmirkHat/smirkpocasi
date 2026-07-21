import { useEffect, useState } from 'react'
import { pendingSources } from '../utils/consensusCore'

/**
 * @deprecated Prefer useHomeBundle on the home page (single cached /api/home).
 * Kept for non-home callers; returns empty pending sources.
 */
export function useWeatherConsensus(location) {
  const empty = {
    consensus: null,
    sources: pendingSources(),
    divergence: 0,
    confidence: 'low',
    aladin: null,
    yr: null,
    forecastSeries: [],
  }
  const [state] = useState(empty)
  const [loading, setLoading] = useState(Boolean(location?.lat && location?.lon))
  const [error] = useState(null)

  useEffect(() => {
    // Home page should use useHomeBundle. This stub avoids accidental fan-out.
    setLoading(false)
  }, [location?.lat, location?.lon])

  return { ...state, loading, error }
}
