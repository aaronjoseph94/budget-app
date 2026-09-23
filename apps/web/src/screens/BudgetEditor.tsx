import { useState } from 'react'
import type { PeriodRow } from '@budget/core'
import { parseMoneyInput, useAppData } from '../app-data.js'
import { setBudget } from '../ledger.js'
import { formatCents, formatForInput, formatMonthTitle } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { cn } from '../lib/cn.js'

/**
 * A budget or goal typed where Workbook types it, on the month (Jan!D22:T44,
 * O10:O16, T10:T16). "From this month on" is the default (decision 5): this
 * month and each later one until a month given its own. "Just this month"
 * changes this month alone. Clearing follows the same choice and stores "no
 * budget", never $0. The amount goes through the parser statements use, so
 * "250", "250.5" and "$1,250.00" mean what they mean there; nothing here
 * turns dollars into cents itself. After a save the app's data is refreshed,
 * which re-reads the month, so every figure shown is core's again.
 */
export function BudgetEditor({
  row,
  word,
  month,
  replacesOnly,
  onCancel,
  onSaved,
}: {
  row: PeriodRow
  word: 'Budget' | 'Goal'
  month: string
  replacesOnly: boolean
  onCancel: () => void
  onSaved: (note: string) => void
}) {
  const { supabase, userId, refresh } = useAppData()
  const [text, setText] = useState(formatForInput(row.budgetCents))
  const [applies, setApplies] = useState<'onward' | 'only'>('onward')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lower = word.toLowerCase()
  const monthName = formatMonthTitle(month).split(' ')[0]

  const save = async (clear: boolean) => {
    const cents = clear ? null : parseMoneyInput(text)
    if (!clear && cents === null) {
      setError(`Type the ${lower} as an amount, like 250 or 250.00.`)
      return
    }
    if (cents !== null && cents < 0) {
      setError(`A ${lower} cannot be below zero.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setBudget(supabase, { userId, categoryId: row.categoryId, month, applies, budgetCents: cents, replacesOnly })
      const amount = cents === null ? `no ${lower}` : formatCents(cents)
      onSaved(`${row.name}: ${amount} ${applies === 'onward' ? `from ${monthName} on` : `in ${monthName} only`}.`)
      // Re-reads the categories and, through `version`, the month itself.
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not save this ${lower}. Nothing was saved.`)
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onCancel()
      }}
    >
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          inputMode="decimal"
          inset
          size="sm"
          autoFocus
          aria-label={`${word} for ${row.name} in ${monthName}`}
          placeholder={`No ${lower}`}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <fieldset className="flex flex-wrap gap-2" disabled={busy}>
        <legend className="sr-only">Which months</legend>
        {(['onward', 'only'] as const).map((choice) => (
          <label
            key={choice}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
              applies === choice && 'border-primary bg-primary/10',
            )}
          >
            <input
              type="radio"
              name={`applies-${row.categoryId}`}
              className="accent-primary"
              checked={applies === choice}
              onChange={() => setApplies(choice)}
            />
            {choice === 'onward' ? 'From this month on' : 'Just this month'}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {applies === 'onward'
          ? `${monthName} and every month after it, except a month given its own.`
          : `${monthName} only. Other months keep theirs.`}
      </p>
      {error !== null ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {row.budgetCents === null ? null : (
          <Button variant="outline" size="sm" className="ml-auto" disabled={busy} onClick={() => void save(true)}>
            Clear {lower}
          </Button>
        )}
      </div>
    </form>
  )
}
