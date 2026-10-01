import { goalProgress, type GoalProgress } from '@budget/core'
import { useAppData } from '../app-data.js'
import { goalSavedCents, useFunds } from '../funds.js'
import { formatBasisPoints, formatCents } from '../format.js'
import { hashOf } from '../nav.js'
import { Icon } from '../components/ui/icons.js'
import { Progress } from '../components/ui/feedback.js'
import { useWide } from '../lib/wide.js'
import { cn } from '../lib/cn.js'
import { RING_INSET } from './marks.js'
import { signOutHere } from '../sign-out.js'

/**
 * The sidebar's foot (ADR 0011): the main goal, from 1024px and unfolded,
 * and the owner's initial, name, email and Sign out. Drawn once the shared
 * data is read, so a failed first load keeps its own Sign out alone.
 */
export function SidebarFoot({ folded }: { folded: boolean }) {
  const wide = useWide()
  return (
    <>
      {wide && !folded ? <MainGoal /> : null}
      <Owner folded={folded} />
    </>
  )
}

/**
 * The main goal, as the Week and the Coach show it: every figure is
 * core's goalProgress, and the saved amount is the goal's fund balance
 * (D16). Read only on a wide screen, so a phone fetches nothing for it.
 */
function MainGoal() {
  const { mainGoal: goal } = useAppData()
  const funds = useFunds()
  if (goal === null) return null
  const savedCents = goalSavedCents(goal, funds)
  let progress: GoalProgress
  try {
    progress = goalProgress({ name: goal.name, targetCents: goal.target_cents, savedCents })
  } catch {
    // A goal with no positive target has no progress to show; Savings says why.
    return null
  }
  return (
    <a
      href={hashOf({ screen: 'savings', param: null })}
      className={cn(RING_INSET, 'flex flex-col gap-2.5 rounded-xl border bg-card p-3.5 transition-colors hover:bg-accent')}
    >
      <span className="flex items-center gap-2">
        <Icon name={goal.unit_cost_cents === null ? 'piggy' : 'plane'} className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{goal.name}</span>
        <span className="tnum text-sm text-muted-foreground">{formatBasisPoints(progress.percentCompleteBasisPoints)}</span>
      </span>
      <Progress basisPoints={progress.percentCompleteBasisPoints} />
      <span className="tnum text-[13px] text-muted-foreground">
        {formatCents(savedCents)} of {formatCents(goal.target_cents)}
      </span>
    </a>
  )
}

function Owner({ folded }: { folded: boolean }) {
  const { displayName, email, supabase } = useAppData()
  const name = displayName.trim()
  const full = folded ? 'hidden' : 'hidden lg:flex'
  return (
    <div className={cn('flex items-center justify-center gap-3 pt-2', !folded && 'lg:justify-start')}>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
        {(name === '' ? email : name).charAt(0).toUpperCase()}
      </span>
      <span className={cn(full, 'min-w-0 flex-1 flex-col')}>
        {name === '' ? null : <span className="truncate text-[15px] font-semibold">{name}</span>}
        <span className="truncate text-[13px] text-canvas-muted">{email}</span>
      </span>
      <button
        type="button"
        aria-label="Sign out"
        onClick={() => void signOutHere(supabase)}
        className={cn(full, RING_INSET, 'size-11 shrink-0 items-center justify-center rounded-md text-canvas-muted hover:bg-card hover:text-foreground')}
      >
        <Icon name="logout" className="size-[18px]" />
      </button>
    </div>
  )
}
