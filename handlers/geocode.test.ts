import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './geocode'

function call(query: Record<string, string>) {
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
  }
  return Promise.resolve(handler({ query }, res)).then(() => result)
}

function mockUpstreams(nominatim: unknown, photon: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const payload = String(url).includes('nominatim') ? nominatim : photon
      return payload ? { ok: true, json: async () => payload } : { ok: false, status: 503 }
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/api/geocode reverse lookup', () => {
  it('names the coordinates, with the district as detail', async () => {
    mockUpstreams(
      { address: { city: 'Brno', suburb: 'Veveří', county: 'okres Brno-město' } },
      null,
    )
    const { status, body } = await call({ lat: '49.2001', lon: '16.6001' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ name: 'Brno', label: 'Veveří · okres Brno-město', source: 'nominatim' })
  })

  it('falls back to Photon when Nominatim is unavailable', async () => {
    mockUpstreams(null, { features: [{ properties: { city: 'Klatovy', county: 'Plzeňský kraj' } }] })
    const { body } = await call({ lat: '49.3902', lon: '13.2902' })
    expect(body).toMatchObject({ name: 'Klatovy', source: 'photon' })
  })

  it('asks upstream only once for the same spot', async () => {
    mockUpstreams({ address: { town: 'Luby' } }, null)
    await call({ lat: '50.2503', lon: '12.4003' })
    await call({ lat: '50.2503', lon: '12.4003' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports when nobody knows the place, and rejects bad input', async () => {
    mockUpstreams(null, null)
    expect((await call({ lat: '10.1004', lon: '10.1004' })).status).toBe(404)
    expect((await call({ lat: 'abc', lon: '10' })).status).toBe(400)
  })
})
