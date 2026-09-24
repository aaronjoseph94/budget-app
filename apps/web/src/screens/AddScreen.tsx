import { useEffect, useId, useRef, useState } from 'react'
import { applySignConvention, type AcceptedRow } from '@budget/statement-parsers'
import { isoDate } from '@budget/core'
import { parseMoneyInput, useAppData } from '../app-data.js'
import { addTypedTransaction, ensureCategory, saveImport } from '../ledger.js'
import { ImportScreen, type SaveRequest } from '../ImportScreen.js'
import { readStatementPdf, type PdfImport } from '../pdf-import.js'
import { readReceipt } from '../receipt.js'
import { formatCents, formatIsoDate, todayIso } from '../format.js'
import { IngestedText } from '../ui.js'
import { atEndOf, CategoryOptions, ListSelect, LISTS_FOR, type CategoryKind } from '../lists.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js'
import { Alert, Badge } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input, NativeSelect } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { cn } from '../lib/cn.js'

type Mode = 'statement' | 'photo' | 'typed'
type Loaded =
  | { readonly kind: 'none' }
  | { readonly kind: 'reading'; readonly name: string }
  | { readonly kind: 'csv'; readonly name: string; readonly text: string }
  | { readonly kind: 'pdf'; readonly name: string; readonly result: PdfImport }
  | { readonly kind: 'wrong'; readonly name: string; readonly message: string }

interface Outcome {
  readonly ok: boolean
  readonly message: string
}

export function AddScreen() {
  const [mode, setMode] = useState<Mode>('statement')
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add</h1>
        <p className="text-sm text-muted-foreground">A statement from your bank, a receipt photo, or one by hand: cash, pay or a move to savings.</p>
      </header>
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(['statement', 'photo', 'typed'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
              mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground',
            )}
          >
            <Icon name={m === 'statement' ? 'file' : m === 'photo' ? 'camera' : 'pencil'} className="size-4" />
            {m === 'statement' ? 'Statement' : m === 'photo' ? 'Photo' : 'Type it'}
          </button>
        ))}
      </div>
      {mode === 'statement' ? <StatementImport /> : mode === 'photo' ? <PhotoEntry /> : <TypedEntry />}
    </div>
  )
}

function StatementImport() {
  const { supabase, userId, accountId, refresh } = useAppData()
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'none' })
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const onFile = async (file: File) => {
    setOutcome(null)
    // A photo dropped here would otherwise be read as a CSV and shown as
    // columns of binary noise. Say where it belongs instead.
    if (file.type.startsWith('image/')) {
      setLoaded({ kind: 'wrong', name: file.name, message: 'That is a photo. Use the Photo tab above to read a receipt.' })
      return
    }
    setLoaded({ kind: 'reading', name: file.name })
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (isPdf) {
      const result = await readStatementPdf(new Uint8Array(await file.arrayBuffer()))
      setLoaded({ kind: 'pdf', name: file.name, result })
    } else {
      setLoaded({ kind: 'csv', name: file.name, text: await file.text() })
    }
  }

  const save = async (request: SaveRequest) => {
    if (accountId === null) return
    setSaving(true)
    setOutcome(null)
    try {
      const counts = await saveImport(supabase, { userId, accountId, ...request })
      const parts = [
        counts.autoApproved > 0 ? `${counts.autoApproved} filed automatically from your past choices` : null,
        counts.waiting > 0 ? `${counts.waiting} waiting for review` : null,
        counts.deduped > 0 ? `${counts.deduped} you already had` : null,
        counts.rejected > 0 ? `${counts.rejected} could not be read` : null,
      ].filter((p): p is string => p !== null)
      setOutcome({ ok: true, message: parts.length === 0 ? 'Nothing new in this file.' : `${parts.join(', ')}.` })
      await refresh()
    } catch (cause) {
      setOutcome({ ok: false, message: cause instanceof Error ? cause.message : 'Nothing was saved.' })
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setLoaded({ kind: 'none' })
    setOutcome(null)
  }

  if (loaded.kind === 'none') return <FilePicker onFile={(f) => void onFile(f)} />
  if (loaded.kind === 'reading') {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-muted-foreground">Reading {loaded.name}…</div>
      </Card>
    )
  }
  if (loaded.kind === 'wrong') {
    return (
      <div className="space-y-3">
        <Alert tone="error" title={loaded.name}>
          {loaded.message}
        </Alert>
        <Button variant="outline" onClick={reset}>
          Choose another file
        </Button>
      </div>
    )
  }
  if (loaded.kind === 'csv') {
    return (
      <ImportScreen
        fileName={loaded.name}
        text={loaded.text}
        onReset={reset}
        onSave={save}
        saving={saving}
        outcome={outcome}
      />
    )
  }
  return <PdfPreview name={loaded.name} result={loaded.result} onReset={reset} onSave={save} saving={saving} outcome={outcome} />
}

