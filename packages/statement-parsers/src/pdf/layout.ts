/**
 * Positioned runs back into rows and columns.
 *
 * A statement's transaction table is drawn as loose words at fixed x offsets —
 * `Aug`, `7`, `Aug`, `10`, `LAVA`, `GRILL`, `RED`, `DEER`, `AB`, `31.45` — with
 * no structure in the file saying which belong together. The structure is
 * entirely positional, and rebuilding it is what makes the table readable.
 *
 * Columns are given as x BOUNDARIES by the caller rather than inferred here.
 * Inferring them is possible and tempting and wrong for this job: a column
 * guessed from one page's content can shift on the next page, and a shift that
 * moves an amount into the description column loses a transaction quietly.
 * Boundaries belong to the statement format, which the caller knows.
 */

import type { TextRun } from './text.js'

/** Runs sharing a baseline, within this many units, are one row. */
export const ROW_TOLERANCE = 2.5

export interface LayoutRow {
  /** The baseline, for callers that need to order or group rows. */
  readonly y: number
  /** One string per column band, in the order the boundaries were given. */
  readonly columns: readonly string[]
}

/**
 * Group runs into rows, top of page first.
 *
 * Rows come out in visual order because a statement's meaning depends on it:
 * the `Card Number XXXX 0472` heading applies to the transactions BELOW it,
 * and a multi-card statement read out of order attributes charges to the wrong
 * card. PDF y grows upward, hence the descending sort.
 */
export function groupRows(
  runs: readonly TextRun[],
  boundaries: readonly number[],
  tolerance: number = ROW_TOLERANCE,
): readonly LayoutRow[] {
  const buckets: Array<{ y: number; runs: TextRun[] }> = []

  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (run.text.trim().length === 0) continue
    const last = buckets[buckets.length - 1]
    if (last !== undefined && Math.abs(last.y - run.y) <= tolerance) {
      last.runs.push(run)
    } else {
      buckets.push({ y: run.y, runs: [run] })
    }
  }

  return buckets.map((bucket) => ({
    y: bucket.y,
    columns: splitColumns(bucket.runs, boundaries),
  }))
}

/**
 * Place each run in the band its x falls in.
 *
 * Runs within a band are joined with a single space and the result is
 * whitespace-collapsed. Word spacing inside a band is not reconstructed from
 * the gaps: a proportional font makes glyph advance a guess, and the guess
 * shows up as `LAVAGRILL` or `LAVA  GRILL` depending on which way it errs.
 * One space between runs is right far more often, and the merchant
 * normaliser collapses the rest.
 */
function splitColumns(runs: readonly TextRun[], boundaries: readonly number[]): readonly string[] {
  const bands: string[][] = Array.from({ length: boundaries.length }, () => [])

  for (const run of [...runs].sort((a, b) => a.x - b.x)) {
    const index = bandFor(run.x, boundaries)
    if (index === null) continue
    bands[index]?.push(run.text)
  }

  return bands.map((parts) => parts.join(' ').replace(/\s+/gu, ' ').trim())
}

/**
 * Which band an x belongs to: the last boundary at or below it.
 *
 * A run to the left of every boundary belongs to no column and is dropped —
 * page furniture like a margin mark, which is not table content. Returning
 * band 0 for it instead would inject that text into the first column, where a
 * date parser would then reject the whole row.
 */
function bandFor(x: number, boundaries: readonly number[]): number | null {
  let found: number | null = null
  for (let i = 0; i < boundaries.length; i += 1) {
    const edge = boundaries[i]
    if (edge !== undefined && x >= edge) found = i
  }
  return found
}
