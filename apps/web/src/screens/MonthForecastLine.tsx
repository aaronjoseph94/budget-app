import { useMemo, useState } from 'react'
import { isoDate, monthBounds, monthEndForecast } from '@budget/core'
import { useAppData } from '../app-data.js'
import { useCoachRead } from '../coach/facts.js'
import { forecastInput } from '../forecast/figures.js'
import { formatDayMonth, formatWholeDollars } from '../format.js'
import { hashOf } from '../nav.js'
import { SENTENCE_LINK } from '../components/ui/link.js'

/**
 * The Month's forecast line (plan §2.2, D27): where this month is heading
 * (F30), labelled "Forecast" so it is never mistaken for the workbook's End
 * of month (F7) above it, with ⓘ saying how the two differ. Its own chunk,
 * loaded after the Month draws, reading the year the Coach reads, inside
 * an error boundary: when anything it needs is missing, it is simply not
 * there, and the Month is unchanged. It formats core's figures only.
 */
export default function MonthForecastLine() {
  const read = useCoachRead()
  const { categories } = useAppData()
  const [open, setOpen] = useState(false)
  // An engine refusal throws here, during render, for the boundary to catch.
  const forecast = useMemo(() => {
    if (read === null || read === 'failed' || read.forecast?.status !== 'ready') return null
    return monthEndForecast(forecastInput(read, read.forecast, categories))
  }, [read, categories])
  if (forecast === null || read === null || read === 'failed') return null
  const last = formatDayMonth(monthBounds(isoDate(read.asOf)).end)
  const { end } = forecast
  const figure =
    forecast.checkBackOn !== null ? `check back on ${formatDayMonth(forecast.checkBackOn)}` : end === null ? null : `about ${formatWholeDollars(end.mid)} by ${last}`
  if (figure === null) return null
  return (
    <div className="mt-3 border-t border-summary-label/30 pt-3 text-sm text-summary-value">
      <p className="flex flex-wrap items-center gap-x-1">
        <a href={hashOf({ screen: 'forecast', param: null })} className="inline-flex min-h-11 flex-wrap items-center gap-x-1 underline-offset-4 hover:underline">
          <span className="font-medium">Forecast:</span>{' '}<span className="tnum font-semibold">{figure}</span>
        </a>
        <button
          type="button"
          aria-label="How the forecast differs from End of month"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-11 items-center justify-center rounded-full text-base outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
        >
          ⓘ
        </button>
      </p>
      {open ? (
        <p className="text-summary-label">
          End of month counts what has happened and your planned bills. The forecast adds pay still due and your usual spending.{' '}
          <a href={hashOf({ screen: 'help', param: 'coach' })} className={SENTENCE_LINK}>
            Coach, Ask and the forecast
          </a>
        </p>
      ) : null}
    </div>
  )
}
