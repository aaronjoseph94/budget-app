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
import { useFourAcross } from '../lib/wide.js'
import { MonthTitle } from '../components/ui/type.js'
import { SENTENCE_LINK } from '../components/ui/link.js'

/**
 * Getting started (`#/start`, plan §8.1): one step per screen, each with
 * the real control on it, Continue and Do this later. Whether a step is
 * done is read from the data every time (checks.ts); the order, the count
 * and the next step are core's (setupProgress, F49). Only the steps put
 * off, a hand-ticked iPhone step and that the guide has been opened are
 * kept, in the sign-in's user_metadata (profile.ts), so they follow the
 * owner to another device.
 * The step showing is this screen's alone; the address stays `#/start`.
 */
export function GettingStartedScreen() {
  const { supabase, displayName, setupMarks } = useAppData()
  // Getting started's own copies, shown at once after a save; the sign-in's
  // copy catches up when Supabase says the user changed.
  const [name, setName] = useState(displayName)
  const [marks, setMarks] = useState<SetupMarks>(setupMarks)
  const [again, setAgain] = useState(0)
  const { checks, ai } = useSetupChecks({ name, phoneTicked: marks.phoneTicked, again })
  const checked = STEP_IDS.every((id) => checks[id] !== null)
  const progress = setupProgress({ steps: STEP_IDS.map((id) => ({ id, check: checks[id] ?? 'unknown' })), later: marks.later })
  const [at, setAt] = useState<StepId | 'end' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // The first step shown is the first not done, once every answer is in.
  if (at === null && checked) setAt(progress.next === null ? 'end' : stepOf(progress.next))

  useEffect(() => {
    if (setupMarks.opened) return
    // So the first sign-in does not open the guide again. Not kept this
    // time, it opens once more at the next sign-in, which does no harm.
    saveSetupMarks(supabase, { opened: true }).catch(() => undefined)
  }, [supabase, setupMarks.opened])

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

  const tick = async (phoneTicked: boolean) => {
    await saveSetupMarks(supabase, { phoneTicked })
    setMarks((m) => ({ ...m, phoneTicked }))
  }

  const stepping = at !== null && at !== 'end'
  const wide = useFourAcross()
  return (
    // From 1280px every step sits beside the step, as Mockup A draws it.
    <div className={cn('mx-auto max-w-3xl pb-4', stepping && 'xl:grid xl:max-w-none xl:grid-cols-[minmax(0,48rem)_19rem] xl:items-start xl:justify-between xl:gap-10')}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1">
          <MonthTitle>Getting started</MonthTitle>
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
            {/* The one hero, white to the accent's tint; on it muted words and a
              field's edge take the greys measured there (ADR 0010). */}
            <section
              aria-labelledby="start-step"
              className="space-y-3 rounded-xl border bg-linear-to-b from-card to-primary-tint p-5 [--input:var(--canvas-muted)] [--muted-foreground:var(--canvas-muted)] sm:p-7"
            >
              <h2 id="start-step" ref={heading} tabIndex={-1} className="text-2xl font-bold leading-tight tracking-tight outline-none sm:text-[1.75rem]">
                {STEP_WORDS[at].title}
              </h2>
              <p className="text-base text-muted-foreground">{STEP_WORDS[at].why}</p>
              <CheckLine check={checks[at]} />
              <StepBody
                id={at}
                name={name}
                onNamed={setName}
                phoneTicked={marks.phoneTicked}
                onTick={tick}
                ai={ai}
                onAiChanged={() => setAgain((n) => n + 1)}
              />
            </section>
            {problem !== null ? <Alert tone="error">{problem}</Alert> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" onClick={() => go(after(at))}>
                {after(at) === 'end' ? 'Finish' : 'Continue'}
              </Button>
              <Button size="lg" variant="ghost" onClick={() => void later(at)}>
                Do this later
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Nothing breaks if you stop here. You can come back any time from More.</p>
            {wide ? null : <AllSteps progress={progress} at={at} onGo={go} open={false} />}
          </>
        )}
      </div>
      {stepping && wide ? <AllSteps progress={progress} at={at} onGo={go} open /> : null}
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
      <p className="text-muted-foreground">
        Step {step?.position} of {progress.total} · {STEP_WORDS[at].time}
      </p>
      {/* Mockup A: the current step a ringed segment, taller than the rest. */}
      <ol aria-label={`${progress.done} of ${progress.total} done`} className="flex h-3 items-center gap-1.5">
        {progress.steps.map((s) => (
          <li
            key={s.id}
            aria-hidden="true"
            className={cn(
              'flex-1 rounded-full',
              s.id === at ? 'h-3 border-2 border-ring' : 'h-1.5',
              s.check === 'done' ? 'bg-primary' : s.id === at ? 'bg-primary-soft' : 'bg-track',
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
          <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
            One-time updates
          </a>
          .
        </p>
      ) : null}
    </div>
  )
}

/** Every step, to jump to any of them: no one has to go in order. */
function AllSteps({ progress, at, onGo, open }: { progress: SetupProgress; at: StepId; onGo: (to: StepId) => void; open: boolean }) {
  // Beside the step (from 1280px) it starts open, and still folds.
  return (
    <details open={open} className="overflow-hidden rounded-xl border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
        All {progress.total} steps · {progress.done} done
      </summary>
      <ol className="divide-y border-t">
        {progress.steps.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={s.id === at ? 'step' : undefined}
              onClick={() => onGo(stepOf(s.id))}
              className={cn(
                'flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                // Muted marks on the tint take canvas-muted: #6b7280 reads 4.27 there (ADR 0010).
                s.id === at && 'bg-primary-tint hover:bg-primary-tint [--muted-foreground:var(--canvas-muted)]',
              )}
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
      <h2 id="start-end" ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
        {progress.done} of {progress.total} done
      </h2>
      <p className="text-base text-muted-foreground">
        Everything you set up is working now. The rest can wait: the app works with what it has, and says what it is missing.
      </p>
      <ul className="divide-y rounded-xl border bg-card px-4">
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
