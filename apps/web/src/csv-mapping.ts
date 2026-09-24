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
  US_AMOUNT_FORMAT,
  detectHeaderRow,
  profileColumns,
  readStatement,
  tokenizeCsv,
  type DateFormat,
  type StatementRead,
} from '@budget/statement-parsers'
import { summariseImport } from '@budget/core'

/** Only what the user has explicitly picked; everything else falls to the proposal. */
export interface Chosen {
  dateIndex?: number
  merchantIndex?: number
  amountIndex?: number
  dateFormat?: DateFormat
  signKind?: 'signed' | 'debit_positive'
}

export function useCsvMapping(text: string) {
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

  const ambiguousDate =
    proposal !== null && proposal.dateFormats.length > 1 ? proposal.dateFormats : null


  // Back to the proposal, as a new file would start.
  const clear = () => setChosen({})

  return {
    delimiter,
    setDelimiter,
    choose,
    clear,
    tokenized,
    analysis,
    dateIndex,
    merchantIndex,
    amountIndex,
    signKind,
    dateFormat,
    result,
    summary,
    ambiguousDate,
  }
}
