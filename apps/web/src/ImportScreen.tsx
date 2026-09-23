import { useMemo, useState } from 'react'
import {
  DATE_FORMATS,
  US_AMOUNT_FORMAT,
  detectHeaderRow,
  profileColumns,
  readStatement,
  tokenizeCsv,
  type ColumnProfile,
  type DateFormat,
  type StatementRead,
} from '@budget/statement-parsers'
import { summariseImport } from '@budget/core'
import type { ImportRequest } from './ledger.js'
import { Button, Card, IngestedText, Label, Select, Stat } from './ui.js'

import { describeFailure, describeReason, formatCents, formatIsoDate } from './format.js'

/** Only what the user has explicitly picked; everything else falls to the proposal. */
interface Chosen {
  dateIndex?: number
  merchantIndex?: number
  amountIndex?: number
  dateFormat?: DateFormat
  signKind?: 'signed' | 'debit_positive'
}

const DELIMITERS = [
  { value: ',', label: 'Comma  (most banks)' },
  { value: ';', label: 'Semicolon  (common in Europe)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe' },
] as const

export type SaveRequest = ImportRequest

export interface ImportScreenProps {
  /** The file, already chosen on the Add screen, which also routes PDFs away. */
  readonly fileName: string
  readonly text: string
  readonly onReset: () => void
  readonly onSave?: (result: SaveRequest) => Promise<void>
  readonly saving?: boolean
  readonly outcome?: { readonly ok: boolean; readonly message: string } | null
}

