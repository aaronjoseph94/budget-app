import type { GoalForecast, GoalPace as Pace } from '@budget/core'
import { Badge } from '../components/ui/feedback.js'
import { formatCents, formatIsoDate, formatShortMonth } from '../format.js'

/**
 * When a goal is reached at the owner's pace (F33), in the app's own words.
 * Every date and amount is goalForecast's; this picks the words for each
 * state. Under three complete months it is one "about" date, labelled
 * rough, never an invented range, and the chip saying how many months it
 * stands on is drawn by the app, never written by the AI (plan §2.3).
 */
export function GoalPace({ forecast, targetDate }: { forecast: GoalForecast; targetDate: string | null }) {
  const { pace } = forecast
  const chip = evidenceChip(pace)
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{paceWords(pace)}</span>
        {chip === null ? null : <Badge variant="outline">{chip}</Badge>}
      </p>
      {pace.status === 'range' && !oneMonth(pace) ? (
        <p className="text-muted-foreground">Most likely {formatShortMonth(pace.dates.middle)}.</p>
      ) : null}
      {forecast.neededWeeklyCents === null || targetDate === null ? null : (
        <p className="text-muted-foreground">
          To reach it by {formatIsoDate(targetDate)}: <span className="tnum font-medium text-foreground">{formatCents(forecast.neededWeeklyCents)}</span> a week.
        </p>
      )}
    </div>
  )
}

function paceWords(pace: Pace): string {
  switch (pace.status) {
    case 'met':
      return 'Target met. Mark it reached on Savings when you are done.'
    case 'no_fund':
      return 'Make it a fund on Savings to see when you will get there.'
    case 'too_early':
      return pace.possibleFrom === null
        ? 'Import a statement to see when you will get there.'
        : `Too early to tell: check back on ${formatIsoDate(pace.possibleFrom)}, once a whole month of records is in.`
    case 'no_pace':
      return 'No date at your current pace: in a usual month, nothing is moved into it.'
    case 'rough':
      return `At your pace: about ${formatShortMonth(pace.date)}`
    case 'range':
      if (oneMonth(pace)) return `At your pace: about ${formatShortMonth(pace.dates.middle)}`
      return pace.dates.late === null
        ? `At your pace: ${formatShortMonth(pace.dates.early)} or later`
        : `At your pace: ${formatShortMonth(pace.dates.early)} – ${formatShortMonth(pace.dates.late)}`
  }
}

/**
 * A range whose ends fall in the same month, as with the same amount moved in
 * every month: "Jul 2029 – Jul 2029" says nothing a single month does not.
 */
function oneMonth(pace: Extract<Pace, { status: 'range' }>): boolean {
  return pace.dates.late !== null && formatShortMonth(pace.dates.early) === formatShortMonth(pace.dates.late)
}

function evidenceChip(pace: Pace): string | null {
  switch (pace.status) {
    case 'rough':
      return `Rough: ${months(pace.months)}`
    case 'range':
    case 'no_pace':
      return `Based on ${months(pace.months)}`
    default:
      return null
  }
}

function months(n: number): string {
  return n === 1 ? '1 month' : `${n} months`
}

/** A goal's date in a few words, for its row under the main goal. */
export function paceShort(forecast: GoalForecast): string {
  const { pace } = forecast
  switch (pace.status) {
    case 'met':
      return 'Target met'
    case 'no_fund':
      return 'On no fund yet'
    case 'too_early':
      return 'Too early to tell'
    case 'no_pace':
      return 'No date at this pace'
    case 'rough':
      return `About ${formatShortMonth(pace.date)}, rough`
    case 'range':
      return `About ${formatShortMonth(pace.dates.middle)}`
  }
}
