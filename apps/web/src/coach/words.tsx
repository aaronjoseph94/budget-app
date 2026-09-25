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
import type { Fact, Figure } from '@budget/core'
import { renderSegments, slotsOf } from '@budget/savings-coach'
import { formatBasisPoints, formatCents, formatChange, formatDayMonth, formatMonthName } from '../format.js'

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
    case 'count':
      return String(figure.value)
    case 'hours':
      return figure.value === 1 ? '1 hour' : `${figure.value} hours`
    case 'share':
      return formatBasisPoints(figure.value)
  }
}

/** A blank's text: the subject's name, or one of the fact's figures. */
function slotText(fact: Fact, slot: string): string {
  if (slot === 'name') return fact.subject.label
  const figure = fact.figures[slot]
  // renderSegments has checked every slot against the fact's own.
  if (figure === undefined) throw new RangeError(`No figure ${slot} on ${fact.key}`)
  return figureText(figure)
}

/**
 * `text` with each blank filled from `facts`, by letter. Words that name a
 * fact or slot they were not given draw nothing rather than a sentence with
 * a hole in it. The app's own templates are tested to name only slots their
 * facts have; falling back to them when a model's words fail is A12's
 * (ADR 0005 §4).
 */
export function CoachText({ text, facts }: { text: string; facts: Readonly<Record<string, Fact>> }) {
  const slots = Object.fromEntries(Object.entries(facts).map(([letter, fact]) => [letter, slotsOf(fact)]))
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
