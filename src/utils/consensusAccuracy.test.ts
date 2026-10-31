import { describe, expect, it } from 'vitest'
import { normalizeAladin } from '../api/normalizers/aladin'
import { normalizeOpenMeteo } from '../api/normalizers/openmeteo'
import { normalizePocasiCz } from '../api/normalizers/pocasicz'
import { buildMergedForecastDays } from './hourlyForecast'
import { buildCurrentRain, buildPrecipitationGroups, buildResult } from './consensusCore'
import { robustAggregate, robustMean, weatherCodeConsensus, weightedMedian } from './robustAggregate'
import { PROVIDERS } from '../config/providers'
import {
  calculateAbsoluteHumidity,
  calculateApparentTemperature,
  calculateDewPoint,
  calculateRelativeHumidity,
  calculateVaporPressureDeficit,
  calculateWetBulbTemperature,
  parsePragueTime,
} from './weatherMath'

const NOW = Date.parse('2026-10-30T17:30:00Z')

function hours(values: unknown[]) {
  const time = values.map((_, hour) => `2026-10-30T${String(hour).padStart(2, '0')}:00`)
  return { time, temperature_2m: values }
}

describe('Open-Meteo "now" value', () => {
  // 18:30 Prague: must be between the 18:00 and 19:00 slots, never the midnight one.
  const temperatures = Array.from({ length: 24 }, (_, hour) => hour)

  it('interpolates hourly data when the endpoint has no current block', () => {
    const result = normalizeOpenMeteo({ utc_offset_seconds: 3600, hourly: hours(temperatures) }, NOW)
    expect(result.temperature).toBeCloseTo(18.5)
  })

  it('prefers the current block when there is one', () => {
    const result = normalizeOpenMeteo(
      { utc_offset_seconds: 3600, current: { temperature_2m: 9.1 }, hourly: hours(temperatures) },
      NOW,
    )
    expect(result.temperature).toBe(9.1)
  })

  it('bridges sparse 6-hourly models and never invents a value from a far hour', () => {
    const sparse = temperatures.map((value, hour) => (hour % 6 === 0 ? value : null))
    const twoHoursEarlier = NOW - 2 * 60 * 60 * 1000
    expect(normalizeOpenMeteo({ utc_offset_seconds: 3600, hourly: hours(sparse) }, twoHoursEarlier).temperature).toBeCloseTo(16.5)

    const onlyMidnight = temperatures.map((value, hour) => (hour === 0 ? value : null))
    expect(normalizeOpenMeteo({ utc_offset_seconds: 3600, hourly: hours(onlyMidnight) }, NOW).temperature).toBeNull()
  })

  it('reports the interval of the current precipitation sum', () => {
    const result = normalizeOpenMeteo(
      { utc_offset_seconds: 3600, current: { precipitation: 0.5, interval: 900 }, hourly: hours(temperatures) },
      NOW,
    )
    expect(result.precipitationIntervalMinutes).toBe(15)
  })
})

describe('Aladin "now" value', () => {
  const data = {
    forecastTimeIso: '2026-10-30 13:00:00',
    weatherIconNames: ['wi_day_cloud', 'wi_day_cloud', 'wi_cloud', 'wi_cloud', 'wi_cloud', 'wi_night', 'wi_night'],
    parameterValues: {
      TEMPERATURE: [13, 14, 15, 16, 17, 18, 19],
      HUMIDITY: [0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.7],
      CLOUDS_TOTAL: [0.2, 0.2, 0.2, 0.2, 0.2, 0.75, 0.75],
      PRESSURE: [102800, 102800, 102800, 102800, 102800, 102900, 103000],
    },
  }

  it('reads the current hour, not the start of the model run', () => {
    expect(normalizeAladin(data, NOW).temperature).toBeCloseTo(18.5)
    expect(normalizeAladin(data, NOW).iconName).toBe('wi_night')
  })

  it('converts cloud fractions to percent', () => {
    expect(normalizeAladin(data, NOW).cloudCover).toBeCloseTo(75)
  })
})

