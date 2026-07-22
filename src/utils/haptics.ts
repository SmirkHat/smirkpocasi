/** Light device feedback where Vibration API exists (mostly Android). */

export function hapticLight() {
  try {
    navigator.vibrate?.(10)
  } catch {
    // ignore
  }
}

export function hapticMedium() {
  try {
    navigator.vibrate?.(20)
  } catch {
    // ignore
  }
}

export function hapticSuccess() {
  try {
    navigator.vibrate?.([12, 40, 12])
  } catch {
    // ignore
  }
}
