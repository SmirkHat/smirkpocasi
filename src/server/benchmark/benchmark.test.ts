import { describe, expect, it } from 'vitest'
import { finishedMonths, scoreArchivedRuns } from './archive'
import { latestSlot, nextSlot } from './collector'
import { leadBucket } from './config'
import { relativeToReference, statistics, usefulHorizon } from './report'
import { addPair, emptyCounts, observedRainWindow, persistenceHour } from './scoring'
import type { ScoreCell, ScoreSheet } from './scoring'
import { forecastRows, hourlyValues, rainWindowTotal, seriesToVerify } from './series'
import { inTransaction, openBenchmarkDb, readScores, saveForecastRows, saveObservations } from './store'
import { hourlyObservations } from './truth'
import { pruneForecasts, scoreForecasts } from './verify'

const HOUR = 3600
const T0 = Date.UTC(2026, 6, 15, 0, 0, 0) / 1000
const at = (hours: number) => T0 + hours * HOUR

function observationsEvery(hours: number[], temperature = 20, wind = 10, rain: number | null = 0) {
  return new Map(hours.map((hour) => [at(hour), { temperature, wind, rain }]))
}

describe('lead buckets', () => {
  it('puts a lead on the upper bound it does not exceed', () => {
    expect(leadBucket(0)).toBe(3)
    expect(leadBucket(3)).toBe(3)
    expect(leadBucket(3.01)).toBe(6)
    expect(leadBucket(24)).toBe(24)
    expect(leadBucket(25)).toBe(48)
    expect(leadBucket(240)).toBe(240)
  })

  it('rejects hours that were already over and leads past the last bucket', () => {
    expect(leadBucket(-1)).toBeNull()
    expect(leadBucket(241)).toBeNull()
  })
})

describe('ČHMÚ observations', () => {
  const sample = (element: string, minutes: number, value: unknown) => ['0-20000-0-11518', element, new Date((at(10) + minutes * 60) * 1000).toISOString(), value, '', 5]

  it('takes temperature and wind at the full hour and converts wind to km/h', () => {
    const hours = hourlyObservations([sample('T', 0, 12.5), sample('F', 0, 5), sample('T', 10, 99)])
    expect(hours.get(at(10))).toEqual({ temperature: 12.5, wind: 18, rain: null })
  })

  it('sums rain into the hour it ends at, and only with all six samples', () => {
    const complete = hourlyObservations([10, 20, 30, 40, 50, 60].map((minutes) => sample('SRA10M', minutes, 0.1)))
    expect(complete.get(at(11))?.rain).toBeCloseTo(0.6)
    const partial = hourlyObservations([10, 20, 30].map((minutes) => sample('SRA10M', minutes, 0.1)))
    expect(partial.get(at(11))).toBeUndefined()
  })

  it('drops empty and impossible readings', () => {
    const hours = hourlyObservations([sample('T', 0, ''), sample('F', 0, 400)])
    expect(hours.size).toBe(0)
  })
})

describe('forecast rows', () => {
  it('does not count hours past the end of a model as its reach', () => {
    const values = hourlyValues({
      series: [
        {
          id: 'icon_d2',
          weight: 1,
          kind: 'openmeteo',
          data: {
            time: ['2026-07-15T12:00', '2026-07-15T13:00', '2026-07-15T14:00'],
            temperature_2m: [20, 21, null],
            precipitation: [0, 0, null],
            wind_speed_10m: [5, 5, null],
          },
        },
      ],
    })
    expect([...values.values()].map((hour) => hour.temperature)).toEqual([20, 21])
  })


  const values = new Map(
    Array.from({ length: 80 }, (_, hour) => [at(hour), { temperature: hour, wind: 5, rain: 1 }] as const),
  )

  it('keeps nothing before issue and every hour of the first day', () => {
    const rows = forecastRows(values, at(10))
    expect(rows.some((row) => row.valid < at(10))).toBe(false)
    expect(rows.filter((row) => row.valid <= at(34))).toHaveLength(25)
  })

  it('thins long leads to Prague hours divisible by three', () => {
    const rows = forecastRows(values, at(0)).filter((row) => row.valid > at(24))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const pragueHour = Number(new Date(row.valid * 1000).toLocaleString('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', hour12: false }))
      expect(pragueHour % 3).toBe(0)
    }
  })

  it('only totals rain over a window wholly after issue', () => {
    const rows = forecastRows(values, at(10))
    expect(rows.find((row) => row.valid === at(15))?.rain).toBeNull()
    expect(rows.find((row) => row.valid === at(16))?.rain).toBe(6)
  })

  it('refuses a rain total with a gap, so a 3-hourly source is not called dry', () => {
    const coarse = new Map([[at(0), 1], [at(3), 1], [at(6), 1]])
    expect(rainWindowTotal((hour) => coarse.get(hour), at(6))).toBeNull()
  })
})

