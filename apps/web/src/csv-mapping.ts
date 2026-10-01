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
  proposeMapping,
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
  // The guess itself is statement-parsers' (architecture-c2-01).
  const proposal = useMemo(() => {
    if (!tokenized.ok || analysis === null) return null
    return proposeMapping({ rows: tokenized.rows, hasHeader: analysis.hasHeader, columns: analysis.columns, amountFormat: US_AMOUNT_FORMAT })
  }, [tokenized, analysis])

  // The mapping actually in force: the user's choice where they made one, the
  // proposal otherwise. Derived, never stored, so the two cannot disagree.
  // Where nothing was found, the first three columns stand, for the owner to
  // change; the preview below shows what each reads.
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
  // More than one column could be the amount, and the owner has not picked:
  // the screen says so beside the proposal.
  const otherMoney =
    chosen.amountIndex === undefined && proposal !== null && proposal.amountCandidates.length > 1


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
    otherMoney,
  }
}
