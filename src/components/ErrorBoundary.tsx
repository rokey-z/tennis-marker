import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Last line of defence: a render error used to unmount everything and leave a white screen,
 * which is the worst possible failure courtside. Show what happened and offer a way out instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash">
        <div className="card">
          <h2>Something broke on this screen</h2>
          <p className="muted">Your sessions and points are safe on this device — nothing was lost.</p>
          <div className="row wrap">
            <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <a className="btn" href="#/" onClick={() => this.setState({ error: null })}>
              Back to sessions
            </a>
            <button type="button" className="btn ghost" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
          <pre className="crash-detail">{error.message}</pre>
        </div>
      </div>
    )
  }
}
