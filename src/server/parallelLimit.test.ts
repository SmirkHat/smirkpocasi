import { describe, expect, it } from 'vitest'
import { createParallelLimit } from './parallelLimit'

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe('createParallelLimit', () => {
  it('never runs more than the limit and still finishes everything', async () => {
    const limited = createParallelLimit(3)
    let running = 0
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        limited(async () => {
          running += 1
          peak = Math.max(peak, running)
          await tick()
          running -= 1
          return index
        }),
      ),
    )
    expect(peak).toBe(3)
    expect(results).toEqual(Array.from({ length: 20 }, (_, index) => index))
  })

  it('frees the slot when a task fails', async () => {
    const limited = createParallelLimit(1)
    await expect(limited(() => Promise.reject(new Error('upstream')))).rejects.toThrow('upstream')
    await expect(limited(async () => 'next')).resolves.toBe('next')
  })

  it('starts waiting tasks in the order they asked', async () => {
    const limited = createParallelLimit(1)
    const order: number[] = []
    await Promise.all(
      [1, 2, 3].map((value) =>
        limited(async () => {
          await tick()
          order.push(value)
        }),
      ),
    )
    expect(order).toEqual([1, 2, 3])
  })
})
