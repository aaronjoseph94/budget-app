import { Suspense, type ReactNode } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import type { Screen } from '../nav.js'

/** What shows where a screen could not load or draw, with the one thing to do. */
function ScreenFailed() {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <Alert tone="error">This screen did not load. Check your connection, then reload.</Alert>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  )
}

/**
 * Holds one screen: "Loading…" while its chunk arrives, and a note with a
 * Reload button if the chunk does not arrive or the screen throws, where
 * either once unmounted the whole app to a blank page (FE-1). Keyed by the
 * screen, so moving to another screen tries again.
 */
export function ScreenBoundary({ screen, children }: { screen: Screen; children: ReactNode }) {
  return (
    <ErrorBoundary key={screen} fallback={<ScreenFailed />}>
      <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}>{children}</Suspense>
    </ErrorBoundary>
  )
}
