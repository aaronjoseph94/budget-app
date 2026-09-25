import { useMemo } from 'react'
import { rangeBar } from '@budget/chart-specs'
import type { MonthEndForecast, SafeToSpend } from '@budget/core'
import { useAppData } from '../app-data.js'
import { useFunds } from '../funds.js'
import { formatCents, formatDayMonth, formatMonthName, formatWholeDollars } from '../format.js'
import { hashOf } from '../nav.js'
import { SvgChart } from '../components/ui/chart.js'
import { Badge } from '../components/ui/feedback.js'
import { HelpButton } from '../help/HelpButton.js'
import { Said } from '../coach/CoachCards.js'
import { useCoachDay } from '../coach/day.js'
import { useCoachRead, type DigestRows } from '../coach/facts.js'
import { useNarration } from '../coach/use-narration.js'
import { forecastFigures, type ForecastFigures } from '../forecast/figures.js'
import { NoStart, Row, Section } from '../forecast/parts.js'
import { DebtFreeCard, NextDaysCard } from '../forecast/Ahead.js'

/**
 * The Forecast (plan §2.5, A13): one sentence, safe to spend, where the
 * month ends with what is still to come, the next 30 days and the
 * debt-free date. Every figure is packages/core's (F29 to F32), from the
 * Coach's year read; the sentence is the Coach's forecast card's words,
 * the AI's where kept ones still fit and the app's own otherwise, and
 * this screen never asks the AI itself. It formats; it never computes.
 */
export function ForecastScreen() {
  const read = useCoachRead()
  const { categories } = useAppData()
  const figures = useMemo((): ForecastFigures | 'failed' | 'missing_update' | null => {
    if (read === null) return null
    if (read === 'failed' || read.forecast === undefined) return 'failed'
    if (read.forecast.status === 'failed') return read.forecast.missingUpdate ? 'missing_update' : 'failed'
    try {
      return forecastFigures(read, read.forecast, categories)
    } catch {
      return 'failed'
    }
  }, [read, categories])
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
        <HelpButton screen="forecast" />
      </div>
      {figures === null ? <p className="text-sm text-muted-foreground">Working out your forecast…</p> : null}
      {figures === 'missing_update' ? (
        <p className="text-sm">
          The forecast needs a one-time update.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
            See One-time updates
          </a>
        </p>
      ) : null}
      {figures === 'failed' ? <p className="text-sm text-muted-foreground">The forecast did not load. Reload to try again; everything else still works.</p> : null}
      {typeof figures === 'object' && figures !== null && typeof read === 'object' && read !== null ? (
        <>
          <Sentence read={read} />
          <SafeCard safe={figures.safe} names={namesOf(categories)} />
          <MonthEndCard monthEnd={figures.monthEnd} figures={figures} month={read.asOf} />
          <NextDaysCard flow={figures.flow} line={figures.line} asOf={read.asOf} names={namesOf(categories)} />
        </>
      ) : null}
      {/* From the payoff plan alone, so it shows whatever became of the rest. */}
      <DebtFreeCard />
    </div>
  )
}

function namesOf(categories: readonly { readonly id: string; readonly name: string }[]): (id: string) => string {
  return (id) => categories.find((c) => c.id === id)?.name ?? 'a category'
}

/** The Coach's forecast card's words, the AI's (✨) where kept ones still fit; nothing asked for here. */
function Sentence({ read }: { read: DigestRows }) {
  const funds = useFunds()
  const { day, asOf } = useCoachDay(read, funds)
  const { narration } = useNarration(day, asOf, false)
  const card = day?.cards.find((c) => c.action === 'forecast')
  const words = card === undefined ? undefined : narration?.cards.get(card.fact.key)
  if (words === undefined) return null
  return (
    <p aria-live="polite" className="text-lg font-medium leading-snug [overflow-wrap:anywhere]">
      <span key={words.body.ai ? 'ai' : 'own'} className={words.body.ai ? 'words-in' : undefined}>
        <Said words={words.body} />
      </span>
    </p>
  )
}

