import { useMemo } from 'react'
import { rangeBar } from '@budget/chart-specs'
import type { MonthEndForecast, SafeToSpend } from '@budget/core'
import { useAppData, useCategoryName } from '../app-data.js'
import { useFunds } from '../funds.js'
import { formatCents, formatDayMonth, formatMonthName, formatWholeDollars } from '../format.js'
import { hashOf } from '../nav.js'
import { SvgChart, fitted } from '../components/ui/chart.js'
import { Badge } from '../components/ui/feedback.js'
import { HelpButton } from '../help/HelpButton.js'
import { Said } from '../coach/CoachCards.js'
import { useCoachDay } from '../coach/day.js'
import { useCoachRead, type DigestRows } from '../coach/facts.js'
import { useNarration } from '../coach/use-narration.js'
import { forecastFigures, type ForecastFigures } from '../forecast/figures.js'
import { NoStart, Row, Section, StatSection } from '../forecast/parts.js'
import { DebtFreeCard, NextDaysCard } from '../forecast/Ahead.js'
import { GoalsAheadCard } from '../forecast/Goals.js'
import { MonthsAheadCard } from '../forecast/Months.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { MonthTitle } from '../components/ui/type.js'
import { TryAgain } from '../try-again.js'

/**
 * The Forecast (plan §2.5, A13, A14): one sentence, safe to spend, where
 * the month ends with what is still to come, the next 30 days, when each
 * goal is reached with its what-ifs, the next three months and the
 * debt-free date. Every figure is packages/core's
 * (F29 to F35), from the Coach's year read; the sentence is the Coach's
 * forecast card's words, the AI's where kept ones still fit and the app's
 * own otherwise, and this screen never asks the AI itself. It formats; it
 * never computes.
 */
export function ForecastScreen() {
  const read = useCoachRead()
  const { categories } = useAppData()
  const nameOf = useCategoryName()
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
  const ready = typeof figures === 'object' && figures !== null && typeof read === 'object' && read !== null ? { figures, read } : null
  // Mockup A: the title and sentence, Safe to spend and the month's end as two
  // stat cards, then the sections two across from 1280px (under the sidebar
  // from 1024, two would leave each near 340px), and the debt-free line across
  // the foot. Each grid keeps the reading order a phone shows.
  return (
    <div className="space-y-4 xl:space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <MonthTitle>Forecast</MonthTitle>
          <HelpButton screen="forecast" />
        </div>
        {ready === null ? null : <Sentence read={ready.read} />}
      </div>
      {figures === null ? <p className="text-sm text-muted-foreground">Working out your forecast…</p> : null}
      {figures === 'missing_update' ? (
        <p className="text-sm">
          The forecast needs a one-time update.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
            See One-time updates
          </a>
        </p>
      ) : null}
      {figures === 'failed' ? <p className="text-sm text-muted-foreground">The forecast did not load. <TryAgain />; everything else still works.</p> : null}
      {ready === null ? null : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:gap-5">
          <SafeCard safe={ready.figures.safe} names={nameOf} />
          <MonthEndCard monthEnd={ready.figures.monthEnd} figures={ready.figures} month={ready.read.asOf} />
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2 xl:gap-5">
        {ready === null ? null : <StillToComeCard monthEnd={ready.figures.monthEnd} month={ready.read.asOf} />}
        {ready === null ? null : <NextDaysCard flow={ready.figures.flow} line={ready.figures.line} asOf={ready.read.asOf} names={nameOf} />}
        {/* The goals' dates need only the year's read, so they show when the month's forecast cannot. */}
        {typeof read === 'object' && read !== null ? (
          <GoalsAheadCard read={read} end={typeof figures === 'object' && figures !== null ? figures.monthEnd.end : null} month={formatMonthName(read.asOf)} />
        ) : null}
        {typeof figures === 'object' && figures !== null ? <MonthsAheadCard ahead={figures.ahead} bars={figures.aheadBars} names={nameOf} /> : null}
      </div>
      {/* From the payoff plan alone, so it shows whatever became of the rest. */}
      <DebtFreeCard />
    </div>
  )
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
    <p aria-live="polite" className="text-lg font-medium leading-snug [overflow-wrap:anywhere] md:text-xl">
      <span key={words.body.ai ? 'ai' : 'own'} className={words.body.ai ? 'words-in' : undefined}>
        <Said words={words.body} />
      </span>
    </p>
  )
}

