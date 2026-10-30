import { describe, expect, it } from 'vitest'
import {
  canKeepPlaceName,
  decidePublish,
  distanceMeters,
  guessLocationFromTimezone,
  isAutoLocation,
} from './locationPolicy'

const BRNO = { lat: 49.1951, lon: 16.6068 }
const NEARBY = { lat: 49.1951, lon: 16.6168 } // ~730 m east
const PRAHA = { lat: 50.0755, lon: 14.4378 }

describe('decidePublish', () => {
  it('moves from an IP estimate to a GPS fix that disagrees with it', () => {
    expect(decidePublish({ ...BRNO, source: 'geojs' }, { ...NEARBY, source: 'gps', accuracyMeters: 20 })).toBe('move')
  })

  it('keeps the coordinates when GPS only confirms the estimate', () => {
    expect(decidePublish({ ...BRNO, source: 'geojs' }, { ...BRNO, source: 'gps', accuracyMeters: 20 })).toBe('refine')
  })

  it('never lets an IP estimate replace GPS', () => {
    expect(decidePublish({ ...BRNO, source: 'gps' }, { ...PRAHA, source: 'geojs' })).toBe('ignore')
  })

  it('never overrides a place picked by hand', () => {
    expect(decidePublish({ ...BRNO, source: 'favorite' }, { ...PRAHA, source: 'gps', accuracyMeters: 5 })).toBe('ignore')
    expect(decidePublish({ ...BRNO }, { ...PRAHA, source: 'gps', accuracyMeters: 5 })).toBe('ignore')
  })

  it('does not treat a move inside the GPS uncertainty as a move', () => {
    const precise = { ...BRNO, source: 'gps', accuracyMeters: 15 }
    expect(decidePublish(precise, { ...NEARBY, source: 'gps', accuracyMeters: 3000 })).toBe('ignore')
    expect(decidePublish(precise, { ...NEARBY, source: 'gps', accuracyMeters: 30 })).toBe('move')
  })

  it('records a better reading of the same spot', () => {
    expect(decidePublish({ ...BRNO, source: 'gps', accuracyMeters: 900 }, { ...BRNO, source: 'gps', accuracyMeters: 30 })).toBe('refine')
  })

  it('ignores small day-to-day jumps of the IP estimate', () => {
    expect(decidePublish({ ...BRNO, source: 'geojs' }, { ...NEARBY, source: 'cloudflare' })).toBe('ignore')
    expect(decidePublish({ ...BRNO, source: 'geojs' }, { ...PRAHA, source: 'cloudflare' })).toBe('move')
  })

  it('prefers a city estimate over a capital guessed from the country', () => {
    expect(decidePublish({ ...PRAHA, source: 'cloudflare-country' }, { ...BRNO, source: 'geojs' })).toBe('move')
    expect(decidePublish({ ...BRNO, source: 'geojs' }, { ...PRAHA, source: 'cloudflare-country' })).toBe('ignore')
  })
})

describe('location helpers', () => {
  it('measures distance', () => {
    expect(distanceMeters(BRNO, PRAHA) / 1000).toBeCloseTo(185, -1)
  })

  it('keeps a known name only nearby, and never the default city', () => {
    expect(canKeepPlaceName({ ...BRNO, source: 'geojs' }, NEARBY)).toBe(true)
    expect(canKeepPlaceName({ ...BRNO, source: 'geojs' }, PRAHA)).toBe(false)
    expect(canKeepPlaceName({ ...BRNO, source: 'default' }, NEARBY)).toBe(false)
  })

  it('guesses a place only from known time zones', () => {
    expect(guessLocationFromTimezone('Europe/Bratislava')?.name).toBe('Bratislava')
    expect(guessLocationFromTimezone('America/New_York')).toBeNull()
    expect(guessLocationFromTimezone(undefined)).toBeNull()
  })

  it('counts every automatic source as replaceable, and anything else as manual', () => {
    for (const source of ['gps', 'default', 'geojs', 'timezone', 'cloudflare-country']) {
      expect(isAutoLocation({ source })).toBe(true)
    }
    for (const source of ['favorite', 'nominatim', 'photon', undefined]) {
      expect(isAutoLocation({ source })).toBe(false)
    }
  })
})