/** Safe to spend (F31): a day, over the days left with today, or why there is none. */
function SafeCard({ safe, names }: { safe: SafeToSpend; names: (id: string) => string }) {
  return (
    <Section title="Safe to spend">
      {safe.perDayCents === null ? (
        <NoStart />
      ) : (
        <p>
          <span className="tnum text-3xl font-bold">{formatCents(safe.perDayCents)}</span>
          <span className="text-muted-foreground"> a day for {safe.days === 1 ? 'today' : `${safe.days} days, today included`}</span>
        </p>
      )}
      {safe.status === 'nothing_left' ? <p>Nothing left to spend safely this month, once your bills and savings are counted.</p> : null}
      {/* A pay schedule is set in Setup's Income card; an Income goal is typed on the Month, where the workbook types it. */}
      {safe.payNotCounted.length === 0 ? null : (
        <p className="text-muted-foreground">
          {`Pay from ${safe.payNotCounted.map(names).join(' and ')} is not counted: give ${safe.payNotCounted.length === 1 ? 'it' : 'each'} a pay schedule in Setup, or a goal on the Month.`}
        </p>
      )}
    </Section>
  )
}

/** Where the month ends (F30): the range, what is still to come, and how much history it rests on. */
function MonthEndCard({ monthEnd, figures, month }: { monthEnd: MonthEndForecast; figures: ForecastFigures; month: string }) {
  const name = formatMonthName(month)
  if (monthEnd.status === 'too_early' || monthEnd.spent === null) {
    return (
      <Section title={`End of ${name}`}>
        <p>Too early to tell: check back on {formatDayMonth(monthEnd.checkBackOn ?? month)}.</p>
      </Section>
    )
  }
  const { end, spent } = monthEnd
  const { range } = figures
  const today = figures.flow.todayCents
  const toCome = monthEnd.variableToComeCents
  return (
    <Section title={`End of ${name}`}>
      <div className="flex flex-wrap items-center gap-2">
        {end === null ? null : monthEnd.status === 'rough' ? (
          <span className="tnum text-3xl font-bold">About {formatWholeDollars(end.mid)}</span>
        ) : (
          <span className="tnum text-3xl font-bold">
            {formatWholeDollars(end.low)} to {formatWholeDollars(end.high)}
          </span>
        )}
        <Badge>{monthEnd.status === 'rough' ? 'Rough' : 'Range'}</Badge>
        <Badge variant="outline">{monthEnd.completeMonths === 0 ? 'New: not enough history yet' : `Based on ${monthEnd.completeMonths} ${monthEnd.completeMonths === 1 ? 'month' : 'months'}`}</Badge>
      </div>
      {end === null ? <NoStart /> : monthEnd.status === 'range' ? <p>Most likely {formatWholeDollars(end.mid)}.</p> : null}
      {end === null || range === null || today === null ? null : (
        <SvgChart
          svg={rangeBar({
            id: 'forecast-month-end',
            title: `Where ${name} ends`,
            description: `Today ${formatCents(today)}; the month ends between ${formatWholeDollars(end.low)} and ${formatWholeDollars(end.high)}, most likely ${formatWholeDollars(end.mid)}.`,
            todayBp: range.bps[0]!,
            lowBp: range.bps[1]!,
            midBp: range.bps[2]!,
            highBp: range.bps[3]!,
            zeroBp: range.zeroBp,
            midText: `${monthEnd.status === 'rough' ? 'About' : 'Most likely'} ${formatWholeDollars(end.mid)}`,
            todayText: `Today ${formatCents(today)}`,
          })}
        />
      )}
      <h3 className="pt-1 font-medium">Still to come</h3>
      <dl className="divide-y">
        <Row label="Pay still due" value={formatCents(monthEnd.pay.dueCents)} />
        <Row label="Bills not charged yet (already in Spent)" value={formatCents(monthEnd.billsNotChargedCents)} />
        <Row label="Spending at your usual pace" value={toCome === null ? '' : `about ${formatWholeDollars(toCome)}`} />
        <Row label="Savings still planned" value={formatCents(monthEnd.savingsPlannedCents)} />
        <Row label={`Spent by the end of ${name}`} value={`about ${formatWholeDollars(spent.mid)}`} />
      </dl>
    </Section>
  )
}
