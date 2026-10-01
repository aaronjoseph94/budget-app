import { IngestedText } from '../ui.js'
import { Card } from '../components/ui/card.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'

export interface ApproveItem {
  readonly id: string
  /** The shop as the statement printed it: drawn as text, never markup. */
  readonly shop: string
  readonly category: string
  /** The AI suggested the category and the owner has not changed it. */
  readonly byAi: boolean
}

/** Approve these N, on the title row: it only opens the question below. */
export function ApproveAllButton({ n, busy, onOpen }: { n: number; busy: boolean; onOpen: () => void }) {
  return (
    <Button size="tall" disabled={busy} onClick={onOpen}>
      Approve these {n}
    </Button>
  )
}

/**
 * Approve these N (plan §2.8, §3.9; ADR 0008), once asked: every row it
 * will file, each with the category it goes under, and one question.
 * Nothing is approved until **Approve all N** is tapped, and then each row
 * is approved on its own, as a tap on its Approve would.
 */
export function ApproveAll({ items, busy, onConfirm, onCancel }: {
  items: readonly ApproveItem[]
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const n = items.length
  return (
    <Card className="p-4 md:px-5" role="group" aria-labelledby="approve-all-title">
      <h2 id="approve-all-title" className="font-medium">
        Approve these {n}?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Each goes into your budget under the category shown. Change any row below first if it is wrong.</p>
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 justify-between gap-3">
            <span className="min-w-0 truncate" title={item.shop}>
              <IngestedText>{item.shop}</IngestedText>
            </span>
            <span className="max-w-[45%] min-w-0 truncate text-right text-muted-foreground" title={item.category}>
              {item.byAi ? (
                <>
                  <Icon name="sparkles" aria-hidden="true" className="mr-1 inline size-3.5 align-[-0.125em] text-primary" />
                  <span className="sr-only">Suggested by AI: </span>
                </>
              ) : null}
              {item.category}
            </span>
          </li>
        ))}
      </ul>
      {items.some((item) => item.byAi) ? (
        <p className="mt-3 text-sm text-muted-foreground">✨ marks a category the AI suggested. Check it.</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={onConfirm}>
          Approve all {n}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
