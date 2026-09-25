import { useCallback, useMemo } from 'react'
import { isoDate, shiftMonth } from '@budget/core'
import { useAppData } from '../app-data.js'
import { formatMonthTitle, todayIso } from '../format.js'
import { hashOf } from '../nav.js'
import { Badge } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { HelpButton } from '../help/HelpButton.js'
import { reportOf, useReportRead, type ReportFigures } from '../reports/read.js'
import { MoversCard, PairsCard, TotalsCard } from '../reports/Overview.js'
import { ReviewCard } from '../reports/ReviewCard.js'

/**
 * Reports (plan §2.6, A15): a month in review, any month, the current one
 * marked "so far". The tab row holds Overview alone until Trends, Shops and
 * Habits land (A16 to A18). Every figure is core's monthReport (F36); the
 * screen formats and never computes. Save as PDF is the browser's own
 * print, with the bars and buttons left off the page and the figures on it.
 */
export function ReportsScreen({ month }: { month: string | null }) {
  const { categories } = useAppData()
  const asOf = todayIso()
  const shown = `${month ?? asOf.slice(0, 7)}-01`
  const read = useReportRead(shown, asOf)
  const figures = useMemo(() => {
    if (read.status !== 'ready') return read.status
    try {
      return reportOf(read.rows, categories)
    } catch {
      return 'failed' as const
    }
  }, [read, categories])
  // Stable while the categories are, so nothing drawn from it is worked out again every render.
  const nameOf = useCallback((id: string) => categories.find((c) => c.id === id)?.name ?? 'a category', [categories])
  const thisMonth = `${asOf.slice(0, 7)}-01`
  const step = (by: number) => shiftMonth(isoDate(shown), by).slice(0, 7)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <HelpButton screen="reports" />
      </div>
      <nav aria-label="Month" className="flex items-center gap-1">
        <a href={hashOf({ screen: 'reports', param: step(-1) })} aria-label="Previous month" className="inline-flex size-11 items-center justify-center rounded-md hover:bg-secondary print:invisible">
          <Icon name="chevronLeft" className="size-5" />
        </a>
        <h2 className="min-w-0 flex-1 text-center text-lg font-semibold">{formatMonthTitle(shown)}</h2>
        {shown < thisMonth ? (
          <a href={hashOf({ screen: 'reports', param: step(1) })} aria-label="Next month" className="inline-flex size-11 items-center justify-center rounded-md hover:bg-secondary print:invisible">
            <Icon name="chevronRight" className="size-5" />
          </a>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Report" className="flex gap-1 overflow-x-auto print:hidden">
          <button type="button" role="tab" aria-selected="true" aria-controls="report-overview" id="report-tab-overview" className="min-h-11 rounded-md bg-secondary px-4 text-sm font-medium">
            Overview
          </button>
        </div>
        {shown === thisMonth ? <Badge>So far</Badge> : null}
        {/* The browser's own print makes the PDF: nothing is loaded and nothing leaves the phone. */}
        <Button variant="outline" onClick={() => window.print()} className="print:hidden">
          Save as PDF
        </Button>
      </div>
      <div role="tabpanel" id="report-overview" aria-labelledby="report-tab-overview" className="space-y-4">
        {figures === 'loading' ? <p className="text-sm text-muted-foreground">Working out your month…</p> : null}
        {figures === 'failed' ? <Failed missingUpdate={read.status === 'failed' && read.missingUpdate} /> : null}
        {typeof figures === 'object' ? <Overview {...figures} nameOf={nameOf} /> : null}
      </div>
    </div>
  )
}

function Failed({ missingUpdate }: { missingUpdate: boolean }) {
  return missingUpdate ? (
    <p className="text-sm">
      Reports need a one-time update.{' '}
      <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
        See One-time updates
      </a>
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">This report did not load. Reload to try again; everything else still works.</p>
  )
}

function Overview({ report, historyStart, nameOf }: ReportFigures & { nameOf: (id: string) => string }) {
  if (!('totals' in report)) {
    return report.status === 'not_started' ? (
      <p className="text-sm">Nothing has happened in this month yet.</p>
    ) : (
      <p className="text-sm">
        Your records start {historyStart === null ? 'once you bring in a statement or add a charge' : 'after this month'}, so there is nothing to review here.
      </p>
    )
  }
  return (
    <>
      <ReviewCard report={report} nameOf={nameOf} />
      <TotalsCard report={report} historyStart={historyStart} />
      <MoversCard report={report} nameOf={nameOf} />
      <PairsCard report={report} nameOf={nameOf} />
    </>
  )
}
