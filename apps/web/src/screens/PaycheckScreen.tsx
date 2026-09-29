import { useEffect, useState } from 'react'
import { useAppData } from '../app-data.js'
import { listPaySchedules, type PayScheduleRow } from '../ledger.js'
import { navigate } from '../nav.js'
import { Alert, Loading } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { NativeSelect } from '../components/ui/form.js'
import { PaycheckPeriod } from './PaycheckPeriod.js'
import { PeriodSwitch } from './PeriodSwitch.js'
import { HelpButton } from '../help/HelpButton.js'
import { MonthTitle } from '../components/ui/type.js'

/**
 * The workbook's Paycheck Budget (S15b): the pay period of an income source with a
 * schedule (F15 B). `day` is the address's `YYYY-MM-DD`, or null for
 * today's period. With several sources on schedules, the owner picks which
 * one's paydays the periods follow; with none, the screen says where to set
 * one.
 */
export function PaycheckScreen({ day }: { day: string | null }) {
  const { supabase, categories, loadError, version } = useAppData()
  const [schedules, setSchedules] = useState<readonly PayScheduleRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  useEffect(() => {
    if (version === 0) return
    let live = true
    listPaySchedules(supabase, 'paycheck')
      .then((rows) => {
        if (!live) return
        setSchedules(rows)
        setError(null)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'When you are paid could not be read.'))
    return () => {
      live = false
    }
  }, [supabase, version])

  // Income sources only, in Setup's order. 0011 refuses a schedule anywhere
  // else, but not moving an income source that has one to another list
  // (N27); a schedule left behind on, say, a savings fund pays nobody.
  const paid = categories
    .filter((c) => c.kind === 'income')
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .flatMap((source) => {
      const row = schedules?.find((s) => s.category_id === source.id)
      return row === undefined ? [] : [{ source, row }]
    })
  const driving = paid.find((p) => p.source.id === chosen) ?? paid[0]

  return (
    <div className="space-y-4">
      {/* First, so it is there while the schedule loads, fails or is missing. */}
      <PeriodSwitch current="paycheck" />
      {/* The period's own header names it once it is found; until then,
        when when you are paid could not be read, and with no schedule, the
        screen keeps its title for a screen reader to land on (N116). One
        header in one place, so a help sheet opened while it loads stays. */}
      {driving === undefined ? (
        <div className="flex flex-wrap items-center gap-1">
          <MonthTitle>Paycheck</MonthTitle>
          <HelpButton screen="paycheck" className="text-muted-foreground" />
        </div>
      ) : null}
      {error !== null ? <Alert tone="error" title="Could not load when you are paid">{error}</Alert> : null}
      {/* A first load that failed is said above the screen, by App, as on the Month. */}
      {schedules === null && error === null && (version > 0 || loadError === null) ? (
        <Loading what="when you are paid" />
      ) : null}
      {schedules !== null && driving === undefined ? <NoSchedule /> : null}
      {driving !== undefined ? (
        <PaycheckPeriod
          day={day}
          source={driving.source}
          row={driving.row}
          chooser={
            paid.length > 1 ? (
              // Beside the card's heading, as Mockup A draws it; on its tint the
              // words take canvas-muted. The field fills a 12rem box, as it fills
              // any box it is given, and keeps its 44px height.
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-canvas-muted">Pay periods from</span>
                <span className="w-48 max-w-full">
                  <NativeSelect value={driving.source.id} onChange={(e) => setChosen(e.target.value)} className="text-sm">
                    {paid.map(({ source }) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </NativeSelect>
                </span>
              </label>
            ) : null
          }
        />
      ) : null}
    </div>
  )
}

/** With no income source paid on a schedule there is no period: said plainly, with the way there. */
function NoSchedule() {
  return (
    <section aria-label="Paycheck" className="space-y-3 rounded-xl border bg-card p-4 md:px-6 md:py-5">
      <p className="text-sm">
        This shows your budget one pay period at a time. It needs to know when you are paid: in Setup, give an Income
        row how often it pays and a first payday.
      </p>
      <Button onClick={() => navigate('setup')}>Open Setup</Button>
    </section>
  )
}
