import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error">
          <h1>Aplikace spadla</h1>
          <p>
            Zkus obnovit stránku. Pokud problém zůstane, smaž lokální cache přes{' '}
            <a href="/clear-sw.html">reset cache</a>.
          </p>
          <pre>{this.state.error.message}</pre>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
