/**
 * The month in review in the app's own words, and the AI's where they pass
 * (plan §2.6, §3.11 feature 10, A15; ADR 0005 §4, §5).
 *
 * The headline names the biggest change each way; three points say what
 * was spent, what was saved and the largest change against the usual
 * month; and one thing to try looks to next month. Every figure is a blank
 * filled from the engine, so these words pass the text rule a model's
 * must. A model's reply is checked here against what it was offered, and
 * each part it got wrong shows the app's own words instead, alone.
 */
import type { NarrateReport, ReportReply } from '@budget/schema'
import { type CheckDropReason, sentenceProblem } from './check-reply.js'
import type { ReportFacts } from './report.js'
import type { Tone } from './templates.js'

type Tones = Readonly<Record<Tone, string>>

/** The headline, by which changes there are; U is the largest rise, D the largest fall, S Spent and V Saved. */
export const REPORT_HEADLINES: Readonly<Record<'both' | 'up' | 'down' | 'compared' | 'compared_so_far' | 'plain', Tones>> = {
  both: {
    cheerleader: 'A win on {{D.name}}: {{D.change}} than usual. Keep an eye on {{U.name}}: {{U.change}} than usual.',
    straight: 'Biggest changes: {{U.name}}, {{U.change}} than usual, and {{D.name}}, {{D.change}} than usual.',
  },
  up: {
    cheerleader: 'One to watch: {{U.name}}, {{U.change}} than your usual month.',
    straight: 'Biggest change: {{U.name}}, {{U.change}} than usual.',
  },
  down: {
    cheerleader: 'A win on {{D.name}}: {{D.change}} than your usual month.',
    straight: 'Biggest change: {{D.name}}, {{D.change}} than usual.',
  },
  compared: {
    cheerleader: 'You spent {{S.change}} than in {{S.last_month}}.',
    straight: 'Spent {{S.change}} than in {{S.last_month}}.',
  },
  compared_so_far: {
    cheerleader: 'So far you’ve spent {{S.change}} than by this day in {{S.last_month}}.',
    straight: 'So far: spent {{S.change}} than by this day in {{S.last_month}}.',
  },
  plain: {
    cheerleader: 'You spent {{S.now}} and saved {{V.now}}.',
    straight: 'Spent {{S.now}}. Saved {{V.now}}.',
  },
}

/** One thing to try next month: about the largest rise (X), or a general one. */
export const REPORT_TRY: Readonly<Record<'rise' | 'general', Tones>> = {
  rise: {
    cheerleader: 'Next month, try a weekly limit for {{X.name}} close to its usual, and check it each Sunday.',
    straight: 'Next month: set a weekly limit for {{X.name}} and keep to it.',
  },
  general: {
    cheerleader: 'Next month, try moving your savings on payday, before the spending starts.',
    straight: 'Next month: move your savings on payday, before you spend.',
  },
}

export interface ReportWords {
  readonly headline: string
  readonly points: readonly { readonly fact: string; readonly text: string }[]
  readonly tryThis: string
}

const as = (text: string, letter: string) => text.replaceAll('{{X.', `{{${letter}.`)

/** One point, in the same words in either tone: it states figures. */
function point(facts: ReportFacts, letter: string): string {
  const fact = facts.facts[letter]!
  const has = (slot: string) => slot in fact.figures
  const soFar = facts.soFar
  const than = soFar ? 'than by this day in {{X.last_month}}' : 'than {{X.last_month}}'
  const compare = has('change') ? ` That is {{X.change}} ${than}.` : ''
  const usual = has('usual') ? ' Your usual month: {{X.usual}}.' : ''
  switch (fact.kind) {
    case 'month_spent':
      return as(`${soFar ? 'Spent so far' : 'Spent'} {{X.now}}.${compare}${usual}`, letter)
    case 'month_saved':
      return as(`${soFar ? 'Saved so far' : 'Saved'} {{X.now}}${has('rate') ? ', {{X.rate}} of what came in' : ''}.${compare}${usual}`, letter)
    case 'month_income':
      return as(`${soFar ? 'Came in so far' : 'Came in'} {{X.now}}.${compare}${usual}`, letter)
    case 'mover_up':
    case 'mover_down':
      return as(soFar ? '{{X.name}} so far: {{X.now}}, {{X.change}} than usual by this day.' : '{{X.name}}: {{X.now}}, {{X.change}} than your usual month of {{X.usual}}.', letter)
  }
}