describe('scoring', () => {
  const key = { dataset: 'live', month: '2026-07', station: 's', source: 'a', bucket: 3 } as const

  it('counts absolute error, bias and hits within the tolerance', () => {
    const sheet: ScoreSheet = new Map()
    addPair(sheet, { ...key, field: 'temperature' }, 22, 20)
    addPair(sheet, { ...key, field: 'temperature' }, 17, 20)
    const stats = statistics([...sheet.values()][0])
    expect(stats.n).toBe(2)
    expect(stats.mae).toBe(2.5)
    expect(stats.bias).toBe(-0.5)
    expect(stats.withinShare).toBe(0.5)
  })

  it('ignores a pair with either side missing', () => {
    const sheet: ScoreSheet = new Map()
    addPair(sheet, { ...key, field: 'wind' }, null, 3)
    addPair(sheet, { ...key, field: 'wind' }, 3, null)
    expect(sheet.size).toBe(0)
  })

  it('scores rain events against a known contingency table', () => {
    const sheet: ScoreSheet = new Map()
    const add = (forecast: number, observed: number, times: number) => {
      for (let i = 0; i < times; i += 1) addPair(sheet, { ...key, field: 'rain' }, forecast, observed)
    }
    add(5, 5, 20)
    add(5, 0, 10)
    add(0, 5, 10)
    add(0, 0, 60)
    const stats = statistics([...sheet.values()][0])
    expect(stats.hitRate).toBeCloseTo(20 / 30)
    expect(stats.falseAlarmRatio).toBeCloseTo(10 / 30)
    expect(stats.frequencyBias).toBe(1)
    const byChance = (30 * 30) / 100
    expect(stats.ets).toBeCloseTo((20 - byChance) / (40 - byChance))
  })

  it('does not trust a rain gauge in the cold', () => {
    const warm = observationsEvery([0, 1, 2, 3, 4, 5], 10, 5, 1)
    expect(observedRainWindow((hour) => warm.get(hour), at(5))).toBe(6)
    const cold = observationsEvery([0, 1, 2, 3, 4, 5], 10, 5, 1)
    cold.set(at(2), { temperature: 1.5, wind: 5, rain: 0 })
    expect(observedRainWindow((hour) => cold.get(hour), at(5))).toBeNull()
  })

  it('has persistence look back only as far as was known at issue', () => {
    expect(persistenceHour(at(100), 0)).toBe(at(100 - 24))
    expect(persistenceHour(at(100), 24)).toBe(at(100 - 24))
    expect(persistenceHour(at(100), 25)).toBe(at(100 - 48))
    expect(persistenceHour(at(100), 168)).toBe(at(100 - 168))
  })
})

