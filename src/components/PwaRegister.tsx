import { useEffect } from 'react'

/** Client-only extras. SW registration lives in __root.tsx head (PWABuilder-visible). */
export function PwaRegister() {
  useEffect(() => {
    // iOS Safari: block multi-finger page zoom gestures (viewport meta covers most cases).
    const blockGesture = (event: Event) => event.preventDefault()
    document.addEventListener('gesturestart', blockGesture, { passive: false })
    document.addEventListener('gesturechange', blockGesture, { passive: false })

    return () => {
      document.removeEventListener('gesturestart', blockGesture)
      document.removeEventListener('gesturechange', blockGesture)
    }
  }, [])

  return null
}
