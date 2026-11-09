import { Component, type ReactNode } from 'react'

/**
 * Keeps an optional panel's failure to itself (plan §3.10): an engine
 * error, or a chunk that did not load, draws `fallback` (nothing, by
 * default) in the panel's place, and the screen around it still shows.
 * A class, because React catches a render error only in one. Keyed by what
 * it shows, so a new month tries again; or given `retryOn`, it tries again
 * when that changes, without drawing a healthy child anew.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; retryOn?: unknown }, { failed: boolean }> {
  override state = { failed: false }

  override componentDidUpdate(before: { retryOn?: unknown }): void {
    if (this.state.failed && before.retryOn !== this.props.retryOn) this.setState({ failed: false })
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
