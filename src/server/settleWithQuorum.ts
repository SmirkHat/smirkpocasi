/**
 * Resolves when every task has finished, or as soon as the soft deadline has passed and
 * `hasQuorum` holds. Tasks must not reject. Unfinished tasks keep running in the background.
 */
export function settleWithQuorum(
  tasks: Promise<unknown>[],
  hasQuorum: () => boolean,
  softDeadlineMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    let pastDeadline = false
    const check = () => {
      if (pastDeadline && hasQuorum()) resolve()
    }
    const timer = setTimeout(() => {
      pastDeadline = true
      check()
    }, softDeadlineMs)

    tasks.forEach((task) => task.then(check))
    Promise.all(tasks).then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}
