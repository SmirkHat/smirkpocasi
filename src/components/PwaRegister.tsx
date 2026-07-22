import { useEffect } from 'react'

/** Register the service worker on the client only (SSR-safe). Skip in Vite dev — SW caches break HMR. */
export function PwaRegister() {
  useEffect(() => {
    // iOS Safari: block multi-finger page zoom gestures (viewport meta covers most cases).
    const blockGesture = (event: Event) => event.preventDefault()
    document.addEventListener('gesturestart', blockGesture, { passive: false })
    document.addEventListener('gesturechange', blockGesture, { passive: false })

    // vite-plugin-pwa also injects a register script (injectRegister: 'script').
    // Keep this path for autoUpdate + immediate claim when the module is available.
    if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
      void import('virtual:pwa-register').then(({ registerSW }) => {
        registerSW({ immediate: true })
      })
    }

    return () => {
      document.removeEventListener('gesturestart', blockGesture)
      document.removeEventListener('gesturechange', blockGesture)
    }
  }, [])

  return null
}