describe('robust aggregation', () => {
  it('splits an even vote instead of always taking the colder member', () => {
    expect(
      weightedMedian([
        { value: 8, weight: 1 },
        { value: 10, weight: 1 },
      ]),
    ).toBe(9)
  })

  it('uses information from all members, unlike a median', () => {
    const entries = [8, 9, 9.2, 10, 10.5].map((value) => ({ value, weight: 1 }))
    expect(robustMean(entries)).toBeCloseTo(9.34)
  })

  it('is not dragged away by one wild member', () => {
    const entries = [9, 9.2, 9.4, 9.6, 9.8].map((value) => ({ value, weight: 1 }))
    const mean = robustMean([...entries, { value: 40, weight: 1 }]) as number
    expect(mean).toBeLessThan(10.5)
  })

  it('does not let a majority of dry models erase scattered showers from the hourly total', () => {
    const entries = [0, 0, 0, 0, 3, 5].map((value) => ({ value, weight: 1 }))
    expect(robustAggregate(entries, { tolerance: 25, limits: [0, 250], mean: true })).toBeCloseTo(8 / 6)
  })

  it('votes on the kind of weather before the exact code', () => {
    const code = weatherCodeConsensus([
      { value: 3, weight: 5 },
      { value: 61, weight: 3 },
      { value: 63, weight: 2 },
      { value: 80, weight: 2 },
    ])
    expect(code).toBe(61)
  })
})

describe('precipitation', () => {
  it('compares sources in mm/h regardless of their reporting interval', () => {
    const groups = buildPrecipitationGroups([
      { id: 'icon_d2', name: 'a', status: 'ok', weight: 1, precipitation: 0.5, precipitationIntervalMinutes: 15 },
      { id: 'gfs', name: 'b', status: 'ok', weight: 1, precipitation: 2, precipitationIntervalMinutes: 60 },
    ])
    expect(groups.openMeteo.value).toBeCloseTo(2)
  })

  it('ignores a rain gauge too far away to describe this place', () => {
    const fresh = new Date().toISOString()
    const result = buildCurrentRain([
      { id: 'chmi', name: 'x', status: 'ok', precipitation: 3, observedAt: fresh, distanceKm: 80 },
    ])
    expect(result.state).toBe('unknown')
  })
})

describe('consensus with stations', () => {
  const enabled = PROVIDERS.filter((provider) => provider.enabled)
  const observedAt = new Date(NOW - 10 * 60 * 1000).toISOString()

  function settledFor(values: Record<string, Record<string, unknown>>) {
    return enabled.map((provider) =>
      values[provider.id]
        ? { status: 'fulfilled', value: values[provider.id] }
        : { status: 'fulfilled', value: { providerStatus: 'not-applicable' } },
    )
  }

  const models = {
    ecmwf_ifs: { temperature: 8, humidity: 70, weatherCode: 3 },
    icon_d2: { temperature: 8, humidity: 70, weatherCode: 3 },
    gfs: { temperature: 8, humidity: 70, weatherCode: 3 },
  }

  it('moves the current temperature towards a fresh nearby station', () => {
    const result = buildResult(
      settledFor({ ...models, chmi: { temperature: 10, humidity: 70, observedAt, distanceKm: 3 } }),
      NOW,
    )
    expect(result.consensus.temperature).toBeGreaterThan(8.8)
    expect(result.consensus.temperature).toBeLessThan(10)
    expect(result.observationBlend.temperature.stations).toBe(1)
    expect(result.includedSourceIds).toContain('chmi')
  })

  it('ignores a station whose reading cannot be the same air, or is stale or far away', () => {
    for (const station of [
      { temperature: 0, humidity: 70, observedAt, distanceKm: 3 },
      { temperature: 10, humidity: 70, observedAt: new Date(NOW - 5 * 3600 * 1000).toISOString(), distanceKm: 3 },
      { temperature: 10, humidity: 70, observedAt, distanceKm: 120 },
    ]) {
      const result = buildResult(settledFor({ ...models, chmi: station }), NOW)
      expect(result.consensus.temperature).toBeCloseTo(8)
    }
  })

  it('still produces values when only stations answered', () => {
    const result = buildResult(settledFor({ chmi: { temperature: 10, humidity: 70, observedAt, distanceKm: 3 } }), NOW)
    expect(result.consensus.temperature).toBe(10)
  })

  it('lets rain gauges overrule a dry model forecast', () => {
    const result = buildResult(
      settledFor({
        ...models,
        chmi: { temperature: 8, precipitation: 0.2, precipitationIntervalMinutes: 10, observedAt, distanceKm: 3 },
      }),
      NOW,
    )
    expect(result.currentRain.state).toBe('raining')
    expect(result.consensus.weatherCode).toBe(61)
  })

  it('weights wind direction by wind speed', () => {
    const result = buildResult(
      settledFor({
        ecmwf_ifs: { temperature: 8, windDirection: 90, windSpeed: 40 },
        icon_d2: { temperature: 8, windDirection: 270, windSpeed: 2 },
        gfs: { temperature: 8, windDirection: 270, windSpeed: 2 },
      }),
      NOW,
    )
    expect(result.consensus.windDirection).toBeCloseTo(90, 0)
  })

  it('no longer ships the raw Yr payload', () => {
    expect(buildResult(settledFor(models), NOW)).not.toHaveProperty('yr')
  })
})

