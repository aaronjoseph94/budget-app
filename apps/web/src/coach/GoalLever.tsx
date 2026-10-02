import type { Lever } from '@budget/core'
import { formatCents, formatMinutes, formatWeeks } from '../format.js'

/**
 * What to trim to reach a goal sooner (F34), in the app's own words: the
 * top lever goalLevers offered, with the weeks it saves at the owner's pace
 * and, for a goal with a cost an hour, what it buys a month in the goal's
 * own unit. With no pace, how long the lever alone would take. The
 * category's name is the owner's text and is drawn as text.
 */
export function GoalLever({ lever, categoryName, unitLabel }: { lever: Lever; categoryName: string; unitLabel: string | null }) {
  const trim = `Trim ${categoryName} by ${formatCents(lever.monthlyCents)} a month`
  const time =
    lever.minutesPerMonth === null ? '' : ` That’s ${formatMinutes(lever.minutesPerMonth)} of ${unitLabel ?? 'your goal'} a month.`
  return (
    <p className="text-sm">
      {lever.weeksSooner !== null
        ? `${trim} to get there ${formatWeeks(lever.weeksSooner)} sooner.${time}`
        : `${trim}, and that alone gets you there in ${formatWeeks(lever.weeksToGoal ?? missing())}.${time}`}
    </p>
  )
}


/** goalLevers gives a lever weeks sooner with a pace, and weeks to the goal without one. */
function missing(): never {
  throw new RangeError('A lever has neither weeks sooner nor weeks to its goal')
}
