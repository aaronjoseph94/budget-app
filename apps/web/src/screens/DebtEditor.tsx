import { useState } from 'react'
import { parseMoneyInput, parsePercentInput, tooLargeInput, useAppData } from '../app-data.js'
import { removeDebt, saveDebt, type DebtExtraRow, type DebtRow } from '../ledger.js'
import { formatForInput, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input } from '../components/ui/form.js'
import { Sheet } from '../components/ui/sheet.js'
import { DebtExtras } from './DebtExtras.js'
import { useStillOpen } from '../lib/still-open.js'

/**
 * A debt, typed where the workbook types it: its Starting Balance, Minimum Payment
 * and APR (Debt Calculator!J18:J20, with their cell notes as hints), the
 * month the balance is as of (D6, per debt in 0014), and below them its
 * extra payments (DebtExtras). A month is typed as a month, and stored as
 * its first day, as 0014 requires. The screen refuses what 0014 would
 * before sending; a refusal that answers once the sheet has closed is
 * handed to `onFailedAfterClose`, so it is never lost.
 */
export function DebtEditor({
  row,
  extras,
  sortOrder,
  onClose,
  onSaved,
  onFailedAfterClose,
}: {
  /** The debt, or null to add one. */
  row: DebtRow | null
  /** Its extra payments, oldest first. */
  extras: readonly DebtExtraRow[]
  /** Where a new debt goes: the end of the list. */
  sortOrder: number
  onClose: () => void
  onSaved: (note: string) => void
  onFailedAfterClose: (message: string) => void
}) {
  const { supabase, userId, refresh } = useAppData()
  const [name, setName] = useState(row?.name ?? '')
  const [balance, setBalance] = useState(formatForInput(row?.starting_balance_cents ?? null))
  const [minimum, setMinimum] = useState(formatForInput(row?.minimum_payment_cents ?? null))
  const [apr, setApr] = useState(formatForInput(row?.apr_basis_points ?? null))
  const [start, setStart] = useState((row?.start_date ?? todayIso()).slice(0, 7))
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useStillOpen()

  /** Run a write; on success close and refresh, on failure say why where it can be read. */
  const write = async (action: () => Promise<void>, done: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved(done)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the debt. Nothing was saved.'
      if (!open.current) {
        onFailedAfterClose(`${name.trim()}: ${message}`)
        return
      }
      setError(message)
      setBusy(false)
    }
  }

  const submit = () => {
    const startingBalanceCents = parseMoneyInput(balance)
    const minimumPaymentCents = parseMoneyInput(minimum)
    const aprBasisPoints = apr.trim() === '' ? parsePercentInput('0') : parsePercentInput(apr)
    const startMonth = `${start}-01`
    if (name.trim() === '') return setError('Give the debt a name.')
    if (startingBalanceCents === null || startingBalanceCents < 0) return setError(tooLargeInput(balance) ?? 'Type the balance as an amount, like 3000 or 3,000.00.')
    if (minimumPaymentCents === null || minimumPaymentCents < 0) return setError(tooLargeInput(minimum) ?? 'Type the minimum payment as an amount, like 150.')
    if (aprBasisPoints === null || aprBasisPoints < 0) return setError('Type the APR as a percentage, like 19.99, or leave it empty for 0%.')
    if (!/^\d{4}-\d{2}$/.test(start)) return setError('Choose the month the balance is as of.')
    if (extras.some((e) => e.month < startMonth)) {
      return setError('This debt has extra payments before that month. Remove them first, or choose an earlier month.')
    }
    const edit = { name: name.trim(), startingBalanceCents, minimumPaymentCents, aprBasisPoints, startMonth }
    void write(() => saveDebt(supabase, { userId, debtId: row?.id ?? null, sortOrder }, edit), `${edit.name} is saved.`)
  }

  return (
    <Sheet title={row === null ? 'Add a debt' : row.name} onClose={onClose}>
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {/* The notes on Debt Calculator!J18, J19 and J20. */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <Field label="Starting balance ($)" hint="As of the month beside it; an estimate is fine.">
            <Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </Field>
          <Field label="As of" hint="The month you start paying it down.">
            <Input type="month" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Minimum payment ($)" hint="From your statement.">
            <Input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
          </Field>
          <Field label="APR (%)" hint="The yearly interest rate.">
            <Input inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} />
          </Field>
        </div>
        {error !== null ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex flex-wrap justify-end gap-2">
          {row === null ? null : removing ? (
            <Button variant="outline" disabled={busy} onClick={() => void write(() => removeDebt(supabase, row.id), `${row.name} is removed.`)}>
              Remove {row.name} and its extras
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setRemoving(true)}>
              Remove…
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save debt'}
          </Button>
        </div>
      </form>
      {row === null ? null : <DebtExtras row={row} extras={extras} onFailedAfterClose={onFailedAfterClose} />}
    </Sheet>
  )
}
