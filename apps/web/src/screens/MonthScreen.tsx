import { isoDate, monthBounds, shiftMonth } from '@budget/core'
import { navigate } from '../nav.js'
import { formatMonthTitle, todayIso } from '../format.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { MonthTitle } from '../components/ui/type.js'

/**
 * One Workbook month tab (plan §6.2). `month` is the address's `YYYY-MM`, or
 * null for this month; the arrows step through shiftMonth in packages/core
 * and write the month they land on into the address, so a refresh or the
 * back gesture returns to it.
 */
export function MonthScreen({ month }: { month: string | null }) {
  const first = monthBounds(isoDate(month === null ? todayIso() : `${month}-01`)).start
  const step = (months: number) => navigate('month', shiftMonth(first, months).slice(0, 7))

  return (
    <div className="space-y-4">
      <header className="-mx-4 flex items-center justify-between gap-2 bg-title-band px-4 py-4 md:mx-0 md:rounded-xl">
        <MonthTitle>{formatMonthTitle(first)}</MonthTitle>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </Button>
        </div>
      </header>
    </div>
  )
}
