/** Runs tasks with at most `max` in flight, in the order they were asked for. */
export function createParallelLimit(max: number) {
  let running = 0
  const waiting: Array<() => void> = []

  return async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (running < max) running += 1
    else await new Promise<void>((resolve) => waiting.push(resolve))

    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else running -= 1
    }
  }
}
