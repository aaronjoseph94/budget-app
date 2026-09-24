import { useEffect, useRef, useState } from 'react'
import type { PeriodRow } from '@budget/core'
import { readBudgetInput, useAppData } from '../app-data.js'
import { setWeeklyBudget } from '../ledger.js'
import { formatCents, formatForInput } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'

/**
 * A weekly budget or goal, typed on the Week as the workbook types one on its
 * Weekly Budget tab (D22:W44, Q10:Q16, W10:W16). It is one amount for every
 * week (`categories.weekly_budget_cents`), as the workbook's tab keeps one set, so
 * there is no "which weeks" choice as the Month's editor has. Clearing
 * stores no budget, never $0. The amount goes through the parser statements
 * use, and after a save the app's data is refreshed, which re-reads the
 * week, so every figure shown is core's again. A refusal that answers once
 * the editor has closed is handed to `onFailedAfterClose`, as on the Month.
 */
export function WeekBudgetEditor({
  row,
  word,
  onCancel,
  onSaved,
  onFailedAfterClose,
}: {
  row: PeriodRow
  word: 'Budget' | 'Goal'
  onCancel: () => void
  onSaved: (note: string) => void
  onFailedAfterClose: (message: string) => void
}) {
  const { supabase, refresh } = useAppData()
  const [text, setText] = useState(formatForInput(row.budgetCents))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lower = word.toLowerCase()
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  const save = async (clear: boolean) => {
    const typed = clear ? null : readBudgetInput(text, lower)
    if (typed !== null && 'problem' in typed) {
      setError(typed.problem)
      return
    }
    const cents = typed === null ? null : typed.cents
    setBusy(true)
    setError(null)
    try {
      await setWeeklyBudget(supabase, row.categoryId, cents)
      onSaved(`${row.name}: ${cents === null ? `no ${lower}` : formatCents(cents)} every week.`)
      // Re-reads the categories, which carry the weekly budgets, and the week.
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `Could not save this ${lower}. Nothing was saved.`
      if (!open.current) {
        onFailedAfterClose(`${row.name}, weekly ${lower}: ${message}`)
        return
      }
      setError(message)
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
          aria-label={`Weekly ${lower} for ${row.name}`}
          placeholder={`No ${lower}`}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">The same {lower} every week, until you change it.</p>
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
