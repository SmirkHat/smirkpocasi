import { createMiddleware, createStart } from '@tanstack/react-start'
import { corsHeaders } from '@/server/adaptVercelHandler'

function isApiOnlyEnabled() {
  const raw = String(process.env.API_ONLY || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function isApiPath(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function withCors(response: Response, request: Request) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/** Ensure API responses always carry CORS, even when a route is missing. */
const apiCorsMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    const url = new URL(request.url)
    if (!isApiPath(url.pathname)) return next()

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    // Request middleware next() returns { request, response, context, pathname } — not a Response.
    const result = await next()
    const contentType = result.response.headers.get('content-type') || ''

    // Missing API routes often fall through to the HTML app shell — convert to JSON 404.
    if (result.response.status === 404 && contentType.includes('text/html')) {
      return Response.json(
        { error: 'API route not found.', path: url.pathname },
        { status: 404, headers: corsHeaders(request) },
      )
    }

    return {
      ...result,
      response: withCors(result.response, request),
    }
  },
)

/** When API_ONLY=true, only `/api/*` is served (Dokploy API host). */
const apiOnlyMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    if (!isApiOnlyEnabled()) return next()

    const url = new URL(request.url)
    if (isApiPath(url.pathname)) {
      return next()
    }

    const frontend = String(process.env.FRONTEND_URL || '')
      .trim()
      .replace(/\/$/, '')
    if (frontend) {
      return Response.redirect(`${frontend}${url.pathname}${url.search}`, 302)
    }

    return Response.json(
      {
        error: 'API-only host',
        hint: 'Use /api/* on this origin, or set FRONTEND_URL to redirect browsers.',
      },
      { status: 404, headers: corsHeaders(request) },
    )
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [apiOnlyMiddleware, apiCorsMiddleware],
}))
