import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const build = vi.hoisted(() => vi.fn())

vi.mock('../src/server/fetchProvidersServer', () => ({
  buildServerConsensus: build,
  withTimeout: (promise: Promise<unknown>) => promise,
}))
vi.mock('../src/server/runLegacyHandler', () => ({
  runLegacyHandler: async () => ({ ok: true, status: 200, body: {} }),
  runLegacyJson: async () => ({}),
}))
vi.mock('../src/api/aqi', () => ({ fetchAQI: async () => null }))

const SECOND = 1000
const START = 1_800_000_000_000

type Answer = { status?: number; body?: any; headers: Record<string, string> }

function call(handler: any, lat: number): Promise<Answer> {
  const result: Answer = { headers: {} }
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
    end() {
      return this
    },
  }
  return Promise.resolve(handler({ method: 'GET', query: { lat: String(lat), lon: '16.6' } }, res)).then(() => result)
}

// A later microtask is enough: the mocked upstreams answer at once.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function consensus(temperature: number, partial = false) {
  return { consensus: { temperature }, sources: [], forecastSeries: [], partial }
}

async function freshHandler() {
  vi.resetModules()
  return (await import('./home')).default
}

beforeEach(() => {
  build.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(START)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/api/home memory cache', () => {
  it('serves a recent bundle as it is', async () => {
    build.mockResolvedValue(consensus(10))
    const handler = await freshHandler()
    expect((await call(handler, 49.1)).headers['X-Home-Cache']).toBe('MISS')
    vi.mocked(Date.now).mockReturnValue(START + 60 * SECOND)
    const second = await call(handler, 49.1)
    expect(second.headers['X-Home-Cache']).toBe('HIT')
    expect(second.body.stale).toBeUndefined()
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('answers an older bundle at once, says so, and refreshes behind it', async () => {
    build.mockResolvedValueOnce(consensus(10)).mockResolvedValueOnce(consensus(12))
    const handler = await freshHandler()
    await call(handler, 49.2)

    vi.mocked(Date.now).mockReturnValue(START + 120 * SECOND)
    const stale = await call(handler, 49.2)
    expect(stale.headers['X-Home-Cache']).toBe('STALE')
    expect(stale.headers['Cache-Control']).toBe('no-store')
    expect(stale.body.stale).toBe(true)
    expect(stale.body.consensus.consensus.temperature).toBe(10)

    await settle()
    const fresh = await call(handler, 49.2)
    expect(fresh.headers['X-Home-Cache']).toBe('HIT')
    expect(fresh.body.stale).toBeUndefined()
    expect(fresh.body.consensus.consensus.temperature).toBe(12)
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('starts one refresh however many clients ask for the older bundle', async () => {
    build.mockResolvedValue(consensus(10))
    const handler = await freshHandler()
    await call(handler, 49.3)
    vi.mocked(Date.now).mockReturnValue(START + 120 * SECOND)
    await Promise.all([call(handler, 49.3), call(handler, 49.3), call(handler, 49.3)])
    await settle()
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('never serves a bundle older than five minutes without rebuilding it', async () => {
    build.mockResolvedValueOnce(consensus(10)).mockResolvedValueOnce(consensus(12))
    const handler = await freshHandler()
    await call(handler, 49.4)
    vi.mocked(Date.now).mockReturnValue(START + 301 * SECOND)
    const answer = await call(handler, 49.4)
    expect(answer.headers['X-Home-Cache']).toBe('MISS')
    expect(answer.body.consensus.consensus.temperature).toBe(12)
  })

  it('does not keep an incomplete bundle', async () => {
    build.mockResolvedValueOnce(consensus(10, true)).mockResolvedValueOnce(consensus(12))
    const handler = await freshHandler()
    const partial = await call(handler, 49.5)
    expect(partial.headers['X-Home-Cache']).toBe('PARTIAL')
    expect(partial.headers['Cache-Control']).toBe('no-store')
    const next = await call(handler, 49.5)
    expect(next.headers['X-Home-Cache']).toBe('MISS')
    expect(next.body.consensus.consensus.temperature).toBe(12)
  })

  it('a failed refresh leaves the older bundle usable', async () => {
    build.mockResolvedValueOnce(consensus(10)).mockRejectedValueOnce(new Error('upstream down'))
    const handler = await freshHandler()
    await call(handler, 49.6)
    vi.mocked(Date.now).mockReturnValue(START + 120 * SECOND)
    await call(handler, 49.6)
    await settle()
    const again = await call(handler, 49.6)
    expect(again.status).toBe(200)
    expect(again.body.consensus.consensus.temperature).toBe(10)
  })
})
