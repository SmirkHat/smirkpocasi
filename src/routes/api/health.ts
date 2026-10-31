import { createFileRoute } from '@tanstack/react-router'
import { corsHeaders } from '@/server/adaptVercelHandler'

/**
 * The container's health check calls this every 30 s, so a long-running host starts the collector
 * right after boot, without waiting for a visitor. Imported from a route so that it shares the route
 * bundle's Open-Meteo limiter with the home API.
 */
async function startBenchmarkOnLongRunningHost() {
  if (!process.env.BENCHMARK_DATA_DIR) return
  const { ensureBenchmarkRunning } = await import('@/server/benchmark/collector')
  ensureBenchmarkRunning()
}

async function health() {
  await startBenchmarkOnLongRunningHost()
  return Response.json(
    {
      ok: true,
      service: 'smirkpocasi',
      ts: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await health()
        const headers = new Headers(response.headers)
        for (const [key, value] of Object.entries(corsHeaders(request))) {
          headers.set(key, value)
        }
        return new Response(response.body, { status: response.status, headers })
      },
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
    },
  },
})