describe('verification against the database', () => {
  const setup = () => {
    const db = openBenchmarkDb(':memory:')
    const hours = Array.from({ length: 300 }, (_, hour) => hour)
    saveObservations(db, 's', observationsEvery(hours))
    return db
  }
  const row = (valid: number, temperature: number) => ({ valid, temperature, wind: 10, rain: 0 })

  it('counts each forecast once however often it runs', () => {
    const db = setup()
    inTransaction(db, () => saveForecastRows(db, 's', 'ecmwf_ifs', at(200), [row(at(202), 22)]))
    expect(scoreForecasts(db, at(299))).toBe(1)
    expect(scoreForecasts(db, at(299))).toBe(0)
    const cells = readScores(db, { dataset: 'live', field: 'temperature', station: null, month: null })
    expect(cells.filter((cell) => cell.source === 'ecmwf_ifs')).toHaveLength(1)
    expect(cells[0].n).toBe(1)
    expect(cells[0].sumAbs).toBe(2)
  })

  it('leaves a forecast alone until its hour has been measured and the next hour too', () => {
    const db = setup()
    inTransaction(db, () => saveForecastRows(db, 's', 'gfs', at(299), [row(at(299), 25), row(at(298), 25)]))
    expect(scoreForecasts(db, at(1000))).toBe(1)
  })

  it('scores persistence alongside the consensus snapshot, on the same hours', () => {
    const db = setup()
    inTransaction(db, () => saveForecastRows(db, 's', 'consensus_open', at(200), [row(at(202), 21)]))
    scoreForecasts(db, at(299))
    const cells = readScores(db, { dataset: 'live', field: 'temperature', station: null, month: null })
    const persistence = cells.find((cell) => cell.source === 'persistence')
    expect(persistence?.n).toBe(1)
    expect(persistence?.sumAbs).toBe(0)
  })

  it('deletes scored commercial forecasts, keeps open ones and expires everything old', () => {
    const db = setup()
    inTransaction(db, () => {
      saveForecastRows(db, 's', 'accuweather', at(200), [row(at(202), 22)])
      saveForecastRows(db, 's', 'ecmwf_ifs', at(200), [row(at(202), 22)])
    })
    scoreForecasts(db, at(299))
    pruneForecasts(db, at(299))
    const left = db.prepare('SELECT source FROM forecast').all() as unknown as { source: string }[]
    expect(left.map((entry) => entry.source)).toEqual(['ecmwf_ifs'])
    pruneForecasts(db, at(200) + 61 * 86_400)
    expect((db.prepare('SELECT COUNT(*) AS n FROM forecast').get() as { n: number }).n).toBe(0)
  })

  it('keeps counted scores after the raw forecast is gone', () => {
    const db = setup()
    inTransaction(db, () => saveForecastRows(db, 's', 'accuweather', at(200), [row(at(202), 22)]))
    scoreForecasts(db, at(299))
    pruneForecasts(db, at(299))
    const cells = readScores(db, { dataset: 'live', field: 'temperature', station: null, month: null })
    expect(cells.find((cell) => cell.source === 'accuweather')?.n).toBe(1)
  })
})

describe('report', () => {
  const cell = (station: string, bucket: number, n: number, mae: number, source = 'x'): ScoreCell => ({
    dataset: 'live', month: '2026-07', station, source, field: 'temperature', bucket,
    ...emptyCounts(), n, sumAbs: mae * n,
  })

  it('compares a source only where it was measured', () => {
    // On its one easy station x beats the reference, though the reference's overall MAE looks better.
    const reference = [cell('easy', 3, 100, 1, 'r'), cell('hard', 3, 100, 3, 'r')]
    expect(relativeToReference([cell('easy', 3, 100, 0.9)], reference)).toBeCloseTo(-0.1)
  })

  it('is null without any shared cell', () => {
    expect(relativeToReference([cell('other', 3, 10, 1)], [cell('easy', 3, 10, 1, 'r')])).toBeNull()
  })

  const point = (bucket: number, n: number, mae: number) => ({ bucket, stats: statistics({ ...emptyCounts(), n, sumAbs: mae * n }) })

  it('ends the useful horizon at the first bucket over the limit', () => {
    expect(usefulHorizon('temperature', [point(3, 100, 1), point(24, 100, 1.9), point(48, 100, 2.1), point(72, 100, 1.5)])).toBe(24)
  })

  it('does not claim a horizon it has too little data for', () => {
    expect(usefulHorizon('temperature', [point(3, 100, 1), point(6, 5, 1)])).toBe(3)
    expect(usefulHorizon('temperature', [point(3, 100, 2.5)])).toBe(0)
  })
})

