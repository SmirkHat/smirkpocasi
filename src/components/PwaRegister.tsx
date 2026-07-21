import { useEffect } from 'react'

/** Register the service worker on the client only (SSR-safe). Skip in Vite dev — SW caches break HMR. */
export function PwaRegister() {
  useEffect(() => {
    if (import.meta.env.DEV) return undefined

    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
  }, [])

  return null
}
