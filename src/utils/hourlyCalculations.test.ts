import { describe, expect, it } from 'vitest'
import { buildMergedForecastDays } from './hourlyForecast'
import { robustAggregate, robustAggregateDetails, robustMean, weightedCircularMean, weightedMean } from './robustAggregate'

function series(id: string, values: Record<string, number>, weight = 1) {
  const data = { time: ['2026-10-30T12:00'], ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [value]])) }
  return { id, name: id.toUpperCase(), weight, kind: 'openmeteo', data }
}

function firstHour(forecastSeries: ReturnType<typeof series>[]) {
  const { days } = buildMergedForecastDays({ forecastSeries })
  return days[0].hours[0]
}

describe('robustAggregateDetails', () => {
  const entries = [10, 11, 12, 11, 40].map((value, index) => ({ value, weight: 1, id: index }))

  it('gives the same answer as the plain consensus', () => {
    const options = { tolerance: 4, limits: [-70, 60] as [number, number] }
    expect(robustAggregateDetails(entries, options).value).toBe(robustAggregate(entries, options))
    expect(robustAggregateDetails(entries, { ...options, mean: true }).value).toBe(
      robustAggregate(entries, { ...options, mean: true }),
    )
  })

  it('names what it left out and why', () => {
    const details = robustAggregateDetails([...entries, { value: 500, weight: 1, id: 5 }], {
      tolerance: 4,
      limits: [-70, 60],
    })
    expect(details.kept.map((entry) => entry.value)).toEqual([10, 11, 12, 11])
    expect(details.rejected).toEqual([
      { entry: expect.objectContaining({ value: 500 }), reason: 'invalid' },
      { entry: expect.objectContaining({ value: 40 }), reason: 'outlier' },
    ])
  })
})

describe('a model past the end of its range', () => {
  const series = (id: string, temperature: (number | null)[], precipitation: (number | null)[], code: (number | null)[]) => ({
    id,
    name: id,
    weight: 1,
    kind: 'openmeteo',
    data: {
      time: ['2026-07-15T12:00', '2026-07-15T13:00'],
      temperature_2m: temperature,
      precipitation,
      precipitation_probability: precipitation.map((value) => (value === null ? null : 80)),
      wind_speed_10m: temperature.map((value) => (value === null ? null : 10)),
      weather_code: code,
    },
  })

  it('adds nothing to the merged hour, instead of 0 °C and no rain', () => {
    const { days } = buildMergedForecastDays({
      forecastSeries: [series('long', [30, 30], [2, 2], [61, 61]), series('short', [30, null], [2, null], [61, null])],
    })
    expect(days[0].hours[1]).toMatchObject({ temperature: 30, precipMm: 2, precipProb: 80, windSpeed: 10, weatherCode: 61 })
  })
})

describe('hourly calculation audit', () => {
  const forecastSeries = [
    series('a', { temperature_2m: 10, precipitation: 0, wind_speed_10m: 10, wind_direction_10m: 90 }),
    series('b', { temperature_2m: 11, precipitation: 2, wind_speed_10m: 20, wind_direction_10m: 100 }, 2),
    series('c', { temperature_2m: 12, precipitation: 0, wind_speed_10m: 30, wind_direction_10m: 110 }),
    series('d', { temperature_2m: 11, precipitation: 0, wind_speed_10m: 20, wind_direction_10m: 100 }),
    series('e', { temperature_2m: 40, precipitation: 1, wind_speed_10m: 20, wind_direction_10m: 95 }),
  ]

  it('reports exactly the numbers the chart plots', () => {
    const hour = firstHour(forecastSeries)
    const calculations = hour.calculations()
    expect(calculations.temperature.result).toBe(hour.temperature)
    expect(calculations.precipMm.result).toBe(hour.precipMm)
    expect(calculations.windSpeed.result).toBe(hour.windSpeed)
    expect(calculations.windDirection.result).toBe(hour.windDirection)
  })

  it('names the method each field really uses', () => {
    const calculations = firstHour(forecastSeries).calculations()
    expect(calculations.temperature.method).toBe('robust-mean')
    expect(calculations.windSpeed.method).toBe('robust-mean')
    expect(calculations.precipMm.method).toBe('weighted-mean')
    expect(calculations.precipProb.method).toBe('weighted-mean')
    expect(calculations.windDirection.method).toBe('circular-mean')
  })

  it('recomputes the result from the included inputs alone', () => {
    const calculations = firstHour(forecastSeries).calculations()
    const included = (key: keyof typeof calculations) => calculations[key].inputs.filter((input) => input.included)
    expect(calculations.temperature.result).toBeCloseTo(robustMean(included('temperature')) as number)
    expect(calculations.precipMm.result).toBeCloseTo(weightedMean(included('precipMm')) as number)
    expect(calculations.windDirection.result).toBeCloseTo(weightedCircularMean(included('windDirection')) as number)
  })

  it('marks the outlier, and keeps it visible with its reason', () => {
    const calculations = firstHour(forecastSeries).calculations()
    const outlier = calculations.temperature.inputs.find((input) => input.source === 'e')
    expect(outlier).toMatchObject({ value: 40, included: false, exclusionReason: 'outlier' })
    expect(calculations.temperature.inputs.filter((input) => input.included)).toHaveLength(4)
  })

  it('shows wind direction weights scaled by wind speed, as the calculation uses them', () => {
    const calculations = firstHour(forecastSeries).calculations()
    expect(calculations.windDirection.inputs.find((input) => input.source === 'c')?.weight).toBe(30)
    expect(calculations.windDirection.inputs.find((input) => input.source === 'b')?.weight).toBe(40)
  })
})
