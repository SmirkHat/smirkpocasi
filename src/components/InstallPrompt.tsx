import { useEffect, useState } from 'react'
import { HiArrowDownTray, HiXMark } from 'react-icons/hi2'
import { Button } from '@/components/ui/button'
import { hapticLight, hapticMedium } from '@/utils/haptics'

const DISMISS_KEY = 'smirkpocasi:install-dismissed'
const DISMISS_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  if (typeof window === 'undefined') return true
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function isDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < DISMISS_MS
  } catch {
    return false
  }
}

/**
 * Chrome/Edge install affordance. Shows once until dismissed; hidden in standalone.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || isDismissedRecently()) return undefined

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      // Delay so it doesn't fight first-paint / permission dialogs.
      window.setTimeout(() => setVisible(true), 4000)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!visible || !deferred) return null

  async function install() {
    hapticMedium()
    await deferred.prompt()
    const choice = await deferred.userChoice
    setVisible(false)
    setDeferred(null)
    if (choice.outcome === 'dismissed') {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch {
        // ignore
      }
    }
  }

  function dismiss() {
    hapticLight()
    setVisible(false)
    setDeferred(null)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 lg:px-8">
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/70 px-3.5 py-3 backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Přidat na plochu</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            SmirkPočasí jako aplikace — rychlejší start, fullscreen bez prohlížeče.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void install()}>
              <HiArrowDownTray aria-hidden="true" />
              Nainstalovat
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
              Teď ne
            </Button>
          </div>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Zavřít"
          className="shrink-0"
          onClick={dismiss}
        >
          <HiXMark aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