/** Safe to spend (F31): a day, over the days left with today, or why there is none. */
function SafeCard({ safe, names }: { safe: SafeToSpend; names: (id: string) => string }) {
  return (
    <StatSection title="Safe to spend" icon="check" hero>
      {safe.perDayCents === null ? (
        <NoStart />
      ) : (
        <p className="text-muted-foreground">
          {/* This card's big figures may break inside only when they cannot
            fit their line at all, as Figure does (FE-17, N58). */}
          <span className="tnum text-2xl font-bold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] xl:text-[2rem]">{formatCents(safe.perDayCents)}</span>
          <span> a day</span>
          <span className="block pt-1"> for {safe.days === 1 ? 'today' : `${safe.days} days, today included`}</span>
        </p>
      )}
      {safe.status === 'nothing_left' ? <p>Nothing left to spend safely this month, once your bills and savings are counted.</p> : null}
      {/* A pay schedule is set in Setup's Income card; an Income goal is typed on the Month, where the workbook types it. */}
      {safe.payNotCounted.length === 0 ? null : (
        <p className="text-sm text-muted-foreground">
          {`Pay from ${safe.payNotCounted.map(names).join(' and ')} is not counted: give ${safe.payNotCounted.length === 1 ? 'it' : 'each'} a pay schedule in Setup, or a goal on the Month.`}
        </p>
      )}
    </StatSection>
  )
}

/**
 * Where the month ends (F30): the range, how much history it rests on, and
 * the range drawn by chart-specs' rangeBar from the same basis points as the
 * figures (forecastFigures), so the words and the drawing agree (design
 * review P2 item 9).
 */
function MonthEndCard({ monthEnd, figures, month }: { monthEnd: MonthEndForecast; figures: ForecastFigures; month: string }) {
  const name = formatMonthName(month)
  if (monthEnd.status === 'too_early' || monthEnd.spent === null) {
    return (
      <StatSection title={`End of ${name}`} icon="trend">
        <p>Too early to tell: check back on {formatDayMonth(monthEnd.checkBackOn ?? month)}.</p>
      </StatSection>
    )
  }
  const { end } = monthEnd
  const { range } = figures
  const today = figures.flow.todayCents
  return (
    <StatSection title={`End of ${name}`} icon="trend">
      {end === null ? null : monthEnd.status === 'rough' ? (
        <p className="tnum text-2xl font-bold tracking-[-0.02em] [overflow-wrap:anywhere] xl:text-[2rem]">About {formatWholeDollars(end.mid)}</p>
      ) : (
        <p className="tnum text-2xl font-bold tracking-[-0.02em] [overflow-wrap:anywhere] xl:text-[2rem]">
          {formatWholeDollars(end.low)} to {formatWholeDollars(end.high)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{monthEnd.status === 'rough' ? 'Rough' : 'Range'}</Badge>
        <Badge variant="outline">{monthEnd.completeMonths === 0 ? 'New: not enough history yet' : `Based on ${monthEnd.completeMonths} ${monthEnd.completeMonths === 1 ? 'month' : 'months'}`}</Badge>
      </div>
      {end === null ? <NoStart /> : monthEnd.status === 'range' ? <p className="text-muted-foreground">Most likely {formatWholeDollars(end.mid)}.</p> : null}
      {end === null || range === null || today === null ? null : (
        <SvgChart
          svg={fitted(rangeBar, {
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
          className="mx-auto max-w-md"
        />
      )}
    </StatSection>
  )
}

/** What is still to come this month (F30), the rows the month's end rests on. */
function StillToComeCard({ monthEnd, month }: { monthEnd: MonthEndForecast; month: string }) {
  if (monthEnd.status === 'too_early' || monthEnd.spent === null) return null
  const name = formatMonthName(month)
  const toCome = monthEnd.variableToComeCents
  return (
    <Section title="Still to come" large>
      <dl className="divide-y border-t">
        <Row label="Pay still due" value={formatCents(monthEnd.pay.dueCents)} />
        <Row label="Bills not charged yet (already in Spent)" value={formatCents(monthEnd.billsNotChargedCents)} />
        <Row label="Spending at your usual pace" value={toCome === null ? '' : `about ${formatWholeDollars(toCome)}`} />
        <Row label="Savings still planned" value={formatCents(monthEnd.savingsPlannedCents)} />
        <Row label={`Spent by the end of ${name}`} value={`about ${formatWholeDollars(monthEnd.spent.mid)}`} />
      </dl>
    </Section>
  )
}
