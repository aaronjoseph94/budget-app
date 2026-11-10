/**
 * A CSV export's column mapping: the file read with the separator chosen,
 * a proposal for which column is which, the user's choices over it, and
 * the rows as that mapping reads them. Every figure is derived, never
 * stored, so the screen always shows the result of the settings it
 * displays. Moved out of ImportScreen, which held it all in one
 * 290-line component (FE-19).
 */
import { useMemo, useState } from 'react'
import {
  detectHeaderRow,
  firstRecordReadsAsData,
  profileColumns,
  proposeMapping,
  readStatement,
  tokenizeCsv,
  type AmountFormat,
  type DateFormat,
  type StatementRead,
} from '@budget/statement-parsers'
import { summariseImportWithin } from '@budget/core'

/** Only what the user has explicitly picked; everything else falls to the proposal. */
export interface Chosen {
  dateIndex?: number
  merchantIndex?: number
  amountIndex?: number
  /** The money-in column of a Debit and Credit pair; null is the owner saying there is one amount column. */
  creditIndex?: number | null
  dateFormat?: DateFormat
  signKind?: 'signed' | 'debit_positive'
  /** The owner's answer when the file cannot say whether its first row is column names. */
  hasHeader?: boolean
}

export function useCsvMapping(text: string) {
  const [delimiter, setDelimiter] = useState<string>(',')
  // The decimal mark, declared as the separator is, never sniffed: "1.234"
  // is a thousand in Berlin. A semicolon file "common in Europe" read every
  // -4,50 as no amount with the point alone (e2e-money-07).
  const [decimal, setDecimal] = useState<AmountFormat['decimalSeparator']>('.')
  const amountFormat = useMemo((): AmountFormat => ({ decimalSeparator: decimal, parenthesesMeanNegative: true }), [decimal])
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
    const verdict = detectHeaderRow(tokenized.rows, amountFormat)
    // 'ambiguous' was read as "a header", so a file with no heading row and
    // a closing line lost its first charge, in no count. When the first
    // record holds a date or an amount, as a charge does, the owner is
    // asked; nothing is read until they answer (null).
    const askable = verdict === 'ambiguous' && firstRecordReadsAsData(tokenized.rows, amountFormat)
    const hasHeader = askable ? (chosen.hasHeader ?? null) : verdict !== 'data'
    // Unanswered, the columns are described as a file without names has them.
    const columns = profileColumns({
      rows: tokenized.rows,
      hasHeader: hasHeader ?? false,
      amountFormat,
    })
    return { verdict, askable, hasHeader, columns }
  }, [tokenized, amountFormat, chosen.hasHeader])

  // A proposal, applied once, that the user can override. It is never
  // re-applied after they touch a control: a screen that silently re-picks a
  // column while someone is choosing one is worse than no proposal at all.
  // The guess itself is statement-parsers' (architecture-c2-01).
  const proposal = useMemo(() => {
    if (!tokenized.ok || analysis === null) return null
    return proposeMapping({ rows: tokenized.rows, hasHeader: analysis.hasHeader ?? false, columns: analysis.columns, amountFormat })
  }, [tokenized, analysis, amountFormat])

  // The mapping actually in force: the user's choice where they made one, the
  // proposal otherwise. Derived, never stored, so the two cannot disagree.
  // Where nothing was found, the first three columns stand, for the owner to
  // change; the preview below shows what each reads.
  const dateIndex = chosen.dateIndex ?? proposal?.dateIndex ?? 0
  const merchantIndex = chosen.merchantIndex ?? proposal?.merchantIndex ?? 1
  const amountIndex = chosen.amountIndex ?? proposal?.amountIndex ?? 2
  // Money out and money in as two columns: amountIndex is then the money
  // out, and each row is the credit less the debit (statement-parsers).
  const pickedCredit = chosen.creditIndex !== undefined ? chosen.creditIndex : (proposal?.creditIndex ?? null)
  const creditIndex = pickedCredit === amountIndex ? null : pickedCredit
  // The proposal's word on the sign is about the column it proposed.
  const proposedSign = proposal !== null && creditIndex === null && amountIndex === proposal.amountIndex ? proposal : null
  const signKind = chosen.signKind ?? proposedSign?.signKind ?? 'signed'
  // Mostly positives could be purchases either way: said, never guessed.
  const signUnclear = chosen.signKind === undefined && proposedSign?.signUnclear === true
  // A format is proposed only when the column admits exactly one. Where the
  // data is ambiguous the user is asked, never defaulted past.
  // It used to fall to MM/DD/YYYY here while the screen asked, and the rows
  // were read and could be saved that way (architecture-b-02): now nothing
  // is read until the owner answers.
  const soleFormat = proposal?.dateFormats.length === 1 ? proposal.dateFormats[0] : undefined
  const ambiguousDate =
    chosen.dateFormat === undefined && proposal !== null && proposal.dateFormats.length > 1 ? proposal.dateFormats : null
  // With no date column found, the usual US format stands and the preview
  // shows every row it cannot read.
  const dateFormat: DateFormat | null = chosen.dateFormat ?? soleFormat ?? (ambiguousDate === null ? 'MM/DD/YYYY' : null)

  const result: StatementRead | null = useMemo(() => {
    if (!tokenized.ok || analysis === null || analysis.hasHeader === null || dateFormat === null) return null
    return readStatement(tokenized.rows, {
      mapping: {
        dateIndex,
        merchantIndex,
        amountIndex,
        ...(creditIndex === null ? {} : { creditIndex }),
        sign: { kind: signKind },
      },
      amountFormat,
      dateFormat,
      hasHeader: analysis.hasHeader,
    })
  }, [tokenized, analysis, dateIndex, merchantIndex, amountIndex, creditIndex, dateFormat, signKind, amountFormat])

  const summary = useMemo(
    () =>
      result === null
        ? null
        : // 'too_large' when the rows cannot be added up: said, never thrown while drawing.
          summariseImportWithin({ amountsCents: result.accepted.map((r) => r.amountCents) }),
    [result],
  )

  // More than one column could be the amount, and the owner has not picked:
  // the screen says so beside the proposal.
  const otherMoney =
    chosen.amountIndex === undefined && proposal !== null && proposal.amountCandidates.length > 1

  const askHeader = analysis !== null && analysis.hasHeader === null

  // Back to the proposal, as a new file would start.
  const clear = () => setChosen({})

  return {
    delimiter,
    setDelimiter,
    decimal,
    setDecimal,
    choose,
    clear,
    tokenized,
    analysis,
    dateIndex,
    merchantIndex,
    amountIndex,
    creditIndex,
    signKind,
    signUnclear,
    dateFormat,
    result,
    summary,
    ambiguousDate,
    askHeader,
    otherMoney,
  }
}
