import { bandBars } from '@budget/chart-specs'
import type { AheadMonth, CashFlowAhead, ScaledSeries, Spread } from '@budget/core'
import { formatCents, formatIsoDate, formatShortMonth, formatWholeDollars } from '../format.js'
import { SvgChart } from '../components/ui/chart.js'
import { Badge } from '../components/ui/feedback.js'
import { Section } from './parts.js'

/**
 * The next three months (F35): a bar a month for the most likely figure in
 * a band from the worst case to the best, and a table of what makes it up.
 * With a start the bars are where each month ends, chained from this
 * month's; without one, what each month leaves over (D17). All cashFlowAhead's.
 */
export function MonthsAheadCard({ ahead, bars, names }: { ahead: CashFlowAhead; bars: ScaledSeries | null; names: (id: string) => string }) {
  const title = 'The next three months'
  if (ahead.status === 'too_early' || bars === null) {
    return (
      <Section title={title} large>
        <p>{ahead.checkBackOn === null ? 'Import a statement to see the months ahead.' : `Too early to tell: check back on ${formatIsoDate(ahead.checkBackOn)}, once a whole month of records is in.`}</p>
      </Section>
    )
  }
  const rough = ahead.status === 'rough'
  const withStart = ahead.months.every((m) => m.balance !== null)
  const shown = (m: AheadMonth): Spread => m.balance ?? m.net
  const range = (s: Spread) => (s.low === s.high ? `about ${formatWholeDollars(s.mid)}` : `${formatWholeDollars(s.low)} to ${formatWholeDollars(s.high)}`)
  return (
    <Section title={title} large>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{rough ? 'Rough' : 'Range'}</Badge>
        <Badge variant="outline">{`Based on ${ahead.completeMonths} ${ahead.completeMonths === 1 ? 'month' : 'months'}`}</Badge>
      </div>
      <p className="text-muted-foreground">
        {withStart ? 'Where each month ends' : 'What each month leaves over'}
        {rough ? ': one rough figure until there are 3 months of records. ' : ', worst case to best case. '}
        Not a promise.
      </p>
      <SvgChart
        svg={bandBars({
          id: 'forecast-ahead',
          title: withStart ? 'Where the next three months end' : 'What the next three months leave over',
          description: ahead.months.map((m) => `${formatShortMonth(m.month)}: ${range(shown(m))}, most likely ${formatWholeDollars(shown(m).mid)}.`).join(' '),
          zeroBp: zeroOf(bars),
          columns: ahead.months.map((m, i) => ({
            label: formatShortMonth(m.month),
            valueText: formatWholeDollars(shown(m).mid),
            lowBp: bars.bps[1 + 3 * i]!,
            midBp: bars.bps[2 + 3 * i]!,
            highBp: bars.bps[3 + 3 * i]!,
          })),
        })}
        className="mx-auto max-w-md"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="sticky left-0 bg-card py-2 text-left font-normal">
                <span className="sr-only">What</span>
              </th>
              {ahead.months.map((m) => (
                <th key={m.month} scope="col" className="whitespace-nowrap py-2 pl-2 text-right font-medium">
                  {formatShortMonth(m.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            <Line label="Pay" cells={ahead.months.map((m) => formatCents(m.payCents))} />
            <Line label="Bills" cells={ahead.months.map((m) => formatCents(m.billsCents))} />
            <Line label="Everyday spending" cells={ahead.months.map((m) => `about ${formatWholeDollars(m.variable.mid)}`)} />
            <Line label="Savings" cells={ahead.months.map((m) => formatCents(m.savingsCents))} />
            <Line label="Left over" cells={ahead.months.map((m) => `about ${formatWholeDollars(m.net.mid)}`)} strong />
            {withStart ? (
              <>
                <Line label="Worst case end" cells={ahead.months.map((m) => formatWholeDollars(m.balance!.low))} />
                <Line label="Most likely end" cells={ahead.months.map((m) => formatWholeDollars(m.balance!.mid))} strong />
                <Line label="Best case end" cells={ahead.months.map((m) => formatWholeDollars(m.balance!.high))} />
              </>
            ) : null}
          </tbody>
        </table>
      </div>
      {withStart ? null : <p className="text-muted-foreground">Type this month’s starting balance on the Month to see where each month ends.</p>}
      {ahead.payNotCounted.length === 0 ? null : (
        <p className="text-muted-foreground">Leaves out pay from {ahead.payNotCounted.map(names).join(' and ')}: give it a pay schedule in Setup, or a goal on the Month.</p>
      )}
    </Section>
  )
}

/** The bars' scale always holds $0 (forecastFigures puts it there), so it has a place. */
function zeroOf(bars: ScaledSeries): number {
  if (bars.zeroBp === null) throw new RangeError('The months ahead are scaled with $0 on the scale')
  return bars.zeroBp
}

function Line({ label, cells, strong = false }: { label: string; cells: readonly string[]; strong?: boolean }) {
  return (
    <tr>
      {/* Held at the left as the months scroll, so a figure never loses its name on a narrow phone. */}
      <th scope="row" className="sticky left-0 bg-card py-2 pr-2 text-left font-normal text-muted-foreground">
        {label}
      </th>
      {cells.map((c, i) => (
        <td key={i} className={`tnum whitespace-nowrap py-2 pl-2 text-right${strong ? ' font-semibold' : ''}`}>
          {c}
        </td>
      ))}
    </tr>
  )
}
