import { useEffect, useRef, useState } from 'react'
import { parseMoneyInput, useAppData } from '../app-data.js'
import { removeDebtExtra, saveDebtExtra, type DebtExtraRow, type DebtRow } from '../ledger.js'
import { formatCents, formatMonthTitle, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input } from '../components/ui/form.js'

/**
 * A debt's one-off Extra Payments, each in the month it is paid (Debt
 * Calculator!I26:I494; I26's note: "Add any Extra Payments to this
 * column"). One a month, as the workbook has one cell: adding to a month that
 * has one replaces its amount. After each write the app's data is
 * refreshed, which re-reads the debts, so the payoff month moves at once.
 * A write refused after the sheet has closed is handed to
 * `onFailedAfterClose`, as the debt's own save is, so it is never lost.
 */
export function DebtExtras({
  row,
  extras,
  onFailedAfterClose,
}: {
  row: DebtRow
  extras: readonly DebtExtraRow[]
  onFailedAfterClose: (message: string) => void
}) {
  const { supabase, userId, refresh } = useAppData()
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  /** `what` names the write in a message shown after the sheet has closed. */
  const write = async (action: () => Promise<void>, what: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the extra payment. Nothing was saved.'
      // Dropped here once, while every other editor handed it on (CR-4).
      if (open.current) setError(message)
      else onFailedAfterClose(`${row.name}, ${what}: ${message}`)
    } finally {
      if (open.current) setBusy(false)
    }
  }

  const add = () => {
    const amountCents = parseMoneyInput(amount)
    if (amountCents === null || amountCents <= 0) return setError('Type the extra payment as an amount above zero, like 50.')
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Choose the month you pay it in.')
    if (`${month}-01` < row.start_date) {
      return setError(`An extra payment cannot come before ${formatMonthTitle(row.start_date)}, when this debt starts.`)
    }
    void write(async () => {
      await saveDebtExtra(supabase, { userId, debtId: row.id, month: `${month}-01`, amountCents })
      if (open.current) setAmount('')
    }, `extra payment for ${formatMonthTitle(`${month}-01`)}`)
  }

  return (
    <section aria-label="Extra payments" className="space-y-3 border-t p-4">
      <h3 className="text-sm font-semibold">Extra payments</h3>
      <p className="text-xs">A one-off payment on top of the minimum, in the month you make it.</p>
      <ul className="space-y-1 text-sm">
        {extras.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <span>{formatMonthTitle(e.month)}</span>
            <span className="tnum ml-auto">{formatCents(e.amount_cents)}</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void write(() => removeDebtExtra(supabase, e.id), `removing the extra payment for ${formatMonthTitle(e.month)}`)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <Field label="Month">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Extra ($)">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Button variant="outline" disabled={busy} onClick={add}>
          Add
        </Button>
      </div>
      {error !== null ? <Alert tone="error">{error}</Alert> : null}
    </section>
  )
}
