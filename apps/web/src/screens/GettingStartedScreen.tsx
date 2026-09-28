import { useEffect, useRef, useState, type RefObject } from 'react'
import { putOffStep, setupProgress, type SetupCheck, type SetupProgress } from '@budget/core'
import { useAppData } from '../app-data.js'
import { saveSetupMarks, type SetupMarks } from '../profile.js'
import { useSetupChecks } from '../start/checks.js'
import { STEP_IDS, STEP_WORDS, type StepId } from '../start/steps.js'
import { StepBody } from '../start/StepBody.js'
import { Finish } from '../start/Finish.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { HelpButton } from '../help/HelpButton.js'
import { hashOf } from '../nav.js'
import { cn } from '../lib/cn.js'

/**
 * Getting started (`#/start`, plan §8.1): one step per screen, each with
 * the real control on it, Continue and Do this later. Whether a step is
 * done is read from the data every time (checks.ts); the order, the count
 * and the next step are core's (setupProgress, F49). Only the steps put
 * off are kept, in the sign-in's user_metadata (profile.ts), so they
 * follow the owner to another device. The step showing is this screen's
 * alone; the address stays `#/start`.
 */
export function GettingStartedScreen() {
  const { supabase, displayName, setupMarks } = useAppData()
  // Getting started's own copy, shown at once after a save; the sign-in's
  // copy catches up when Supabase says the user changed.
  const [marks, setMarks] = useState<SetupMarks>(setupMarks)
  const { checks } = useSetupChecks({ name: displayName, phoneTicked: marks.phoneTicked })
  const checked = STEP_IDS.every((id) => checks[id] !== null)
  const progress = setupProgress({ steps: STEP_IDS.map((id) => ({ id, check: checks[id] ?? 'unknown' })), later: marks.later })
  const [at, setAt] = useState<StepId | 'end' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // The first step shown is the first not done, once every answer is in.
  if (at === null && checked) setAt(progress.next === null ? 'end' : stepOf(progress.next))

  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    // Each new step is read from its title, as a new screen is (FE-13).
    if (moved.current) heading.current?.focus()
  }, [at])

  const order = progress.steps.map((s) => stepOf(s.id))
  const go = (to: StepId | 'end') => {
    moved.current = true
    setProblem(null)
    setAt(to)
    window.scrollTo({ top: 0 })
  }
  const after = (id: StepId) => order[order.indexOf(id) + 1] ?? 'end'

  const later = async (id: StepId) => {
    const next = putOffStep({ later: marks.later, id }).later
    try {
      await saveSetupMarks(supabase, { later: next })
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'That was not saved. Try again.')
      return
    }
    // The step after it in the order before it moved.
    go(after(id))
    setMarks((m) => ({ ...m, later: next }))
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Getting started</h1>
        <HelpButton screen="start" />
      </div>
      {at === null ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          Checking what is set up…
        </p>
      ) : at === 'end' ? (
        <End progress={progress} headingRef={heading} onGo={go} />
      ) : (
        <>
          <StepBar progress={progress} at={at} />
          <section aria-labelledby="start-step" className="space-y-3">
            <h2 id="start-step" ref={heading} tabIndex={-1} className="text-2xl font-semibold leading-tight tracking-tight outline-none">
              {STEP_WORDS[at].title}
            </h2>
            <p className="text-base text-muted-foreground">{STEP_WORDS[at].why}</p>
            <CheckLine check={checks[at]} />
            <StepBody id={at} />
          </section>
          {problem !== null ? <Alert tone="error">{problem}</Alert> : null}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button size="lg" onClick={() => go(after(at))}>
              {after(at) === 'end' ? 'Finish' : 'Continue'}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => void later(at)}>
              Do this later
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Nothing breaks if you stop here. You can come back any time from More.</p>
          <AllSteps progress={progress} at={at} onGo={go} />
        </>
      )}
    </div>
  )
}

