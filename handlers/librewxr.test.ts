import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (req: unknown, res: unknown) => Promise<void>

function call(handler: Handler) {
  const result: { status?: number; body?: any; headers: Record<string, string> } = { headers: {} }
  const res = {
    setHeader(name: string, value: string) {
      result.headers[name] = value
    },
    status(code: number) {
      result.status = code
      return this
    },
    json(body: unknown) {
      result.body = body
      return this
    },
  }
  return handler({ query: {} }, res).then(() => result)
}

const catalog = {
  version: '2.0',
  generated: 1793391600,
  host: 'https://api.librewxr.net',
  radar: {
    past: [{ time: 1793391600, path: '/v2/radar/1793391600' }],
    nowcast: [{ time: 1793392200, path: '/v2/radar/1793392200' }],
  },
  satellite: { infrared: [{ time: 1793391600, path: '/v2/satellite/1793391600' }] },
}

function mockUpstream(payload: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => payload })))
}

// The handler keeps its cache at module scope, so every test starts from a fresh import.
async function freshHandler(): Promise<Handler> {
  vi.resetModules()
  return (await import('./librewxr')).default as unknown as Handler
}

const START = 1_800_000_000_000
const SECOND = 1000
const MINUTE = 60 * SECOND

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(START)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('/api/librewxr', () => {
  it('passes on the radar frames and drops what the map does not use', async () => {
    mockUpstream(catalog)
    const { status, body } = await call(await freshHandler())
    expect(status).toBe(200)
    expect(body.radar).toEqual(catalog.radar)
    expect(body.host).toBe(catalog.host)
    expect(body.satellite).toBeUndefined()
  })

  it('asks upstream once a minute at most', async () => {
    mockUpstream(catalog)
    const handler = await freshHandler()
    await call(handler)
    vi.mocked(Date.now).mockReturnValue(START + 59 * SECOND)
    await call(handler)
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.mocked(Date.now).mockReturnValue(START + 61 * SECOND)
    await call(handler)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shares one upstream request between concurrent callers', async () => {
    mockUpstream(catalog)
    const handler = await freshHandler()
    await Promise.all([call(handler), call(handler), call(handler)])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('marks a recent list as stale when upstream fails', async () => {
    mockUpstream(catalog)
    const handler = await freshHandler()
    await call(handler)
    mockUpstream(null, false)
    vi.mocked(Date.now).mockReturnValue(START + 10 * MINUTE)
    const { status, body } = await call(handler)
    expect(status).toBe(200)
    expect(body.stale).toBe(true)
  })

  it('reports an outage once the last list is too old, so the client can switch radar', async () => {
    mockUpstream(catalog)
    const handler = await freshHandler()
    await call(handler)
    mockUpstream(null, false)
    vi.mocked(Date.now).mockReturnValue(START + 31 * MINUTE)
    expect((await call(handler)).status).toBe(502)
  })

  it('treats an answer without frames as a failure', async () => {
    mockUpstream({ radar: { past: [] } })
    expect((await call(await freshHandler())).status).toBe(502)
  })
})
