import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CrashScreen } from './StatusScreen'
import { hardRecoverApp, isStaleChunkError } from '../utils/hardRecover'

type Props = { children: ReactNode }
type State = { error: Error | null; recovering: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovering: false }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)

    if (typeof window === 'undefined' || !isStaleChunkError(error)) return

    const key = 'smirkpocasi:chunk-reload'
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // ignore quota / private mode
    }

    this.setState({ recovering: true })
    void hardRecoverApp('chunk')
  }

  componentDidMount() {
    if (typeof window === 'undefined') return
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has('_recover')) {
        url.searchParams.delete('_recover')
        window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      }
      sessionStorage.removeItem('smirkpocasi:chunk-reload')
    } catch {
      // ignore
    }
  }

  render() {
    if (this.state.recovering) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-app px-4 text-sm text-muted-foreground">
          Obnovuji aplikaci…
        </div>
      )
    }

    if (this.state.error) {
      return <CrashScreen error={this.state.error} />
    }

    return this.props.children
  }
}

export default ErrorBoundary
