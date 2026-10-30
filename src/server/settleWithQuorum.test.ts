import { describe, expect, it } from 'vitest'
import { settleWithQuorum } from './settleWithQuorum'

function after(ms: number, onDone: () => void = () => {}) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      onDone()
      resolve()
    }, ms)
  })
}

describe('settleWithQuorum', () => {
  it('returns immediately when every task is already done', async () => {
    const started = Date.now()
    await settleWithQuorum([Promise.resolve(), after(5)], () => false, 500)
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('does not wait for a straggler once past the deadline with a quorum', async () => {
    let answered = 0
    const started = Date.now()
    await settleWithQuorum(
      [after(5, () => (answered += 1)), after(5, () => (answered += 1)), after(2000)],
      () => answered >= 2,
      50,
    )
    expect(Date.now() - started).toBeLessThan(500)
    expect(answered).toBe(2)
  })

  it('keeps waiting past the deadline until the quorum arrives', async () => {
    let answered = 0
    const started = Date.now()
    await settleWithQuorum(
      [after(5, () => (answered += 1)), after(150, () => (answered += 1)), after(2000)],
      () => answered >= 2,
      20,
    )
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(140)
    expect(elapsed).toBeLessThan(800)
  })

  it('waits for every task when the quorum is never reached', async () => {
    const started = Date.now()
    await settleWithQuorum([after(5), after(120)], () => false, 20)
    expect(Date.now() - started).toBeGreaterThanOrEqual(110)
  })
})
