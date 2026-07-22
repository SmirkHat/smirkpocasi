import { useEffect, useRef, useState } from 'react'
import { hapticSuccess } from '@/utils/haptics'

const PULL_THRESHOLD = 72

/**
 * Custom pull-to-refresh for pages with overscroll-behavior: none.
 * Only arms when the document is scrolled to the top.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<void>, enabled = true) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined

    const onStart = (event: TouchEvent) => {
      if (refreshingRef.current) return
      if (window.scrollY > 2) return
      startY.current = event.touches[0]?.clientY ?? 0
      pulling.current = true
    }

    const onMove = (event: TouchEvent) => {
      if (!pulling.current || refreshingRef.current) return
      if (window.scrollY > 2) {
        pulling.current = false
        pullRef.current = 0
        setPull(0)
        return
      }
      const y = event.touches[0]?.clientY ?? 0
      const delta = y - startY.current
      if (delta <= 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      const resisted = Math.min(delta * 0.45, 120)
      pullRef.current = resisted
      setPull(resisted)
      if (resisted > 8) event.preventDefault()
    }

    const onEnd = () => {
      if (!pulling.current) return
      pulling.current = false
      const amount = pullRef.current
      pullRef.current = 0
      setPull(0)
      if (amount < PULL_THRESHOLD || refreshingRef.current) return

      refreshingRef.current = true
      setRefreshing(true)
      void Promise.resolve(onRefreshRef.current())
        .then(() => hapticSuccess())
        .finally(() => {
          refreshingRef.current = false
          setRefreshing(false)
        })
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)

    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  return { pull, refreshing, threshold: PULL_THRESHOLD }
}

export function PullToRefreshIndicator({
  pull,
  refreshing,
  threshold,
}: {
  pull: number
  refreshing: boolean
  threshold: number
}) {
  const progress = Math.min(pull / threshold, 1)
  const show = refreshing || pull > 6

  if (!show) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))]"
      style={{ opacity: refreshing ? 1 : progress }}
    >
      <div className="rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-md">
        {refreshing ? 'Aktualizuji…' : progress >= 1 ? 'Pusť pro obnovení' : 'Stáhni dolů'}
      </div>
    </div>
  )
}