/** The review in the app's own words. */
export function reportWords(input: { readonly facts: ReportFacts; readonly tone: Tone }): ReportWords {
  const { facts, tone } = input
  const { up, down } = facts
  const spent = facts.facts['A']!
  const key = up !== null && down !== null ? 'both' : up !== null ? 'up' : down !== null ? 'down' : 'change' in spent.figures ? (facts.soFar ? 'compared_so_far' : 'compared') : 'plain'
  // In one pass, so a letter put in for one name is never taken for another.
  const letters: Readonly<Record<string, string>> = { U: up ?? 'U', D: down ?? 'D', S: 'A', V: 'B' }
  const headline = REPORT_HEADLINES[key][tone].replace(/\{\{([UDSV])\./g, (_, name: string) => `{{${letters[name]!}.`)
  return {
    headline,
    points: facts.points.map((fact) => ({ fact, text: point(facts, fact) })),
    tryThis: facts.tryThis === null ? REPORT_TRY.general[tone] : as(REPORT_TRY.rise[tone], facts.tryThis),
  }
}

/** A part of the review as drawn: its words, and whether the AI wrote them. */
export interface ReviewPart {
  readonly text: string
  readonly ai: boolean
}

export interface Review {
  readonly headline: ReviewPart
  readonly points: readonly (ReviewPart & { readonly fact: string })[]
  readonly tryThis: ReviewPart
}

/** The AI's words where a checked reply has them, the app's own for every part it does not. */
export function mergeReview(input: { readonly own: ReportWords; readonly ai: ReportReply | null }): Review {
  const { own, ai } = input
  const part = (theirs: string | null | undefined, ours: string): ReviewPart => (theirs === null || theirs === undefined ? { text: ours, ai: false } : { text: theirs, ai: true })
  return {
    headline: part(ai?.headline, own.headline),
    points: own.points.map((p) => ({ fact: p.fact, ...part(ai?.points.find((q) => q.fact === p.fact)?.text, p.text) })),
    tryThis: part(ai?.tryThis, own.tryThis),
  }
}

export interface ReportCheckDrop {
  readonly part: 'headline' | 'point' | 'tryThis'
  readonly reason: CheckDropReason
}

/**
 * ADR 0005's rules 8 and 9 on a review: the headline may name any fact
 * offered, a point only its own, and the thing to try only the fact it was
 * offered for, or none; no sentence may say "rose" beside a fall. A failing
 * part is dropped alone.
 */
export function checkReportReply(input: { readonly reply: ReportReply; readonly brief: NarrateReport }): { readonly reply: ReportReply; readonly dropped: readonly ReportCheckDrop[] } {
  const { reply, brief } = input
  const dropped: ReportCheckDrop[] = []
  const slots = Object.fromEntries(brief.facts.map((f) => [f.id, f.slots]))
  const directions = new Map(brief.facts.map((f) => [f.id, f.direction]))
  const keep = (part: ReportCheckDrop['part'], text: string | null, letters: readonly string[]): string | null => {
    if (text === null) return null
    const reason = sentenceProblem({
      text,
      slots: Object.fromEntries(letters.flatMap((l) => (slots[l] === undefined ? [] : [[l, slots[l]]]))),
      directionOf: (l) => directions.get(l),
    })
    if (reason === null) return text
    dropped.push({ part, reason })
    return null
  }
  const points: ReportReply['points'][number][] = []
  for (const p of reply.points) {
    const reason = !brief.points.includes(p.fact) ? 'not_offered' : points.some((q) => q.fact === p.fact) ? 'twice' : null
    if (reason !== null) {
      dropped.push({ part: 'point', reason })
      continue
    }
    const text = keep('point', p.text, [p.fact])
    if (text !== null) points.push({ fact: p.fact, text })
  }
  return {
    reply: {
      headline: keep('headline', reply.headline, brief.facts.map((f) => f.id)),
      points,
      tryThis: keep('tryThis', reply.tryThis, brief.tryThis === null ? [] : [brief.tryThis]),
    },
    dropped,
  }
}