/** A CSV export: preview the column mapping, then send to the review queue. */
export function ImportScreen({ fileName, text, onReset, onSave, saving = false, outcome = null }: ImportScreenProps) {
  const [delimiter, setDelimiter] = useState<string>(',')
  // What the user has explicitly chosen. Everything unset falls through to the
  // proposal below, so nothing is assigned during render and a later file
  // cannot silently inherit an earlier file's columns.
  const [chosen, setChosen] = useState<Chosen>({})
  const choose = <K extends keyof Chosen>(key: K, value: Chosen[K]) =>
    setChosen((prev) => ({ ...prev, [key]: value }))

  // Everything below is derived from the file and the choices. No parsing
  // happens in an event handler, so the screen always shows the result of the
  // settings currently displayed rather than the ones that were set when a
  // button was last pressed.
  const tokenized = useMemo(
    () => tokenizeCsv(text, { delimiter }),
    [text, delimiter],
  )

  const analysis = useMemo(() => {
    if (!tokenized.ok) return null
    const verdict = detectHeaderRow(tokenized.rows, US_AMOUNT_FORMAT)
    const hasHeader = verdict !== 'data'
    const columns = profileColumns({
      rows: tokenized.rows,
      hasHeader,
      amountFormat: US_AMOUNT_FORMAT,
    })
    return { verdict, hasHeader, columns }
  }, [tokenized])

  // A proposal, applied once, that the user can override. It is never
  // re-applied after they touch a control: a screen that silently re-picks a
  // column while someone is choosing one is worse than no proposal at all.
  const proposal = useMemo(() => {
    if (analysis === null) return null
    const { columns } = analysis
    const date = columns.find((c) => c.dateFormats.length > 0)
    const amount = columns.find((c) => c.readsAsAmount && c.index !== date?.index)
    // A description is whatever is left once dates and money are excluded.
    // Preferring a repeating column is a weak signal — a short statement may
    // have no repeats at all — so it falls back to the first remaining column
    // rather than to a fixed index that would only be right by accident.
    const textual = columns.filter((c) => !c.readsAsAmount && c.dateFormats.length === 0)
    const merchant = textual.find((c) => !c.unique) ?? textual[0]
    return {
      dateIndex: date?.index ?? 0,
      amountIndex: amount?.index ?? Math.max(0, columns.length - 1),
      merchantIndex: merchant?.index ?? 1,
      dateFormats: date?.dateFormats ?? [],
    }
  }, [analysis])

  // The mapping actually in force: the user's choice where they made one, the
  // proposal otherwise. Derived, never stored, so the two cannot disagree.
  const dateIndex = chosen.dateIndex ?? proposal?.dateIndex ?? 0
  const merchantIndex = chosen.merchantIndex ?? proposal?.merchantIndex ?? 1
  const amountIndex = chosen.amountIndex ?? proposal?.amountIndex ?? 2
  const signKind = chosen.signKind ?? 'signed'
  // A format is proposed only when the column admits exactly one. Where the
  // data is ambiguous the user is asked, never defaulted past.
  const soleFormat = proposal?.dateFormats.length === 1 ? proposal.dateFormats[0] : undefined
  const dateFormat: DateFormat = chosen.dateFormat ?? soleFormat ?? 'MM/DD/YYYY'

  const result: StatementRead | null = useMemo(() => {
    if (!tokenized.ok || analysis === null) return null
    return readStatement(tokenized.rows, {
      mapping: {
        dateIndex,
        merchantIndex,
        amountIndex,
        sign: { kind: signKind },
      },
      amountFormat: US_AMOUNT_FORMAT,
      dateFormat,
      hasHeader: analysis.hasHeader,
    })
  }, [tokenized, analysis, dateIndex, merchantIndex, amountIndex, dateFormat, signKind])

  const summary = useMemo(
    () =>
      result === null
        ? null
        : summariseImport({ amountsCents: result.accepted.map((r) => r.amountCents) }),
    [result],
  )

  const reset = () => {
    setChosen({})
    onReset()
  }

  const ambiguousDate =
    proposal !== null && proposal.dateFormats.length > 1 ? proposal.dateFormats : null

  return (
    <div>
      {(
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label>File</Label>
              <div className="truncate text-sm font-medium">{fileName}</div>
            </div>
            <Button variant="quiet" onClick={reset}>
              Choose another
            </Button>
          </div>

          {!tokenized.ok ? (
            <Card className="border-spend/40 p-4">
              <Label>This file could not be read</Label>
              <p className="mt-2 text-sm">
                {describeFailure(
                  tokenized.failure.kind,
                  'line' in tokenized.failure ? tokenized.failure.line : undefined,
                )}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                If your bank separates columns with something other than a comma, change it below.
              </p>
              <div className="mt-3 max-w-xs">
                <Select
                  label="Column separator"
                  value={delimiter}
                  options={DELIMITERS.map((d) => ({ value: d.value as string, label: d.label }))}
                  onChange={setDelimiter}
                />
              </div>
            </Card>
          ) : null}

          {analysis !== null ? (
            <Card className="p-4">
              <Label>What the file looks like</Label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select
                  label="Column separator"
                  value={delimiter}
                  options={DELIMITERS.map((d) => ({ value: d.value as string, label: d.label }))}
                  onChange={setDelimiter}
                />
                <Select
                  label="Date column"
                  value={dateIndex}
                  options={analysis.columns.map((c) => ({ value: c.index, label: columnName(c) }))}
                  onChange={(v) => choose('dateIndex', v)}
                />
                <Select
                  label="Description column"
                  value={merchantIndex}
                  options={analysis.columns.map((c) => ({ value: c.index, label: columnName(c) }))}
                  onChange={(v) => choose('merchantIndex', v)}
                />
                <Select
                  label="Amount column"
                  value={amountIndex}
                  options={analysis.columns.map((c) => ({ value: c.index, label: columnName(c) }))}
                  onChange={(v) => choose('amountIndex', v)}
                />
                <Select
                  label="Date format"
                  value={dateFormat}
                  options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
                  onChange={(v) => choose('dateFormat', v)}
                />
                <Select
                  label="How amounts are written"
                  value={signKind}
                  options={[
                    { value: 'signed' as const, label: 'Purchases are negative' },
                    { value: 'debit_positive' as const, label: 'Purchases are positive' },
                  ]}
                  onChange={(v) => choose('signKind', v)}
                />
              </div>

              {ambiguousDate !== null ? (
                <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm">
                  <strong className="font-medium">Which way round are these dates?</strong> Every
                  day in this file is 12 or lower, so <code>03/04</code> could be 3 April or 4
                  March. Nothing in the file settles it — please choose the format your bank uses.
                </p>
              ) : null}
            </Card>
          ) : null}

          {result !== null && summary !== null ? (
            <>
              <Card>
                <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
                  <Stat label="Would import" value={String(result.accepted.length)} />
                  <Stat label="Needs a look" value={String(result.rejected.length)} />
                  <Stat label="Money out" value={formatCents(summary.outflowCents)} tone="spend" />
                  <Stat label="Money in" value={formatCents(summary.inflowCents)} tone="income" />
                </div>
              </Card>

              {result.rejected.length > 0 ? (
                <Card className="p-4">
                  <Label>{result.rejected.length} rows would not be imported</Label>
                  <ul className="mt-3 space-y-2">
                    {result.rejected.map((r) => (
                      <li key={r.line} className="flex gap-3 text-sm">
                        <span className="tnum shrink-0 text-muted-foreground">Line {r.line}</span>
                        <span>{describeReason(r.reason)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <Card className="overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <Label>{result.accepted.length} transactions</Label>
                </div>
                <ul className="divide-y divide-border">
                  {result.accepted.map((row) => (
                    <li key={`${row.line}`} className="flex items-baseline gap-3 px-4 py-3">
                      <span className="tnum w-28 shrink-0 text-sm text-muted-foreground">
                        {formatIsoDate(row.postedOn)}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <IngestedText>{row.merchantRaw}</IngestedText>
                      </span>
                      <span
                        className={`tnum shrink-0 text-sm font-medium ${
                          row.amountCents < 0 ? 'text-spend' : 'text-income'
                        }`}
                      >
                        {formatCents(row.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              {onSave !== undefined ? (
                <div className="flex flex-col items-center gap-2">
                  {/*
                    Saveable when ANYTHING was read, readable or not. It used to
                    require at least one accepted row, so a file where every row
                    failed — a wrong date format, say — could not be saved at
                    all, and its failures were never recorded anywhere. That is
                    precisely the import most worth keeping a record of, and
                    CLAUDE.md requires every ingestion failure to reach the
                    review queue rather than ending on a screen that is about
                    to be navigated away from.
                  */}
                  <Button
                    disabled={saving || result.parsed === 0}
                    onClick={() => {
                      void onSave({
                        accepted: result.accepted,
                        rejected: result.rejected,
                        parsed: result.parsed,
                        source: 'card_csv',
                      })
                    }}
                  >
                    {saving
                      ? 'Saving…'
                      : result.accepted.length === 0
                        ? `Record ${result.rejected.length} unreadable rows`
                        : `Send ${result.accepted.length} to the review queue`}
                  </Button>
                  {outcome !== null ? (
                    <p
                      className={`text-sm ${outcome.ok ? 'text-income' : 'text-spend'}`}
                      role={outcome.ok ? undefined : 'alert'}
                    >
                      {outcome.message}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Nothing reaches your ledger until you approve it.
                  </p>
                </div>
              ) : null}

              <p className="text-center text-xs text-muted-foreground">
                {result.parsed} rows read · {result.accepted.length} readable ·{' '}
                {result.rejected.length} not · {result.blankSkipped} blank lines skipped
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function columnName(column: ColumnProfile): string {
  const label = column.header === null ? `Column ${column.index + 1}` : column.header
  const hints: string[] = []
  if (column.dateFormats.length > 0) hints.push('dates')
  if (column.readsAsAmount) hints.push('money')
  if (column.constant) hints.push('always the same')
  if (column.unique) hints.push('all different')
  return hints.length === 0 ? label : `${label}  —  ${hints.join(', ')}`
}
