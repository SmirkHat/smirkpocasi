/**
 * Adapts legacy Vercel-style (req, res) handlers to TanStack Start server routes.
 * Also applies CORS so the same API can be hosted on a separate VPS origin.
 */

export type LegacyRequest = {
  method?: string
  url?: string
  query: Record<string, string>
  headers: Record<string, string | string[] | undefined>
}

export type LegacyResponse = {
  statusCode: number
  headers: Record<string, string>
  status: (code: number) => LegacyResponse
  setHeader: (name: string, value: string) => void
  json: (payload: unknown) => void
  end: (body?: string) => void
}

export type LegacyHandler = (req: LegacyRequest, res: LegacyResponse) => void | Promise<void>

type StartHandlerArgs = { request: Request }

function allowedCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS
  if (raw == null || raw.trim() === '') return ['*']
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
  }
  const allowed = allowedCorsOrigins()
  const origin = request.headers.get('Origin')

  if (allowed.includes('*')) {
    headers['Access-Control-Allow-Origin'] = '*'
    return headers
  }

  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }

  return headers
}

function mergeHeaders(base: Record<string, string>, extra: Record<string, string>) {
  return { ...base, ...extra }
}

export function adaptVercelHandler(handler: LegacyHandler) {
  return async ({ request }: StartHandlerArgs): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    const url = new URL(request.url)
    const query = Object.fromEntries(url.searchParams.entries())

    let statusCode = 200
    const headers: Record<string, string> = {}
    let body: string | undefined
    let settled = false

    const res: LegacyResponse = {
      statusCode: 200,
      headers,
      status(code: number) {
        statusCode = code
        this.statusCode = code
        return this
      },
      setHeader(name: string, value: string) {
        headers[name] = value
      },
      json(payload: unknown) {
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json; charset=utf-8'
        }
        body = JSON.stringify(payload)
        settled = true
      },
      end(text?: string) {
        if (text !== undefined) body = text
        settled = true
      },
    }

    const headerBag: Record<string, string | string[] | undefined> = {}
    request.headers.forEach((value, key) => {
      headerBag[key] = value
    })

    const req: LegacyRequest = {
      method: request.method,
      url: request.url,
      query,
      headers: headerBag,
    }

    try {
      await handler(req, res)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return Response.json(
        { error: 'API handler failed.', detail },
        { status: 500, headers: corsHeaders(request) },
      )
    }

    const responseHeaders = mergeHeaders(headers, corsHeaders(request))

    if (!settled) {
      return new Response(null, { status: statusCode || 204, headers: responseHeaders })
    }

    return new Response(body ?? null, { status: statusCode, headers: responseHeaders })
  }
}

/** GET + OPTIONS (+ HEAD) for every API route — needed for cross-origin VPS API. */
export function apiHandlers(handler: LegacyHandler) {
  const adapted = adaptVercelHandler(handler)
  return {
    GET: adapted,
    HEAD: adapted,
    OPTIONS: async ({ request }: StartHandlerArgs) =>
      new Response(null, { status: 204, headers: corsHeaders(request) }),
  }
}
