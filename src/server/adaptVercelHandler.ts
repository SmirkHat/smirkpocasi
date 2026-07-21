/**
 * Adapts legacy Vercel-style (req, res) handlers to TanStack Start server routes.
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

export function adaptVercelHandler(handler: LegacyHandler) {
  return async ({ request }: { request: Request }): Promise<Response> => {
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
        { status: 500 },
      )
    }

    if (!settled) {
      return new Response(null, { status: statusCode || 204, headers })
    }

    return new Response(body ?? null, { status: statusCode, headers })
  }
}
