import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/apiBase'
import type { benchmarkReport, targetReport } from '../server/benchmark/report'
import type { BenchmarkDataset, BenchmarkField } from '../server/benchmark/config'

export type BenchmarkReport = ReturnType<typeof benchmarkReport>
export type BenchmarkSource = BenchmarkReport['sources'][number]
export type BenchmarkStats = BenchmarkSource['groups'][string]
export type TargetReport = ReturnType<typeof targetReport>

type Disabled = { enabled: false; error?: string | null }
type RequestState<T> = { data: T | null; loading: boolean; error: string | null }

function useApiJson<T>(path: string | null) {
  const [state, setState] = useState<RequestState<T>>({ data: null, loading: path !== null, error: null })

  useEffect(() => {
    if (path === null) return undefined
    const controller = new AbortController()
    setState((previous) => ({ ...previous, loading: true, error: null }))
    fetch(apiUrl(path), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Server odpověděl ${response.status}.`)
        return (await response.json()) as T
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: Error) => {
        if (error.name === 'AbortError') return
        setState({ data: null, loading: false, error: error.message })
      })
    return () => controller.abort()
  }, [path])

  return state
}

export function useBenchmark(filter: { dataset: BenchmarkDataset; field: BenchmarkField; station: string; month: string }) {
  const params = new URLSearchParams({ dataset: filter.dataset, field: filter.field })
  if (filter.station) params.set('station', filter.station)
  if (filter.month) params.set('month', filter.month)
  return useApiJson<BenchmarkReport | Disabled>(`/api/benchmark?${params}`)
}

export function useBenchmarkTarget(filter: { station: string; valid: number; field: BenchmarkField } | null) {
  const path = filter
    ? `/api/benchmark?${new URLSearchParams({ view: 'target', station: filter.station, valid: String(filter.valid), field: filter.field })}`
    : null
  return useApiJson<TargetReport>(path)
}