describe('values computed from the final consensus', () => {
  const enabled = PROVIDERS.filter((provider) => provider.enabled)
  const observedAt = new Date(NOW - 10 * 60 * 1000).toISOString()

  function settledFor(values: Record<string, Record<string, unknown>>) {
    return enabled.map((provider) =>
      values[provider.id]
        ? { status: 'fulfilled', value: values[provider.id] }
        : { status: 'fulfilled', value: { providerStatus: 'not-applicable' } },
    )
  }

  it('keeps temperature, dew point and humidity consistent with each other', () => {
    const { consensus } = buildResult(
      settledFor({
        ecmwf_ifs: { temperature: 6, dewPoint: 2, humidity: 60 },
        icon_d2: { temperature: 9, dewPoint: 5, humidity: 90 },
      }),
      NOW,
    )
    expect(consensus.humidity).toBeCloseTo(calculateRelativeHumidity(consensus.temperature, consensus.dewPoint) as number)
    expect(calculateDewPoint(consensus.temperature, consensus.humidity)).toBeCloseTo(consensus.dewPoint)
  })

  it('stays consistent after a station has moved temperature and dew point', () => {
    const { consensus, fieldSources, observationBlend } = buildResult(
      settledFor({
        ecmwf_ifs: { temperature: 8, humidity: 70 },
        icon_d2: { temperature: 8, humidity: 70 },
        chmi: { temperature: 10, humidity: 60, observedAt, distanceKm: 3 },
      }),
      NOW,
    )
    expect(observationBlend.dewPoint.stations).toBe(1)
    expect(consensus.humidity).toBeCloseTo(calculateRelativeHumidity(consensus.temperature, consensus.dewPoint) as number)
    expect(fieldSources.humidity.map((entry: { id: string }) => entry.id)).toContain('chmi')
  })

  it('computes wet bulb, VPD and absolute humidity once instead of averaging what sources say', () => {
    const { consensus, fieldSources } = buildResult(
      settledFor({
        ecmwf_ifs: { temperature: 8, humidity: 70, wetBulbTemperature: 30, vaporPressureDeficit: 15, absoluteHumidity: 70 },
        icon_d2: { temperature: 8, humidity: 70 },
      }),
      NOW,
    )
    expect(consensus.wetBulbTemperature).toBeCloseTo(calculateWetBulbTemperature(consensus.temperature, consensus.humidity) as number)
    expect(consensus.vaporPressureDeficit).toBeCloseTo(calculateVaporPressureDeficit(consensus.temperature, consensus.humidity) as number)
    expect(consensus.absoluteHumidity).toBeCloseTo(calculateAbsoluteHumidity(consensus.temperature, consensus.humidity) as number)
    expect(fieldSources.wetBulbTemperature).toBeUndefined()
  })

  it('takes sunrise and sunset from one Open-Meteo model instead of averaging every source', () => {
    const { consensus, fieldSources } = buildResult(
      settledFor({
        weathercom: { temperature: 8, sunrise: 500, sunset: 900 },
        ecmwf_ifs: { temperature: 8, sunrise: 400, sunset: 1000 },
        icon_d2: { temperature: 8, sunrise: 400, sunset: 1000 },
      }),
      NOW,
    )
    expect(consensus.sunrise).toBe(400)
    expect(consensus.sunset).toBe(1000)
    expect(fieldSources.sunrise.map((entry: { id: string }) => entry.id)).toEqual(['ecmwf_ifs'])
  })

  it('still finds sunrise when no Open-Meteo model answered', () => {
    const { consensus } = buildResult(settledFor({ weathercom: { temperature: 8, sunrise: 500, sunset: 900 } }), NOW)
    expect(consensus.sunrise).toBe(500)
  })
})

