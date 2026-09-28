import { useEffect, useId, useRef, useState } from 'react'
import { parseMoneyInput, useAppData } from '../app-data.js'
import { setMonthBalance } from '../ledger.js'
import { formatCents, formatForInput, formatMonthName } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input, refusal } from '../components/ui/form.js'

/**
 * The bank balance a month started with, typed where the workbook types it (Jan!D9,
 * note: "Type in the Bank Balance you started the month with!"), once a
 * month (decision 6). It is that month's alone: nothing is copied into the
 * next, whose start is what the bank shows then, not this month's projection.
 *
 * The amount goes through the parser statements use, so "2400", "2,400.5"
 * and "$2,400.00" mean what they mean there. An iPhone's number pad has no
 * minus key, so an overdrawn start is said with a tick box, which puts a
 * minus sign in front of the text for the parser to read; nothing here
 * turns dollars into cents or changes a sign itself. Clearing removes the
 * balance, and the month then has no ending balance (D17). After a save the
 * app's data is refreshed, which re-reads the month. A refusal that answers
 * once the editor has closed (another month opened while it saved) is handed
 * to `onFailedAfterClose`, so it is never lost.
 */
export function StartEditor({
  month,
  start,
  onCancel,
  autoFocus = true,
  onSaved,
  onFailedAfterClose,
}: {
  /** The month's first day. */
  month: string
  start: number | null
  /** The Month's Cancel; Getting started, which holds the editor open, has none. */
  onCancel?: () => void
  /** On the Month the editor opens on a tap, so it takes the keyboard; on Getting started it waits for one. */
  autoFocus?: boolean
  onSaved: (note: string) => void
  onFailedAfterClose: (message: string) => void
}) {
  const { supabase, userId, refresh } = useAppData()
  const shown = formatForInput(start)
  const [text, setText] = useState(shown.replace(/^-/, ''))
  const [overdrawn, setOverdrawn] = useState(shown.startsWith('-'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const monthName = formatMonthName(month)
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  const save = async (clear: boolean) => {
    const cents = clear ? null : parseMoneyInput(overdrawn ? `-${text.trim()}` : text)
    if (!clear && cents === null) {
      setError('Type the balance as an amount, like 2400 or 2,400.00.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setMonthBalance(supabase, { userId, month, startingBalanceCents: cents })
      onSaved(cents === null ? `${monthName}'s starting balance is cleared.` : `${monthName} started at ${formatCents(cents)}.`)
      // Re-reads the categories and, through `version`, the month itself.
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the starting balance. Nothing was saved.'
      if (!open.current) {
        onFailedAfterClose(`${monthName}: ${message}`)
        return
      }
      setError(message)
      setBusy(false)
    }
  }

  return (
    <form
      className="mt-4 space-y-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onCancel?.()
      }}
    >
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          inputMode="decimal"
          inset
          size="sm"
          autoFocus={autoFocus}
          aria-label={`Starting bank balance for ${monthName}`}
          {...refusal(errorId, error !== null)}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary"
          checked={overdrawn}
          disabled={busy}
          onChange={(e) => setOverdrawn(e.target.checked)}
        />
        Overdrawn: the account was below $0
      </label>
      <p className="text-xs text-summary-label">
        The bank balance you started {monthName} with. Each month has its own.
      </p>
      {error !== null ? (
        <Alert tone="error" id={errorId}>
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {onCancel === undefined ? null : (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
        {start === null ? null : (
          <Button variant="outline" size="sm" className="ml-auto" disabled={busy} onClick={() => void save(true)}>
            Clear balance
          </Button>
        )}
      </div>
    </form>
  )
}
