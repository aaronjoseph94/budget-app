import type { RefObject } from 'react'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'

/**
 * All nine done (plan §8.1): a small paper plane flies across, and the
 * Coach is one tap away. Under reduced motion the plane sits still
 * (index.css), and the words say the same.
 */
export function Finish({ headingRef }: { headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section aria-labelledby="start-finish" className="space-y-4 overflow-hidden rounded-xl border bg-card p-5 text-center">
      <div aria-hidden="true" className="flex justify-center py-2">
        <Icon name="plane" className="start-fly size-12 text-primary" />
      </div>
      <h2 id="start-finish" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        Your coach is ready
      </h2>
      <p className="text-base text-muted-foreground">
        Everything is set up. The Coach reads your month each day and says what changed, what to trim and how your goals are coming along.
      </p>
      <Button size="lg" onClick={() => navigate('coach')}>
        Open the Coach
      </Button>
    </section>
  )
}
