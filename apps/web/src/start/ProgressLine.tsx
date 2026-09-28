import { setupProgress } from '@budget/core'
import { useAppData } from '../app-data.js'
import { useSetupChecks } from './checks.js'
import { STEP_IDS } from './steps.js'

/**
 * "5 of 9 done" (plan §8.1), under Getting started on More and on
 * Settings' card. The fallback while the answers are still read, so it
 * never shows a count about to change; "All done" once all nine are. Its
 * own chunk, so More, in the first load, carries none of the reads.
 */
export function ProgressLine({ fallback }: { fallback: string }) {
  const { displayName, setupMarks } = useAppData()
  const { checks } = useSetupChecks({ name: displayName, phoneTicked: setupMarks.phoneTicked })
  if (STEP_IDS.some((id) => checks[id] === null)) return <>{fallback}</>
  const progress = setupProgress({ steps: STEP_IDS.map((id) => ({ id, check: checks[id] ?? 'unknown' })), later: setupMarks.later })
  return <>{progress.finished ? 'All done' : `${progress.done} of ${progress.total} done`}</>
}
