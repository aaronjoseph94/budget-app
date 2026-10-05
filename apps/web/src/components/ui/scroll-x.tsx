import type { ReactNode } from 'react'

/**
 * A box that scrolls sideways when what it holds is wider than the screen,
 * as the Forecast's months and the Habits grid are on a phone. It takes a
 * Tab stop and a name, so a keyboard can reach it and scroll to the columns
 * it hides: Safari, the owner's phone, does not make a scroller focusable
 * by itself, and with nothing focusable inside, the last month could not
 * be reached (axe scrollable-region-focusable, e2e-money-02). A box whose
 * content has its own buttons, as the Month's tables do, needs none.
 */
export function ScrollX({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {children}
    </div>
  )
}
