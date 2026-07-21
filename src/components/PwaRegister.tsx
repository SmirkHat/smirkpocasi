import { useEffect } from 'react'

/** Register the service worker on the client only (SSR-safe). */
export function PwaRegister() {
  useEffect(() => {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
  }, [])

  return null
}