/** A step id from core, which hands back the ids it was given. */
function stepOf(id: string): StepId {
  const step = STEP_IDS.find((s) => s === id)
  if (step === undefined) throw new RangeError(`Getting started has no step ${id}`)
  return step
}

/** "Step 3 of 9 · about 2 minutes", and a mark for each step, filled when done. */
function StepBar({ progress, at }: { progress: SetupProgress; at: StepId }) {
  const step = progress.steps.find((s) => s.id === at)
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Step {step?.position} of {progress.total} · {STEP_WORDS[at].time}
      </p>
      <ol aria-label={`${progress.done} of ${progress.total} done`} className="flex gap-1">
        {progress.steps.map((s) => (
          <li
            key={s.id}
            aria-hidden="true"
            className={cn(
              'h-1.5 flex-1 rounded-full',
              s.check === 'done' ? 'bg-primary' : 'bg-muted',
              s.id === at && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
            )}
          />
        ))}
      </ol>
    </div>
  )
}

const CHECK_SAID: Readonly<Record<SetupCheck, string>> = {
  done: 'Done',
  not_done: 'Not done yet',
  unknown: 'Can’t check this yet',
}

/** Whether this step is done, as the data says now. */
function CheckLine({ check }: { check: SetupCheck | null }) {
  if (check === null) return <p className="text-sm text-muted-foreground">Checking…</p>
  return (
    <div className="space-y-1">
      <p className={cn('flex items-center gap-1.5 text-sm font-medium', check === 'done' ? 'text-income' : 'text-muted-foreground')}>
        {check === 'done' ? <Icon name="check" className="size-4" /> : null}
        {CHECK_SAID[check]}
      </p>
      {check === 'unknown' ? (
        <p className="text-sm text-muted-foreground">
          This part could not be read just now. If it keeps saying so, a one-time update may be missing:{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className="font-medium underline underline-offset-4">
            One-time updates
          </a>
          .
        </p>
      ) : null}
    </div>
  )
}

/** Every step, to jump to any of them: no one has to go in order. */
function AllSteps({ progress, at, onGo }: { progress: SetupProgress; at: StepId; onGo: (to: StepId) => void }) {
  return (
    <details className="rounded-xl border bg-card px-4 shadow-sm">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
        All {progress.total} steps · {progress.done} done
      </summary>
      <ol className="divide-y pb-2">
        {progress.steps.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={s.id === at ? 'step' : undefined}
              onClick={() => onGo(stepOf(s.id))}
              className="flex min-h-11 w-full items-center gap-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true" className={cn('w-4 shrink-0 text-center', s.check === 'done' ? 'text-income' : 'text-muted-foreground')}>
                {s.check === 'done' ? '✓' : s.check === 'unknown' ? '?' : '·'}
              </span>
              <span className={cn('min-w-0 flex-1', s.id === at && 'font-semibold')}>{STEP_WORDS[stepOf(s.id)].title}</span>
              <span className="sr-only">: {CHECK_SAID[s.check]}</span>
              {s.later ? <span className="text-xs text-muted-foreground">Later</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </details>
  )
}

/** Past the last step: the celebration when all nine are done, else what is left. */
function End({
  progress,
  headingRef,
  onGo,
}: {
  progress: SetupProgress
  headingRef: RefObject<HTMLHeadingElement | null>
  onGo: (to: StepId) => void
}) {
  if (progress.finished) return <Finish headingRef={headingRef} />
  const left = progress.steps.filter((s) => s.check !== 'done')
  return (
    <section aria-labelledby="start-end" className="space-y-3">
      <h2 id="start-end" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        {progress.done} of {progress.total} done
      </h2>
      <p className="text-base text-muted-foreground">
        Everything you set up is working now. The rest can wait: the app works with what it has, and says what it is missing.
      </p>
      <ul className="divide-y rounded-xl border bg-card px-4 shadow-sm">
        {left.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onGo(stepOf(s.id))}
              className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">{STEP_WORDS[stepOf(s.id)].title}</span>
              <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <a href={hashOf({ screen: 'month', param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
        Open the Month
      </a>
    </section>
  )
}
