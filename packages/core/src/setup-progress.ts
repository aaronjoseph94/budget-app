/**
 * Getting started's progress (F49, docs/formula-decisions.md; plan §8.1,
 * slice A25).
 *
 * NOT workbook-derived: START HERE has no progress. Whether each step is
 * done is read from the owner's data every time and never stored, so a
 * step can never say "done" about something that has since gone. A read
 * that failed is "can't check yet", which is never counted as done. The
 * only thing kept is the order the owner chose, by putting steps off.
 */

/** Done, not done, or can't check yet: the read failed, or needs a one-time update. */
export type SetupCheck = 'done' | 'not_done' | 'unknown'

export interface SetupStepInput {
  readonly id: string
  readonly check: SetupCheck
}

export interface SetupProgressInput {
  /** Every step, in the guide's own order. */
  readonly steps: readonly SetupStepInput[]
  /** The steps put off with Do this later, in the order they were put off. An id the guide does not have is passed over. */
  readonly later: readonly string[]
}

export interface SetupStep extends SetupStepInput {
  /** Put off with Do this later, so it sits at the end. */
  readonly later: boolean
  /** Where it is walked, from 1: "Step 3 of 9". */
  readonly position: number
}

export interface SetupProgress {
  /** In the order they are walked: the guide's, then those put off. */
  readonly steps: readonly SetupStep[]
  readonly done: number
  readonly total: number
  /** The first step not done, "can't check yet" included; null when all are done. */
  readonly next: string | null
  readonly finished: boolean
}

export function setupProgress(input: SetupProgressInput): SetupProgress {
  const ids = new Set<string>()
  for (const step of input.steps) {
    if (ids.has(step.id)) throw new RangeError(`Getting started names step ${step.id} twice`)
    ids.add(step.id)
  }
  // Each once, where it was last put off, as putOffStep keeps them.
  const later = input.later.filter((id, i) => ids.has(id) && input.later.lastIndexOf(id) === i)
  const put = new Set(later)
  const byId = new Map(input.steps.map((s) => [s.id, s]))
  const walked = [
    ...input.steps.filter((s) => !put.has(s.id)).map((s) => ({ ...s, later: false })),
    ...later.map((id) => ({ ...byId.get(id)!, later: true })),
  ]
  const steps: SetupStep[] = walked.map((s, i) => ({ ...s, position: i + 1 }))
  const done = steps.filter((s) => s.check === 'done').length
  const next = steps.find((s) => s.check !== 'done')
  return { steps, done, total: steps.length, next: next === undefined ? null : next.id, finished: next === undefined }
}

export interface PutOffStepInput {
  /** The steps already put off, in the order they were. */
  readonly later: readonly string[]
  readonly id: string
}

/** Do this later: the step goes to the back of the line, even one already put off. */
export function putOffStep(input: PutOffStepInput): { readonly later: readonly string[] } {
  return { later: [...input.later.filter((id) => id !== input.id), input.id] }
}
