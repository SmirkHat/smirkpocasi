import type { LegacyHandler, LegacyRequest, LegacyResponse } from '@/server/adaptVercelHandler'

export type HandlerOk = { ok: true; status: number; body: unknown }
export type HandlerErr = { ok: false; status: number; error: string; body?: unknown }
export type HandlerResult = HandlerOk | HandlerErr

/** Invoke a legacy (req, res) handler in-process — no HTTP hop. */
export async function runLegacyHandler(
  handler: LegacyHandler,
  query: Record<string, string>,
  method = 'GET',
): Promise<HandlerResult> {
  return new Promise((resolve) => {
    let settled = false

    const finish = (result: HandlerResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const res: LegacyResponse = {
      statusCode: 200,
      headers: {},
      status(code: number) {
        this.statusCode = code
        return this
      },
      setHeader(name: string, value: string) {
        this.headers[name] = value
      },
      json(payload: unknown) {
        if (this.statusCode >= 400) {
          const error =
            payload && typeof payload === 'object' && payload !== null && 'error' in payload
              ? String((payload as { error: unknown }).error)
              : `HTTP ${this.statusCode}`
          finish({ ok: false, status: this.statusCode, error, body: payload })
          return
        }
        finish({ ok: true, status: this.statusCode, body: payload })
      },
      end(text?: string) {
        if (text === undefined) {
          finish(
            this.statusCode >= 400
              ? { ok: false, status: this.statusCode, error: `HTTP ${this.statusCode}` }
              : { ok: true, status: this.statusCode, body: null },
          )
          return
        }
        try {
          const payload = JSON.parse(text)
          this.json(payload)
        } catch {
          finish(
            this.statusCode >= 400
              ? { ok: false, status: this.statusCode, error: text }
              : { ok: true, status: this.statusCode, body: text },
          )
        }
      },
    }

    const req: LegacyRequest = {
      method,
      url: `http://local/api?${new URLSearchParams(query)}`,
      query,
      headers: {},
    }

    Promise.resolve(handler(req, res)).catch((error) => {
      finish({
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  })
}

export async function runLegacyJson(
  handler: LegacyHandler,
  query: Record<string, string>,
): Promise<unknown> {
  const result = await runLegacyHandler(handler, query)
  if (!result.ok) throw new Error(result.error)
  return result.body
}
