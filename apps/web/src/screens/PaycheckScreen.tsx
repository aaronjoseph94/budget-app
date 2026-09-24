import { useEffect, useState } from 'react'
import { useAppData } from '../app-data.js'
import { listPaySchedules, type PayScheduleRow } from '../ledger.js'
import { navigate } from '../nav.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { NativeSelect } from '../components/ui/form.js'
import { PaycheckPeriod } from './PaycheckPeriod.js'
import { PeriodSwitch } from './PeriodSwitch.js'

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
      {error !== null ? <Alert tone="error" title="Could not load when you are paid">{error}</Alert> : null}
      {/* A first load that failed is said above the screen, by App, as on the Month. */}
      {schedules === null && error === null && (version > 0 || loadError === null) ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : null}
      {schedules !== null && driving === undefined ? <NoSchedule /> : null}
      {driving !== undefined ? (
        <PaycheckPeriod
          day={day}
          source={driving.source}
          row={driving.row}
          chooser={
            paid.length > 1 ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Pay periods from</span>
                <NativeSelect value={driving.source.id} onChange={(e) => setChosen(e.target.value)} className="h-9 text-sm">
                  {paid.map(({ source }) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </NativeSelect>
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
    <section aria-label="Paycheck" className="space-y-3 rounded-xl bg-paycheck-band px-4 py-5 text-paycheck-ink">
      <h1 className="text-2xl font-semibold tracking-tight">Paycheck</h1>
      <p className="text-sm">
        This shows your budget one pay period at a time. It needs to know when you are paid: in Setup, give an Income
        row how often it pays and a first payday.
      </p>
      <Button onClick={() => navigate('setup')}>Open Setup</Button>
    </section>
  )
}
