/**
 * The Sunday check-in in the app's own words, and the AI's where they pass
 * (plan §2.4, §3.11 feature 7, A20; ADR 0005 §4, §5).
 *
 * Four parts: last week's recap, a win, one thing to try next week, and a
 * line for the goals. Every figure is a blank filled from the engine, so
 * these words pass the text rule a model's must. A model's reply is checked
 * here against what it was offered, and each part it got wrong shows the
 * app's own words instead, alone. The questions and the commitment are the
 * screen's, drawn from core's figures; no model writes them.
 */
import type { CheckinPart, CheckinReply, NarrateCheckin } from '@budget/schema'
import type { CheckinFacts, WinReason } from './checkin.js'
import { type CheckDropReason, sentenceProblem } from './check-reply.js'
import { GOAL_LINE_TEMPLATES, type Tone } from './templates.js'

type Tones = Readonly<Record<Tone, string>>

/** R is the week's spending fact, W the win's, T the costliest category's. */
export const CHECKIN_RECAP: Readonly<Record<'compared' | 'plain' | 'kept' | 'over', Tones>> = {
  compared: {
    cheerleader: 'Last week you spent {{R.now}} on everyday things, {{R.change}} than the week before.',
    straight: 'Everyday spending last week: {{R.now}}, {{R.change}} than the week before.',
  },
  plain: {
    cheerleader: 'Last week you spent {{R.now}} on everyday things.',
    straight: 'Everyday spending last week: {{R.now}}.',
  },
  kept: {
    cheerleader: ' That left {{R.left}} of your weekly budgets.',
    straight: ' Left in your weekly budgets: {{R.left}}.',
  },
  over: {
    cheerleader: ' That went {{R.over}} past your weekly budgets.',
    straight: ' Over your weekly budgets by {{R.over}}.',
  },
}

export const CHECKIN_WIN: Readonly<Record<WinReason | 'general', Tones>> = {
  kept: {
    cheerleader: 'You kept within your weekly budgets. Well done!',
    straight: 'You kept within your weekly budgets.',
  },
  less: {
    cheerleader: 'You spent {{W.change}} than the week before. That’s a win!',
    straight: 'Spent {{W.change}} than the week before.',
  },
  no_spend: {
    cheerleader: 'Days with no everyday spending: {{W.days}}. Nice work!',
    straight: 'Days with no everyday spending: {{W.days}}.',
  },
  general: {
    cheerleader: 'You showed up for your check-in, and that habit is a win on its own.',
    straight: 'Checking in each week is the habit that counts.',
  },
}

export const CHECKIN_TRY: Readonly<Record<'limit' | 'general', Tones>> = {
  limit: {
    cheerleader: 'Try keeping {{T.name}} under {{T.limit}} next week.',
    straight: 'Next week: keep {{T.name}} under {{T.limit}}.',
  },
  general: {
    cheerleader: 'Try moving your savings on payday, before the spending starts.',
    straight: 'Move your savings on payday, before you spend.',
  },
}

export type CheckinWords = CheckinReply

const as = (text: string, name: string, letter: string) => text.replaceAll(`{{${name}.`, `{{${letter}.`)

/** The check-in in the app's own words: every part but the recap, which needs a covered week, and the goal line, which needs a goal. */
export function checkinWords(input: { readonly facts: CheckinFacts; readonly tone: Tone }): CheckinWords {
  const { facts, tone } = input
  const spent = facts.recap === null ? null : facts.facts[facts.recap]!
  const recap =
    spent === null
      ? null
      : as(
          CHECKIN_RECAP['change' in spent.figures ? 'compared' : 'plain'][tone] +
            ('left' in spent.figures ? CHECKIN_RECAP.kept[tone] : 'over' in spent.figures ? CHECKIN_RECAP.over[tone] : ''),
          'R',
          facts.recap!,
        )
  return {
    recap,
    win: facts.win === null ? CHECKIN_WIN.general[tone] : as(CHECKIN_WIN[facts.win.reason][tone], 'W', facts.win.letter),
    tryThis: facts.top === null ? CHECKIN_TRY.general[tone] : as(CHECKIN_TRY.limit[tone], 'T', facts.top),
    goal: facts.mainGoal === null ? null : as(GOAL_LINE_TEMPLATES[tone], 'A', facts.mainGoal),
  }
}

/** A part of the check-in as drawn: its words, and whether the AI wrote them. */
export interface CheckinPartWords {
  readonly text: string
  readonly ai: boolean
}

export type Checkin = Readonly<Record<CheckinPart, CheckinPartWords | null>>

/** The AI's words where a checked reply has them, the app's own for every part it does not. */
export function mergeCheckin(input: { readonly own: CheckinWords; readonly ai: CheckinReply | null }): Checkin {
  const part = (key: CheckinPart): CheckinPartWords | null => {
    const ours = input.own[key]
    // A part the app has no words for (no covered week, no goal) is not shown, whatever a model wrote.
    if (ours === null) return null
    const theirs = input.ai?.[key]
    return theirs === null || theirs === undefined ? { text: ours, ai: false } : { text: theirs, ai: true }
  }
  return { recap: part('recap'), win: part('win'), tryThis: part('tryThis'), goal: part('goal') }
}

export interface CheckinCheckDrop {
  readonly part: CheckinPart
  readonly reason: CheckDropReason
}

/**
 * ADR 0005's rules 8 and 9 on a check-in: the recap may name its fact and
 * the impulse share, the win only the win's fact, the thing to try only
 * the costliest category's, and the goal line only the goals; no sentence
 * may say "rose" beside a fall. A failing part is dropped alone.
 */
export function checkCheckinReply(input: { readonly reply: CheckinReply; readonly brief: NarrateCheckin }): { readonly reply: CheckinReply; readonly dropped: readonly CheckinCheckDrop[] } {
  const { reply, brief } = input
  const dropped: CheckinCheckDrop[] = []
  const slots = new Map<string, readonly string[]>([...brief.facts.map((f): [string, readonly string[]] => [f.id, f.slots]), ...brief.goals.map((g): [string, readonly string[]] => [g.id, ['name']])])
  const directions = new Map(brief.facts.map((f) => [f.id, f.direction]))
  const impulse = brief.facts.find((f) => f.kind === 'impulse_share')?.id ?? null
  const may: Readonly<Record<CheckinPart, readonly (string | null)[]>> = {
    recap: [brief.recap, impulse],
    win: [brief.win],
    tryThis: [brief.tryThis],
    goal: brief.goals.map((g) => g.id),
  }
  const keep = (part: CheckinPart): string | null => {
    const text = reply[part]
    if (text === null) return null
    const letters = may[part].filter((l): l is string => l !== null)
    const reason = sentenceProblem({ text, slots: Object.fromEntries(letters.map((l) => [l, slots.get(l) ?? []])), directionOf: (l) => directions.get(l) })
    if (reason === null) return text
    dropped.push({ part, reason })
    return null
  }
  return { reply: { recap: keep('recap'), win: keep('win'), tryThis: keep('tryThis'), goal: keep('goal') }, dropped }
}
