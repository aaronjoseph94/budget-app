import { useMemo, type ReactNode } from 'react'
import { DATE_FORMATS, looksLikeText, type ColumnProfile, type DateFormat } from '@budget/statement-parsers'
import { useCsvMapping } from './csv-mapping.js'
import type { ImportRequest } from './ledger.js'
import { IngestedText, Label, Stat } from './ui.js'
import { Button } from './components/ui/button.js'
import { Card } from './components/ui/card.js'
import { OptionSelect } from './components/ui/form.js'

import { describeFailure, describeReason, formatCents, formatIsoDate } from './format.js'

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
  readonly onSave: (result: SaveRequest) => Promise<void>
  readonly saving?: boolean
  readonly outcome?: { readonly ok: boolean; readonly message: string } | null
}

/** A CSV export: preview the column mapping, then send to the review queue. */
export function ImportScreen({ fileName, text, onReset, onSave, saving = false, outcome = null }: ImportScreenProps) {
  const mapping = useCsvMapping(text)
  const { clear, result, summary } = mapping
  // Nothing to map in bytes that are not text, or a file with no rows: say
  // so, never columns of noise or none (e2e-money-10).
  const notText = useMemo(() => !looksLikeText(text), [text])
  const noRows = result !== null && result.parsed === 0

  const reset = () => {
    clear()
    onReset()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label>File</Label>
          <div className="truncate text-sm font-medium">{fileName}</div>
        </div>
        <Button variant="outline" onClick={reset}>
          Choose another
        </Button>
      </div>

      {notText ? (
        <NotAStatement title="This is not a text CSV">
          It may be a spreadsheet, a PDF or a picture with a .csv name. Download it from your bank as CSV again, or save it as CSV
          from your spreadsheet app.
        </NotAStatement>
      ) : noRows ? (
        <NotAStatement title="This file has no transactions">
          It is empty, or has only a heading row. Download the statement again for dates with charges in them, then choose it here.
        </NotAStatement>
      ) : (
        <>
          <ColumnMapping mapping={mapping} />

          {result !== null && summary !== null ? (
            <>
              <ReadRows result={result} summary={summary} />
              <SaveFooter result={result} onSave={onSave} saving={saving} outcome={outcome} />
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

/** A file with nothing to import, and why, in place of the mapping. */
function NotAStatement({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-spend/40 p-4">
      <Label>{title}</Label>
      <p className="mt-2 text-sm">{children}</p>
    </Card>
  )
}

/** "1 row", "2 rows". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type Mapping = ReturnType<typeof useCsvMapping>

/** What the mapping reads: the counts, the rows it could not read and why, and every row it could (FE-19). */
function ReadRows({ result, summary }: { result: NonNullable<Mapping['result']>; summary: NonNullable<Mapping['summary']> }) {
  return (
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
          <Label>{count(result.rejected.length, 'row', 'rows')} would not be imported</Label>
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
          <Label>{count(result.accepted.length, 'transaction', 'transactions')}</Label>
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
    </>
  )
}

/** Sending what was read to Review, and what came of it (FE-19). */
function SaveFooter({
  result,
  onSave,
  saving,
  outcome,
}: {
  result: NonNullable<Mapping['result']>
  onSave: ImportScreenProps['onSave']
  saving: boolean
  outcome: { readonly ok: boolean; readonly message: string } | null
}) {
  return (
    <>
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
          disabled={result.parsed === 0}
          aria-disabled={saving}
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
              ? `Record ${count(result.rejected.length, 'unreadable row', 'unreadable rows')}`
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
          A row from a shop you filed before goes straight to its category. The rest wait for you in Review. Check the rows above
          first.
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {count(result.parsed, 'row', 'rows')} read · {result.accepted.length} readable · {result.rejected.length} not ·{' '}
        {count(result.blankSkipped, 'blank line', 'blank lines')} skipped
      </p>
    </>
  )
}

/**
 * The file's shape: why it could not be read, with the separator to try
 * instead, or which column is which, the date format and how amounts are
 * signed, each proposed and each the owner's to change (FE-19).
 */
function ColumnMapping({ mapping }: { mapping: Mapping }) {
  const { delimiter, setDelimiter, decimal, setDecimal, choose, tokenized, analysis, dateIndex, merchantIndex, amountIndex, signKind, dateFormat, ambiguousDate, otherMoney } =
    mapping
  return (
    <>
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
            <OptionSelect
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
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <OptionSelect
              label="Column separator"
              value={delimiter}
              options={DELIMITERS.map((d) => ({ value: d.value as string, label: d.label }))}
              onChange={setDelimiter}
            />
            <OptionSelect
              label="Date column"
              value={dateIndex}
              options={analysis.columns.map((c) => ({ value: c.index, label: columnName(c) }))}
              onChange={(v) => choose('dateIndex', v)}
            />
            <OptionSelect
              label="Description column"
              value={merchantIndex}
              options={analysis.columns.map((c) => ({ value: c.index, label: columnName(c) }))}
              onChange={(v) => choose('merchantIndex', v)}
            />
            <OptionSelect
              label="Amount column"
              value={amountIndex}
              options={analysis.columns.map((c) => ({ value: c.index, label: columnName(c) }))}
              onChange={(v) => choose('amountIndex', v)}
            />
            <OptionSelect<DateFormat | ''>
              label="Date format"
              value={dateFormat ?? ''}
              options={[
                // Until the owner answers an ambiguous file, nothing is chosen.
                ...(dateFormat === null ? [{ value: '' as const, label: 'Choose…' }] : []),
                ...DATE_FORMATS.map((f) => ({ value: f, label: f })),
              ]}
              onChange={(v) => {
                if (v !== '') choose('dateFormat', v)
              }}
            />
            <OptionSelect
              label="How amounts are written"
              value={signKind}
              options={[
                { value: 'signed' as const, label: 'Purchases are negative' },
                { value: 'debit_positive' as const, label: 'Purchases are positive' },
              ]}
              onChange={(v) => choose('signKind', v)}
            />
            {/* Declared, as the separator is: a European file writes -4,50 (e2e-money-07). */}
            <OptionSelect
              label="Decimal mark"
              value={decimal}
              options={[
                { value: '.' as const, label: 'Point: 1,234.56' },
                { value: ',' as const, label: 'Comma: 1.234,56 (common in Europe)' },
              ]}
              onChange={setDecimal}
            />
          </div>

          {otherMoney ? (
            <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm">
              <strong className="font-medium">More than one column looks like money.</strong> Check that Amount is each
              purchase’s price, not a fee, a balance or a reference number.
            </p>
          ) : null}

          {ambiguousDate !== null ? (
            <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm">
              <strong className="font-medium">Which way round are these dates?</strong> Every
              day in this file is 12 or lower, so <code>03/04</code> could be 3 April or 4
              March. Nothing in the file settles it — please choose the format your bank uses.
            </p>
          ) : null}
        </Card>
      ) : null}
    </>
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
