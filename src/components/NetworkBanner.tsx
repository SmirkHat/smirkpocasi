import { useEffect, useState } from 'react'
import { HiWifi } from 'react-icons/hi2'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/**
 * Sticky strip when the device loses network. Stays quiet while online.
 */
export function NetworkBanner() {
  const online = useOnlineStatus()
  const [wasOffline, setWasOffline] = useState(false)
  const [showBack, setShowBack] = useState(false)

  useEffect(() => {
    if (!online) {
      setWasOffline(true)
      setShowBack(false)
      return undefined
    }
    if (!wasOffline) return undefined
    setShowBack(true)
    const id = window.setTimeout(() => setShowBack(false), 2500)
    return () => window.clearTimeout(id)
  }, [online, wasOffline])

  if (!online) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 lg:px-8">
        <Alert variant="warning">
          <HiWifi aria-hidden="true" />
          <AlertTitle>Jste offline</AlertTitle>
          <AlertDescription>Zobrazuji cache. Po obnovení sítě se data znovu načtou.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (showBack) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 lg:px-8">
        <Alert variant="success">
          <HiWifi aria-hidden="true" />
          <AlertTitle>Zpět online</AlertTitle>
          <AlertDescription>Připojení je obnovené.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return null
}