function PdfPreview({
  name,
  result,
  onReset,
  onSave,
  saving,
  outcome,
}: {
  name: string
  result: PdfImport
  onReset: () => void
  onSave: (r: SaveRequest) => Promise<void>
  saving: boolean
  outcome: Outcome | null
}) {
  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon name="file" className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{name}</span>
      </div>
      <Button variant="outline" size="sm" onClick={onReset}>
        Choose another
      </Button>
    </div>
  )

  if (!result.ok) {
    return (
      <div className="space-y-4">
        {header}
        <Alert tone="error" title={result.title}>
          {result.detail}
        </Alert>
      </div>
    )
  }

  const { reconciliation: rec, accepted, rejected, parsed, period } = result
  return (
    <div className="space-y-4">
      {header}

      <Card>
        <CardHeader>
          <CardDescription>
            Statement · {formatIsoDate(period.from)} – {formatIsoDate(period.to)}
          </CardDescription>
          <CardTitle as="h2" className="flex items-center gap-2">
            {accepted.length} transactions
            {rec.balances ? (
              <Badge variant="income">
                <Icon name="check" className="size-3" /> Matches your statement
              </Badge>
            ) : (
              <Badge variant="spend">
                <Icon name="alert" className="size-3" /> Does not add up
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Purchases</p>
            <p className="tnum font-semibold">{formatCents(rec.parsedPurchasesCents)}</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Payments &amp; credits</p>
            <p className="tnum font-semibold">{formatCents(rec.parsedPaymentsCents)}</p>
          </div>
        </CardContent>
      </Card>

      {!rec.balances ? (
        <Alert tone="error" title="Nothing will be imported from this file">
          <p>
            The transactions read from this PDF do not add up to the totals printed on the statement, which means something
            was misread. Importing it would put wrong numbers in your budget.
          </p>
          <ul className="mt-2 space-y-1">
            {rec.discrepancies.map((d) => (
              <li key={d.what} className="tnum">
                {DISCREPANCY[d.what]}: statement says {formatCents(d.statementCents)}, read {formatCents(d.parsedCents)}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {rejected.length > 0 ? (
        <Alert title={`${rejected.length} rows could not be read`}>They will be recorded so nothing goes missing silently.</Alert>
      ) : null}

      {rec.balances ? (
        <div className="space-y-2">
          <Button size="lg" className="w-full" disabled={saving} onClick={() => void onSave({ accepted, rejected, parsed, source: 'card_pdf', period })}>
            {saving ? 'Saving…' : `Import ${accepted.length} transactions`}
          </Button>
          {outcome !== null ? <Alert tone={outcome.ok ? 'success' : 'error'}>{outcome.message}</Alert> : null}
          {outcome?.ok === true ? (
            <Button variant="outline" className="w-full" onClick={() => navigate('review')}>
              Go to review
            </Button>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            Merchants you have filed before go straight in. New ones wait for you in Review.
          </p>
        </div>
      ) : null}

      <PreviewList rows={accepted} />
    </div>
  )
}

const DISCREPANCY: Record<string, string> = {
  purchases_and_debits: 'Purchases',
  payments_and_credits: 'Payments and credits',
  balance_equation: 'Closing balance',
}

function PreviewList({ rows }: { rows: readonly AcceptedRow[] }) {
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.line} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
            <span className="tnum w-14 shrink-0 text-xs text-muted-foreground">{formatIsoDate(row.postedOn).replace(/ \d{4}$/, '')}</span>
            <span className="min-w-0 flex-1 truncate">
              <IngestedText>{row.merchantRaw}</IngestedText>
            </span>
            <span className={cn('tnum shrink-0', row.amountCents > 0 && 'text-income')}>{formatCents(row.amountCents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function FilePicker({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file !== undefined) onFile(file)
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center transition-colors',
        // The input inside is hidden, so its focus is drawn on the label (FE-3).
        'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring',
        over ? 'border-primary bg-accent' : 'border-border',
      )}
    >
      <span className="rounded-full bg-muted p-3">
        <Icon name="upload" />
      </span>
      <span className="font-medium">Choose a statement</span>
      <span className="text-sm text-muted-foreground">PDF or CSV from your bank</span>
      <input
        type="file"
        accept=".pdf,application/pdf,.csv,text/csv,text/plain"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file !== undefined) onFile(file)
          e.target.value = ''
        }}
      />
      <span className="mt-2 text-xs text-muted-foreground">Read on this device. The file itself is never uploaded.</span>
    </label>
  )
}

/** A purchase typed by hand — mostly for cash, since card purchases arrive with the statement. */
function TypedEntry() {
  const { supabase, userId, accountId, categories, refresh } = useAppData()
  const [date, setDate] = useState(todayIso())
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'spent' | 'received'>('spent')
  const [merchant, setMerchant] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newKind, setNewKind] = useState<CategoryKind | ''>('variable')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [tried, setTried] = useState(0)
  const amountError = useId()

  const cents = parseMoneyInput(amount)
  const creating = categoryId === '__new__'
  const needed = [
    cents === null || cents <= 0 ? 'an amount' : null,
    merchant.trim().length === 0 ? 'what it was' : null,
    // The browser checked these while it validated the form; now this does.
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso() ? 'a date no later than today' : null,
    creating && newCategory.trim().length === 0 ? "the new category's name" : null,
    creating && newKind === '' ? 'which list it goes on' : null,
    !creating && categoryId === '' ? 'a category' : null,
  ].filter((n): n is string => n !== null)
  const ready = needed.length === 0

  const submit = async () => {
    // Add stays pressable, and says what is missing, rather than sitting
    // greyed out with no reason given (FE-8).
    if (!ready) return setTried((n) => n + 1)
    if (cents === null || accountId === null) return
    setBusy(true)
    setOutcome(null)
    try {
      const category =
        creating && newKind !== ''
          ? (await ensureCategory(supabase, userId, atEndOf(categories, newCategory.trim(), newKind))).id
          : categoryId
      await addTypedTransaction(supabase, {
        accountId,
        postedOn: isoDate(date),
        // The parser's own sign convention, not arithmetic here: spending is an
        // outflow, which the ledger writes as negative (docs/divergences.md D3).
        amountCents: applySignConvention(cents, { kind: direction === 'spent' ? 'debit_positive' : 'signed' }),
        merchantRaw: merchant.trim(),
        categoryId: category,
      })
      setOutcome({ ok: true, message: `Added ${formatCents(cents)} — ${merchant.trim()}.` })
      setTried(0)
      setAmount('')
      setMerchant('')
      setNewCategory('')
      if (creating) setCategoryId('')
      await refresh()
    } catch (cause) {
      setOutcome({ ok: false, message: cause instanceof Error ? cause.message : 'Nothing was saved.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {/* noValidate: the browser's own bubble would stop the press before
          StillNeeded can say, in words kept on the page, what is missing. */}
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {/* Radios, not two buttons: this decides the sign written to the
            ledger, so a screen reader must hear which is chosen, and the eye
            must see more than the card fill, which is 1.08:1 on the track (FE-2). */}
          <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <legend className="sr-only">Money out or in</legend>
            {(['spent', 'received'] as const).map((d) => (
              <label
                key={d}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border-2 text-sm font-medium',
                  'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring',
                  direction === d ? 'border-primary bg-card text-foreground shadow-sm' : 'border-transparent text-muted-foreground',
                )}
              >
                <input
                  type="radio"
                  name="direction"
                  value={d}
                  className="sr-only"
                  checked={direction === d}
                  onChange={() => {
                    setDirection(d)
                    // Each way starts on its likeliest list; a list the other
                    // way offered may not be on offer here.
                    setNewKind(d === 'spent' ? 'variable' : 'income')
                  }}
                />
                {direction === d ? <Icon name="check" className="size-4" data-testid="chosen" /> : null}
                {d === 'spent' ? 'I spent' : 'I received'}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">Every field is needed.</p>
          <Field label="Amount">
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              {...notMoney(amount, cents, amountError)}
            />
          </Field>
          <Field label="What was it?">
            <Input placeholder="e.g. Farmers market" value={merchant} maxLength={120} onChange={(e) => setMerchant(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Category">
              <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                <option value="">Choose…</option>
                <CategoryOptions categories={categories} />
                <option value="__new__">+ New…</option>
              </NativeSelect>
            </Field>
          </div>
          {creating ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="New category name">
                <Input value={newCategory} maxLength={60} onChange={(e) => setNewCategory(e.target.value)} />
              </Field>
              <Field label="On the list">
                <ListSelect value={newKind} onChange={setNewKind} lists={LISTS_FOR[direction]} />
              </Field>
            </div>
          ) : null}
          <NotMoney amount={amount} cents={cents} id={amountError} />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
          {tried > 0 && !ready ? <StillNeeded key={tried} needed={needed} /> : null}
          {outcome !== null ? <Alert tone={outcome.ok ? 'success' : 'error'}>{outcome.message}</Alert> : null}
          <p className="text-xs text-muted-foreground">
            {/* Pay and savings moves are typed (decision 8), so not "for cash" alone. */}
            For what a card statement never shows: cash, pay and moves to savings. A card purchase typed here and later
            imported from your statement would count twice.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

/** An amount typed that is not money marks its field, and the message says why (FE-8). */
function notMoney(amount: string, cents: number | null, id: string) {
  return amount.trim().length > 0 && cents === null ? { 'aria-invalid': true, 'aria-describedby': id } : {}
}

function NotMoney({ amount, cents, id }: { amount: string; cents: number | null; id: string }) {
  if (amount.trim().length === 0 || cents !== null) return null
  return (
    <p id={id} className="text-sm text-spend">
      That amount is not a number of dollars and cents.
    </p>
  )
}

/** What a form still needs, focused as it appears so it is read out; re-keyed on each press. */
function StillNeeded({ needed }: { needed: readonly string[] }) {
  const own = useRef<HTMLParagraphElement>(null)
  useEffect(() => own.current?.focus(), [])
  const list = needed.length === 1 ? needed[0] : `${needed.slice(0, -1).join(', ')} and ${needed.at(-1)}`
  return (
    <p ref={own} role="alert" tabIndex={-1} className="text-sm text-spend outline-none">
      Still needed: {list}.
    </p>
  )
}

type PhotoState =
  | { readonly kind: 'none' }
  | { readonly kind: 'reading'; readonly preview: string }
  | { readonly kind: 'read'; readonly preview: string }
  | { readonly kind: 'failed'; readonly preview: string; readonly message: string }

/**
 * A receipt photo, read by Gemini, checked by the user, then sent to Review.
 *
 * What the model reads only fills in the form. The user sees every field and
 * can correct it, and the row still waits in Review for a category like any
 * other — model output never reaches the ledger unreviewed (CLAUDE.md).
 */
function PhotoEntry() {
  const { supabase, userId, accountId, refresh } = useAppData()
  const [state, setState] = useState<PhotoState>({ kind: 'none' })
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const amountError = useId()

  const cents = parseMoneyInput(amount)
  const ready = cents !== null && cents > 0 && merchant.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)

  const onPhoto = async (file: File) => {
    const preview = URL.createObjectURL(file)
    setOutcome(null)
    setState({ kind: 'reading', preview })
    const result = await readReceipt(supabase, file)
    if (result.ok) {
      setMerchant(result.reading.merchant ?? '')
      setAmount(result.reading.total)
      setDate(result.reading.date ?? '')
      setState({ kind: 'read', preview })
    } else {
      setState({ kind: 'failed', preview, message: result.message })
    }
  }

  const reset = () => {
    if (state.kind !== 'none') URL.revokeObjectURL(state.preview)
    setState({ kind: 'none' })
    setMerchant('')
    setAmount('')
    setDate('')
    setOutcome(null)
  }

  const send = async () => {
    if (!ready || cents === null || accountId === null) return
    setBusy(true)
    setOutcome(null)
    try {
      const counts = await saveImport(supabase, {
        userId,
        accountId,
        parsed: 1,
        rejected: [],
        source: 'receipt_photo',
        accepted: [
          {
            line: 1,
            postedOn: isoDate(date),
            amountCents: applySignConvention(cents, { kind: 'debit_positive' }),
            merchantRaw: merchant.trim(),
            issuerTransactionId: undefined,
          },
        ],
      })
      setOutcome({
        ok: true,
        message:
          counts.autoApproved > 0
            ? 'Added — filed automatically from your past choices.'
            : counts.deduped > 0
              ? 'You already had this one, so nothing was added.'
              : 'Sent to Review. Pick a category there and it counts.',
      })
      await refresh()
    } catch (cause) {
      setOutcome({ ok: false, message: cause instanceof Error ? cause.message : 'Nothing was saved.' })
    } finally {
      setBusy(false)
    }
  }

  if (state.kind === 'none') {
    return (
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring">
        <span className="rounded-full bg-muted p-3">
          <Icon name="camera" />
        </span>
        <span className="font-medium">Take or choose a receipt photo</span>
        <span className="text-sm text-muted-foreground">Flat, in good light, with the total visible</span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file !== undefined) void onPhoto(file)
            e.target.value = ''
          }}
        />
        <span className="mt-2 max-w-xs text-xs text-muted-foreground">
          The photo is read by Google Gemini and is not stored. On the free tier Google may use it to improve its products.
        </span>
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <img src={state.preview} alt="Your receipt" className="h-28 w-20 shrink-0 rounded-md border object-cover" />
        <div className="min-w-0 flex-1 space-y-2">
          {state.kind === 'reading' ? <p className="text-sm text-muted-foreground">Reading your receipt…</p> : null}
          {state.kind === 'read' ? (
            <p className="text-sm">
              <Badge variant="outline">
                <Icon name="sparkles" className="size-3" /> Read by Gemini
              </Badge>{' '}
              <span className="text-muted-foreground">Check each field before sending.</span>
            </p>
          ) : null}
          {state.kind === 'failed' ? <Alert tone="error">{state.message}</Alert> : null}
          <Button variant="outline" size="sm" onClick={reset}>
            Use another photo
          </Button>
        </div>
      </div>

      {state.kind !== 'reading' ? (
        <Card>
          <CardContent className="pt-5">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <Field label="Where">
                <Input value={merchant} maxLength={120} onChange={(e) => setMerchant(e.target.value)} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total spent">
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    {...notMoney(amount, cents, amountError)}
                  />
                </Field>
                <Field label="Date">
                  <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required />
                </Field>
              </div>
              <NotMoney amount={amount} cents={cents} id={amountError} />
              <Button type="submit" size="lg" className="w-full" disabled={!ready || busy}>
                {busy ? 'Sending…' : 'Send to review'}
              </Button>
              {outcome !== null ? <Alert tone={outcome.ok ? 'success' : 'error'}>{outcome.message}</Alert> : null}
              {outcome?.ok === true ? (
                <Button variant="outline" className="w-full" onClick={() => navigate('review')}>
                  Go to review
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">
                For cash. A card purchase also on your statement would count twice.
              </p>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
