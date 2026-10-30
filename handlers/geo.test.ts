import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './geo'

function call(headers: Record<string, string>) {
  const result: { status?: number; body?: any } = {}
  const res = {
    setHeader() {},
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
  return Promise.resolve(handler({ method: 'GET', headers }, res)).then(() => result)
}

function mockGeoJs(payload: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => payload })))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/api/geo', () => {
  it('prefers city coordinates from the edge without a third-party lookup', async () => {
    mockGeoJs({})
    const { body } = await call({
      'x-vercel-ip-latitude': '49.19',
      'x-vercel-ip-longitude': '16.60',
      'x-vercel-ip-city': 'Brno',
    })
    expect(body.name).toBe('Brno')
    expect(body.source).toBe('vercel')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('tries the IP lookup before settling for the capital of a country', async () => {
    mockGeoJs({ latitude: '49.39', longitude: '13.29', city: 'Klatovy', country: 'Czechia' })
    const { body } = await call({ 'cf-ipcountry': 'CZ', 'x-forwarded-for': '85.70.1.1' })
    expect(body.name).toBe('Klatovy')
    expect(body.source).toBe('geojs')
  })

  it('falls back to the capital, under its own name, when the IP lookup fails', async () => {
    mockGeoJs({}, false)
    const { status, body } = await call({ 'cf-ipcountry': 'CZ', 'cf-ipcity': 'Brno' })
    expect(status).toBe(200)
    expect(body.name).toBe('Praha')
    expect(body.lat).toBeCloseTo(50.0755)
    expect(body.source).toBe('cloudflare-country')
  })

  it('reports failure when nothing is known', async () => {
    mockGeoJs({}, false)
    const { status } = await call({})
    expect(status).toBe(404)
  })
})
