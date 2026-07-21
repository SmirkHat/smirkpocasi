import { createFileRoute } from '@tanstack/react-router'
import { corsHeaders } from '@/server/adaptVercelHandler'

async function health() {
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
