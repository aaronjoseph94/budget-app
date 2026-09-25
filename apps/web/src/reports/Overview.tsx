/**
 * The Reports' Overview (plan §2.6, A15): Income, Spent and Saved against
 * last month and the usual month, the share saved, the categories that
 * moved furthest from their usual month, and each Variable category this
 * month beside last. Every figure is core's monthReport (F36); this draws
 * and formats, and never computes.
 */
import { pairedBars } from '@budget/chart-specs'
import type { Change, MonthReport, Mover } from '@budget/core'
import { formatBasisPoints, formatCents, formatChange, formatDateRange, formatDayMonth, formatMonthName } from '../format.js'
import { SvgChart } from '../components/ui/chart.js'
import { Section } from '../forecast/parts.js'

export type Reviewed = Extract<MonthReport, { readonly totals: unknown }>

/** How the two sides of the comparison are named: a whole month by its name, days so far by their dates. */
export function sidesOf(report: Reviewed): { readonly now: string; readonly before: string } {
  const last = report.lastMonth
  const { window } = report
  if (report.status !== 'so_far') return { now: formatMonthName(window.from), before: formatMonthName(last.window.from) }
  return { now: formatDateRange(window.from, window.to), before: formatDateRange(last.window.from, last.window.to) }
}

function Figure({ label, now, lines }: { label: string; now: number; lines: readonly string[] }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 font-medium">{label}</dt>
        <dd className="tnum whitespace-nowrap text-base font-semibold">{formatCents(now)}</dd>
      </div>
      {lines.map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  )
}

/** Income, Spent and Saved, each with last month's figure and the usual month's, and the share saved. */
export function TotalsCard({ report, historyStart }: { report: Reviewed; historyStart: string | null }) {
  const sides = sidesOf(report)
  const last = report.lastMonth.status === 'compared' ? report.lastMonth : null
  const lines = (pick: 'income' | 'spent' | 'saved'): string[] => {
    const out: string[] = []
    if (last !== null) out.push(`${sides.before}: ${formatCents(last[pick].change.beforeCents)} · ${formatChange(last[pick].change)}`)
    const usual: Change | undefined = report.usual?.[pick]
    if (usual !== undefined) out.push(`Your usual month: ${formatCents(usual.beforeCents)} · ${formatChange(usual)}`)
    return out
  }
  const { totals } = report
  return (
    <Section title="Income, Spent and Saved">
      <p className="text-muted-foreground">
        {last === null ? sides.now : `${sides.now}, against ${sides.before}`}
      </p>
      {report.status === 'partly_recorded' && historyStart !== null ? (
        <p>Your records start on {formatDayMonth(historyStart)}, so this month is only partly recorded.</p>
      ) : null}
      {report.lastMonth.status === 'before_records' ? (
        <p className="text-muted-foreground">
          Your records start {historyStart === null ? 'later' : `on ${formatDayMonth(historyStart)}`}, so there is no {formatMonthName(report.lastMonth.window.from)} to compare with yet.
        </p>
      ) : null}
      <dl className="divide-y">
        <Figure label="Income" now={totals.incomeCents} lines={lines('income')} />
        <Figure label="Spent" now={totals.spentCents} lines={lines('spent')} />
        <Figure label="Saved" now={totals.savedCents} lines={lines('saved')} />
      </dl>
      <p>
        {totals.savingsRateBp === null
          ? 'Nothing came in, so there is no savings rate.'
          : `You saved ${formatBasisPoints(totals.savingsRateBp)} of what came in.`}
      </p>
      {report.status === 'so_far' ? <p className="text-muted-foreground">Your usual month is set beside a whole month, once this one is over.</p> : null}
    </Section>
  )
}

function MoverRow({ mover, name, soFar }: { mover: Mover; name: string; soFar: boolean }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium" title={name}>
          {name}
        </span>
        <span className="tnum whitespace-nowrap font-semibold">{formatCents(mover.nowCents)}</span>
      </div>
      <p className="text-muted-foreground">
        {formatChange({ changeCents: mover.changeCents, direction: mover.changeCents > 0 ? 'more' : 'less' })} than {soFar ? 'usual by this day' : 'usual'} ({formatCents(mover.usualCents)})
      </p>
    </li>
  )
}

/** The three largest rises and falls against the usual month (F36), or why there are none. */
export function MoversCard({ report, nameOf }: { report: Reviewed; nameOf: (id: string) => string }) {
  const { up, down } = report.movers
  const soFar = report.status === 'so_far'
  const list = (title: string, movers: readonly Mover[]) =>
    movers.length === 0 ? null : (
      <div>
        <h3 className="font-medium">{title}</h3>
        <ul className="divide-y">
          {movers.map((m) => (
            <MoverRow key={m.categoryId} mover={m} name={nameOf(m.categoryId)} soFar={soFar} />
          ))}
        </ul>
      </div>
    )
  return (
    <Section title="Biggest changes">
      {report.usualMonths === 0 ? (
        <p>Your usual month needs a whole month of records before this one. Check back next month.</p>
      ) : up.length + down.length === 0 ? (
        <p>Nothing moved far from its usual month. A steady month.</p>
      ) : (
        <>
          {list('More than usual', up)}
          {list('Less than usual', down)}
        </>
      )}
      {report.usualMonths === 0 ? null : (
        <p className="text-muted-foreground">
          Against your usual month over {report.usualMonths === 1 ? 'the month' : `the ${report.usualMonths} months`} before, Variable expenses only.
        </p>
      )}
    </Section>
  )
}

/** Each Variable category this month beside last (F36), as bars and as a list of the same figures. */
export function PairsCard({ report, nameOf }: { report: Reviewed; nameOf: (id: string) => string }) {
  const sides = sidesOf(report)
  if (report.lastMonth.status !== 'compared') return null
  const rows = report.pairs.map((p) => ({ ...p, name: nameOf(p.categoryId) }))
  return (
    <Section title="This month and last, by category">
      {rows.length === 0 ? (
        <p>No Variable expenses in either month.</p>
      ) : (
        <>
          <SvgChart
            svg={pairedBars({
              id: 'report-pairs',
              title: `${sides.now} against ${sides.before}, by category`,
              description: rows.map((r) => `${r.name}: ${formatCents(r.nowCents)}, then ${formatCents(r.beforeCents)}`).join('. '),
              nowName: sides.now,
              beforeName: sides.before,
              rows: rows.map((r) => ({ label: r.name, nowText: formatCents(r.nowCents), beforeText: formatCents(r.beforeCents), nowBp: r.nowBp, beforeBp: r.beforeBp })),
            })}
            className="mx-auto max-w-md"
          />
          {/* The list has no key of its own, so it says which figure is which. */}
          <p className="text-muted-foreground">
            Each row: {sides.now}, then {sides.before}.
          </p>
          <dl className="divide-y">
            {rows.map((r) => (
              <div key={r.categoryId} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="min-w-0 truncate" title={r.name}>
                  {r.name}
                </dt>
                <dd className="tnum whitespace-nowrap">
                  {formatCents(r.nowCents)} · {formatCents(r.beforeCents)}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Section>
  )
}
