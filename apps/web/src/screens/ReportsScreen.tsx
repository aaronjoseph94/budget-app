import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { isoDate, shiftMonth } from '@budget/core'
import { useAppData } from '../app-data.js'
import { formatMonthTitle, todayIso } from '../format.js'
import { hashOf } from '../nav.js'
import { Badge } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { HelpButton } from '../help/HelpButton.js'
import { MonthTitle } from '../components/ui/type.js'
import { reportOf, useReportRead, type ReportFigures } from '../reports/read.js'
import { MoversCard, PairsCard, TotalsCard } from '../reports/Overview.js'
import { ReviewCard } from '../reports/ReviewCard.js'
import { Failed } from '../reports/Failed.js'
import { TrendsPanel } from '../reports/Trends.js'
import { ShopsPanel } from '../reports/Shops.js'
import { HabitsPanel } from '../reports/Habits.js'
import { DownloadCard } from '../reports/Download.js'
import { rememberTab, rememberedTab, type ReportTab } from '../reports/tab.js'
import { cn } from '../lib/cn.js'

const TABS: readonly { readonly id: ReportTab; readonly name: string }[] = [
  { id: 'overview', name: 'Overview' },
  { id: 'trends', name: 'Trends' },
  { id: 'shops', name: 'Shops' },
  { id: 'habits', name: 'Habits' },
]

/**
 * Reports (plan §2.6, A15 to A18): a month in review, any month, the
 * current one marked "so far"; Trends over the whole months before this
 * one, and Habits to today, neither with a month to step through; and
 * Shops, for the month shown. Every figure is core's monthReport (F36); the
 * screen formats and never computes. Save as PDF is the browser's own
 * print, with the bars and buttons left off the page and the figures on it;
 * Download CSV (A19) writes the month's charges or those figures to a file.
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
  const [tab, setTab] = useState<ReportTab>(rememberedTab)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  // Trends and Habits read to today whatever month is shown, so the arrows step aside, and "So far" with them.
  const monthless = tab === 'trends' || tab === 'habits'
  const choose = (next: ReportTab) => {
    setTab(next)
    rememberTab(next)
  }
  // The arrow keys, Home and End choose along the tabs, as Add's do (design review, Accessibility).
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const at = TABS.findIndex((t) => t.id === tab)
    const to =
      e.key === 'ArrowRight' ? (at + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (at + TABS.length - 1) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : null
    const next = to === null ? undefined : TABS[to]
    if (next === undefined) return
    e.preventDefault()
    choose(next.id)
    tabs.current[to!]?.focus()
  }
  const stepLink = 'inline-flex size-11 items-center justify-center outline-none first:rounded-l-md last:rounded-r-md hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring print:invisible'

  // Mockup A's title row: the title, its ? and "So far"; on the right the
  // month stepper and Save as PDF. Everything wraps, so a phone drops the
  // controls under the title rather than scrolling sideways. The month's
  // name stays a heading in full, as the printed page's title.
  return (
    <div className="space-y-4 xl:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <MonthTitle>Reports</MonthTitle>
          <HelpButton screen="reports" />
          {shown === thisMonth && !monthless ? <Badge variant="accent">So far</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Month" className={cn('flex items-stretch rounded-md border bg-card print:border-0', monthless && 'hidden')}>
            <a href={hashOf({ screen: 'reports', param: step(-1) })} aria-label="Previous month" className={stepLink}>
              <Icon name="chevronLeft" className="size-4" />
            </a>
            <h2 className="tnum flex items-center border-x px-3.5 text-[0.9375rem] font-medium whitespace-nowrap print:border-0">{formatMonthTitle(shown)}</h2>
            {shown < thisMonth ? (
              <a href={hashOf({ screen: 'reports', param: step(1) })} aria-label="Next month" className={stepLink}>
                <Icon name="chevronRight" className="size-4" />
              </a>
            ) : (
              // A dimmed chevron, as the Week's and Pay's steppers show at the latest (V15).
              <span aria-hidden="true" className="flex size-11 items-center justify-center opacity-40 print:invisible">
                <Icon name="chevronRight" className="size-4" />
              </span>
            )}
          </nav>
          {/* The browser's own print makes the PDF: nothing is loaded and nothing leaves the phone. */}
          <Button variant="outline" onClick={() => window.print()} className="print:hidden">
            Save as PDF
          </Button>
        </div>
      </header>
      {/* Mockup A's segmented control, as the Views switch draws it: the four on
        the canvas grey, the one showing lifted onto the card; words on the
        canvas take canvas-muted (ADR 0010). One tab stop, the chosen one. */}
      <div className="edge-fade -mx-1 overflow-x-auto px-1 print:hidden">
        <div role="tablist" aria-label="Report" className="grid w-full min-w-max grid-cols-4 gap-1 rounded-md bg-canvas p-1 sm:inline-grid sm:w-auto">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabs.current[i] = el
              }}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`report-${t.id}`}
              id={`report-tab-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => choose(t.id)}
              onKeyDown={onKey}
              className={cn(
                'min-h-11 rounded-sm px-2 text-sm font-medium outline-none sm:min-w-22 sm:px-4 transition-colors focus-visible:ring-[3px] focus-visible:ring-ring',
                tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-canvas-muted hover:text-foreground',
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      {tab === 'trends' ? (
        <div role="tabpanel" id="report-trends" aria-labelledby="report-tab-trends">
          <TrendsPanel asOf={asOf} />
        </div>
      ) : tab === 'habits' ? (
        <div role="tabpanel" id="report-habits" aria-labelledby="report-tab-habits">
          <HabitsPanel asOf={asOf} />
        </div>
      ) : tab === 'shops' ? (
        <div role="tabpanel" id="report-shops" aria-labelledby="report-tab-shops">
          <ShopsPanel month={shown} asOf={asOf} />
        </div>
      ) : (
      <div role="tabpanel" id="report-overview" aria-labelledby="report-tab-overview" className="space-y-4 xl:space-y-5">
        {figures === 'loading' ? <p className="text-sm text-muted-foreground">Working out your month…</p> : null}
        {figures === 'failed' ? <Failed missingUpdate={read.status === 'failed' && read.missingUpdate} /> : null}
        {typeof figures === 'object' ? (
          <Overview {...figures} nameOf={nameOf}>
            {'totals' in figures.report && read.status === 'ready' ? (
              <DownloadCard report={figures.report} rows={read.rows.rows} categories={categories} nameOf={nameOf} />
            ) : null}
          </Overview>
        ) : null}
      </div>
      )}
    </div>
  )
}

/** The review across the top, then the sections two across from 1280px, in the order a phone reads them (Mockup A). */
function Overview({ report, historyStart, nameOf, children }: ReportFigures & { nameOf: (id: string) => string; children: ReactNode }) {
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
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2 xl:gap-5">
        <TotalsCard report={report} historyStart={historyStart} />
        <MoversCard report={report} nameOf={nameOf} />
        <PairsCard report={report} nameOf={nameOf} />
        {children}
      </div>
    </>
  )
}