describe('humidity and feels-like formulas', () => {
  it('keeps the wet bulb between dew point and temperature', () => {
    for (let temperature = -25; temperature <= 38; temperature += 3) {
      for (let humidity = 10; humidity <= 100; humidity += 5) {
        const wetBulb = calculateWetBulbTemperature(temperature, humidity) as number
        expect(wetBulb).toBeLessThanOrEqual(temperature + 0.001)
        expect(wetBulb).toBeGreaterThanOrEqual((calculateDewPoint(temperature, humidity) as number) - 0.001)
      }
    }
  })

  it('matches a psychrometric table value', () => {
    expect(calculateWetBulbTemperature(20, 50)).toBeCloseTo(13.8, 0)
    expect(calculateWetBulbTemperature(10, 100)).toBeCloseTo(10)
  })

  it('reverses the dew point calculation', () => {
    expect(calculateRelativeHumidity(15, calculateDewPoint(15, 64))).toBeCloseTo(64)
    expect(calculateRelativeHumidity(5, 6)).toBe(100)
  })

  it('does not jump where the wind chill formula used to take over', () => {
    const gap = (a: unknown, b: unknown) => Math.abs((a as number) - (b as number))
    expect(gap(calculateApparentTemperature(10, 80, 20), calculateApparentTemperature(10.1, 80, 20))).toBeLessThan(0.3)
    expect(gap(calculateApparentTemperature(5, 80, 4.8), calculateApparentTemperature(5, 80, 4.9))).toBeLessThan(0.3)
  })

  it('feels colder with more wind', () => {
    expect(calculateApparentTemperature(5, 80, 30) as number).toBeLessThan(calculateApparentTemperature(5, 80, 5) as number)
  })
})

describe('Počasí.cz', () => {
  const data = {
    current: { temp: 8 },
    place: { localNow: '2026-10-31T08:08:37+01:00' },
    daily: [
      { localDate: '2026-10-30', sunrise: '06:35', sunset: '16:38' },
      { localDate: '2026-10-31', sunrise: '06:37', sunset: '16:36' },
    ],
  }

  it('reads today, not the first row, which is yesterday', () => {
    expect(normalizePocasiCz(data).sunrise).toBe(6 * 60 + 37)
  })

  it('has no sun times rather than the wrong day', () => {
    expect(normalizePocasiCz({ ...data, daily: [data.daily[0]] }).sunrise).toBeNull()
  })
})

describe('forecast time handling', () => {
  it('reads zoneless timestamps as Prague time in both summer and winter', () => {
    expect(parsePragueTime('2026-10-30T18:00').toISOString()).toBe('2026-10-30T17:00:00.000Z')
    expect(parsePragueTime('2026-07-01 18:00:00').toISOString()).toBe('2026-07-01T16:00:00.000Z')
    expect(parsePragueTime('2026-07-01T18:00:00Z').toISOString()).toBe('2026-07-01T18:00:00.000Z')
  })

  it('aligns zoneless and absolute-time sources into the same hour', () => {
    const { days } = buildMergedForecastDays({
      forecastSeries: [
        {
          id: 'model',
          weight: 1,
          kind: 'openmeteo',
          data: { time: ['2026-10-30T18:00'], temperature_2m: [10] },
        },
        {
          id: 'absolute',
          weight: 1,
          kind: 'steps',
          data: { steps: [{ time: '2026-10-30T17:00:00Z', temperature: 12 }] },
        },
      ],
    })
    expect(days[0].hours).toHaveLength(1)
    expect(days[0].hours[0].temperature).toBeCloseTo(11)
  })
})