describe('sources the page does not merge', () => {
  const ownSeries = (provider: { id: string; name: string; weight: number }, raw: unknown) => {
    const verified = seriesToVerify(provider, { raw })
    expect(verified?.inConsensus).toBe(false)
    return (verified as NonNullable<typeof verified>).series
  }

  it('keeps a source the page merges in the consensus', () => {
    const verified = seriesToVerify(
      { id: 'yr', name: 'Yr', weight: 3 },
      { raw: { properties: { timeseries: [{ time: '2026-07-15T12:00:00Z', data: { instant: { details: { air_temperature: 20 } }, next_1_hours: { details: { precipitation_amount: 0 } } } }] } } },
    )
    expect(verified?.inConsensus).toBe(true)
  })

  it('has nothing to verify from a source without hours', () => {
    expect(seriesToVerify({ id: 'pocasicz', name: 'Počasí.cz', weight: 1 }, { raw: {} })).toBeNull()
  })

  it('reads Počasí.cz local times and wind in m/s', () => {
    const series = ownSeries(
      { id: 'pocasicz', name: 'Počasí.cz', weight: 1 },
      { entries: [{ localDate: '2026-07-15', localTime: '14:00', temp: 25, wind: 2, precip: 0.5 }, { localDate: '2026-07-15', localTime: '15:00', temp: 26, wind: 3, precip: 0 }] },
    )
    const values = hourlyValues({ series: [series] })
    // 14:00 in Prague in July is 12:00 UTC.
    expect(values.get(Date.UTC(2026, 6, 15, 12) / 1000)).toEqual({ temperature: 25, wind: 7.2, rain: 0.5 })
  })

  it('reads WeatherAPI epochs and km/h', () => {
    const epoch = Date.UTC(2026, 6, 15, 12) / 1000
    const series = ownSeries(
      { id: 'weatherapi', name: 'WeatherAPI', weight: 1 },
      { forecast: { forecastday: [{ hour: [{ time_epoch: epoch, temp_c: 20, wind_kph: 10, precip_mm: 1 }, { time_epoch: epoch + HOUR, temp_c: 21, wind_kph: 11, precip_mm: 0 }] }] } },
    )
    expect(hourlyValues({ series: [series] }).get(epoch)).toEqual({ temperature: 20, wind: 10, rain: 1 })
  })

  it('reads Pirate Weather seconds and m/s', () => {
    const epoch = Date.UTC(2026, 6, 15, 12) / 1000
    const series = ownSeries(
      { id: 'pirateweather', name: 'Pirate', weight: 1 },
      { hourly: { data: [{ time: epoch, temperature: 20, windSpeed: 5, precipIntensity: 0.2 }, { time: epoch + HOUR, temperature: 21, windSpeed: 5, precipIntensity: 0 }] } },
    )
    expect(hourlyValues({ series: [series] }).get(epoch)).toEqual({ temperature: 20, wind: 18, rain: 0.2 })
  })
})

describe('archive', () => {
  const source = { id: 'ecmwf_ifs', weight: 3, model: 'ecmwf_ifs' }
  const second = { id: 'gfs', weight: 1, model: 'gfs_seamless' }

  it('lists finished months only, newest first', () => {
    expect(finishedMonths(Date.UTC(2026, 9, 31), 3)).toEqual(['2026-09', '2026-08', '2026-07'])
    expect(finishedMonths(Date.UTC(2026, 0, 5), 2)).toEqual(['2025-12', '2025-11'])
  })

  it('files each run age under its day, and weighs the consensus by provider weight', () => {
    const iso = (hour: number) => new Date(at(hour) * 1000).toISOString().slice(0, 16)
    const hours = [100, 101]
    const sheet: ScoreSheet = new Map()
    scoreArchivedRuns(
      sheet,
      's',
      {
        hourly: {
          time: hours.map(iso),
          temperature_2m_ecmwf_ifs: [21, 21],
          temperature_2m_gfs_seamless: [23, 23],
          temperature_2m_previous_day2_ecmwf_ifs: [23, 23],
        },
      },
      [source, second],
      observationsEvery(hours, 20),
    )
    const cells = [...sheet.values()].filter((cell) => cell.field === 'temperature')
    expect(cells.find((cell) => cell.source === 'ecmwf_ifs' && cell.bucket === 24)?.sumAbs).toBe(2)
    expect(cells.find((cell) => cell.source === 'ecmwf_ifs' && cell.bucket === 72)?.sumAbs).toBe(6)
    expect(cells.find((cell) => cell.source === 'gfs' && cell.bucket === 72)).toBeUndefined()
    const consensus = cells.find((cell) => cell.source === 'consensus_open' && cell.bucket === 24)
    // With two models at 3:1 the robust mean settles on the heavier one. Equal weights would give 22.
    expect((consensus?.sumAbs ?? 0) / 2).toBe(1)
  })
})

describe('collection slots', () => {
  it('finds the slot just passed and the one ahead, across midnight', () => {
    const now = Date.UTC(2026, 9, 31, 0, 30)
    expect(new Date(latestSlot(now)).toISOString()).toBe('2026-10-30T19:20:00.000Z')
    expect(new Date(nextSlot(now)).toISOString()).toBe('2026-10-31T01:20:00.000Z')
  })
})
