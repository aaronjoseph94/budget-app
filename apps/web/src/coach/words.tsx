/**
 * Coach words on screen: a sentence with blanks, each blank filled with the
 * engine's figure as it is drawn (ADR 0005 §5).
 *
 * The words are the app's own templates today and a model's from plan A12;
 * either way they arrive as text and leave as React text nodes, never as
 * markup. A change is drawn with the engine's direction word ("$40.00
 * more"), so no sentence can put "up" beside a fall.
 */
import { Fragment } from 'react'
import type { Figure } from '@budget/core'
import { renderSegments } from '@budget/savings-coach'
import { formatBasisPoints, formatCents, formatChange, formatDayMonth, formatMonthName, formatMonthTitle, formatWholeDollars } from '../format.js'

/** One figure as the owner reads it. */
export function figureText(figure: Figure): string {
  switch (figure.unit) {
    case 'cents':
      return formatCents(figure.value)
    case 'change':
      return formatChange({ changeCents: figure.value, direction: figure.direction })
    case 'date':
      return formatDayMonth(figure.value)
    case 'month':
      return formatMonthName(figure.value)
    case 'month_year':
      return formatMonthTitle(figure.value)
    case 'count':
      return String(figure.value)
    case 'hours':
      return figure.value === 1 ? '1 hour' : `${figure.value} hours`
    case 'share':
      return formatBasisPoints(figure.value)
    case 'dollars':
      return formatWholeDollars(figure.value)
  }
}

/** What a blank can name: a fact, or a goal, which has a name and no figure. */
export interface Named {
  readonly subject: { readonly label: string }
  readonly figures: Readonly<Record<string, Figure>>
}

/** A blank's text: the subject's name, or one of its figures. */
function slotText(named: Named, slot: string): string {
  if (slot === 'name') return named.subject.label
  const figure = named.figures[slot]
  // renderSegments has checked every slot against the named thing's own.
  if (figure === undefined) throw new RangeError(`No figure ${slot}`)
  return figureText(figure)
}

/**
 * `text` with each blank filled from `facts`, by letter. Words that name a
 * fact or slot they were not given draw nothing rather than a sentence with
 * a hole in it. The app's own templates are tested to name only slots their
 * facts have, and a model's words are checked before they reach here
 * (ADR 0005 §4).
 */
export function CoachText({ text, facts }: { text: string; facts: Readonly<Record<string, Named>> }) {
  const slots = Object.fromEntries(Object.entries(facts).map(([letter, named]) => [letter, ['name', ...Object.keys(named.figures)]]))
  const read = renderSegments({ text, slots })
  if (!read.ok) return null
  return (
    <>
      {read.segments.map((s, i) => (
        <Fragment key={i}>{s.kind === 'text' ? s.text : <span className="tnum font-semibold">{slotText(facts[s.letter]!, s.slot)}</span>}</Fragment>
      ))}
    </>
  )
}
