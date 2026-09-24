import { Component, type ReactNode } from 'react'

/**
 * Keeps an optional panel's failure to itself (plan §3.10): an engine
 * error, or a chunk that did not load, draws `fallback` (nothing, by
 * default) in the panel's place, and the screen around it still shows.
 * A class, because React catches a render error only in one. Keyed by what
 * it shows, so a new month tries again.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
