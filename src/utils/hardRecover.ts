/** Hard recovery after stale Vite/TanStack dynamic imports or a bad service worker. */
export async function hardRecoverApp(reason = 'recover') {
  try {
    sessionStorage.removeItem('smirkpocasi:chunk-reload')
  } catch {
    // ignore
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    }
  } catch {
    // ignore
  }

  const url = new URL(window.location.href)
  url.searchParams.set('_recover', `${reason}-${Date.now()}`)
  window.location.replace(url.toString())
}

export function isStaleChunkError(error: Error | null | undefined) {
  const message = error?.message || ''
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Failed to load module script')
  )
}
