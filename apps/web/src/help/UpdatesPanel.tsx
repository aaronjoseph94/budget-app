import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/cn.js'
import { CopyFile, isCopyable } from './CopyFile.js'
import { FIRST_FILE, HELPER_FILE, READ_RECEIPT_FILE, SIGNUPS_OFF, checkUpdates, nextStep, type Checked } from './updates.js'
import { LINE_LINK } from '../components/ui/link.js'

/** The repository's files on GitHub. */
const REPO = 'https://github.com/aaronjoseph94/budget-app/blob/main/'
/** Where each committed file can be opened and copied (HANDOFF §3, step 1); null for a step with no committed file. */
const sourceOf = (file: string) =>
  file === HELPER_FILE ? `${REPO}supabase/functions/ai/index.ts` : file.endsWith('.sql') ? `${REPO}supabase/migrations/${file}` : null

/**
 * The exact clicks for the AI helper, which goes in the Edge Functions
 * editor, not the SQL Editor (plan §10.2), first or over an older copy
 * (N78). Its gateway check stays off: the helper checks every caller itself.
 */
function helperSteps(again: boolean): string[] {
  const check = 'Turn Enforce JWT verification off'
  return again
    ? ['In Supabase, open Edge Functions, then the function named ai, then its code.', 'Paste the new version over everything in the editor.', `${check}, and deploy it.`]
    : [
        'In Supabase, open Edge Functions, then Deploy a new function, then Via Editor.',
        'Name it exactly ai.',
        'Paste the helper over everything in the editor.',
        `${check}, and press Deploy. The helper checks every caller itself.`,
      ]
}

/**
 * Allow new users to sign up, off (backend-b-06): the switch's place moved
 * between dashboard versions, so the older names are given too.
 */
const SIGNUPS_STEPS = [
  'In Supabase, open Authentication, then Sign In / Providers. On an older dashboard, look under Authentication: Providers, then Email; or Settings.',
  'Turn off Allow new users to sign up, and press Save.',
  'Open Authentication, then Users, and delete any row that is not you.',
  'Press Check again.',
]

/** read-receipt from before 2026-10-01: deleted, as the helper reads receipts, or replaced. */
const READ_RECEIPT_STEPS = [
  'In Supabase, open Edge Functions, then read-receipt, then its ⋯ menu, and press Delete.',
  'Or keep it: paste the new version from Copy below over its code, and deploy.',
]

const MARK = {
  in: { sign: '✓', said: 'In', tone: 'text-income' },
  missing: { sign: '✗', said: 'Not in yet', tone: 'text-spend' },
  old: { sign: '✗', said: 'An older copy', tone: 'text-spend' },
  unknown: { sign: '?', said: 'Could not check', tone: 'text-muted-foreground' },
} as const

/**
 * One-time updates' live check (plan §8.2): a ✓ or ✗ on each update, how
 * many are in, the one thing to do next, and Check again. Only the newest
 * check is shown, so a slow answer to an earlier press never overwrites a
 * later one.
 */
export function UpdatesPanel() {
  const { supabase } = useAppData()
  const [checked, setChecked] = useState<readonly Checked[] | null>(null)
  const [busy, setBusy] = useState(true)
  const latest = useRef(0)

  const check = useCallback(async () => {
    const run = ++latest.current
    setBusy(true)
    const result = await checkUpdates(supabase)
    if (run !== latest.current) return
    setChecked(result)
    setBusy(false)
  }, [supabase])

  useEffect(() => {
    void check()
    // Leaving the page makes any answer still on its way stale.
    return () => void ++latest.current
  }, [check])

  const count = checked?.filter((c) => c.state === 'in').length
  const next = checked === null ? null : nextStep(checked)
  const helperOld = checked?.some((c) => c.update.file === HELPER_FILE && c.state === 'old') === true
  const source = next?.kind === 'paste' ? sourceOf(next.file) : null
  return (
    <section aria-labelledby="updates-status" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id="updates-status" className="font-semibold" aria-live="polite">
        {checked === null ? 'Checking…' : next?.kind === 'done' ? 'All done' : `${count} of ${checked.length} in`}
      </h2>
      {checked === null ? null : (
        <ul className="space-y-2 text-sm">
          {checked.map((c) => (
            <li key={c.update.file} className="flex gap-2">
              <span aria-hidden="true" className={cn('w-4 shrink-0 text-center font-bold', MARK[c.state].tone)}>
                {MARK[c.state].sign}
              </span>
              <span className="min-w-0">
                <span className="sr-only">{MARK[c.state].said}: </span>
                <span className={cn('block [overflow-wrap:anywhere]', c.update.name === undefined && 'font-mono text-xs')}>{c.update.name ?? c.update.file}</span>
                <span className="block text-muted-foreground">
                  {c.update.adds}
                  {c.state === 'old' ? ': an older copy is in' : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {next === null || next.kind === 'done' ? null : (
        <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
          {next.kind === 'unknown' ? (
            <p>Some could not be checked. Check your connection, then press Check again.</p>
          ) : next.file === SIGNUPS_OFF ? (
            <>
              <p>Next: stop strangers making an account. About 2 minutes, on a computer.</p>
              <Steps steps={SIGNUPS_STEPS} />
            </>
          ) : next.file === HELPER_FILE ? (
            <>
              <p>
                {helperOld
                  ? 'Next: paste the AI helper’s new version over the one you have. About 5 minutes, easiest on a computer.'
                  : 'Next: install the AI helper. About 5 minutes, easiest on a computer.'}
              </p>
              <Steps steps={helperSteps(helperOld)} />
            </>
          ) : next.file === READ_RECEIPT_FILE ? (
            <>
              <p>Next: delete read-receipt, or paste its new version over it. About 2 minutes, on a computer.</p>
              <Steps steps={READ_RECEIPT_STEPS} />
            </>
          ) : (
            <>
              <p>
                Next: paste <span className="font-mono text-xs [overflow-wrap:anywhere]">{next.file}</span>, then each file
                after it in number order, one at a time.
              </p>
              {next.fromStart ? (
                <p>{FIRST_FILE} is the first. A file pasted twice is refused, or runs again to the same result. Either way, no harm.</p>
              ) : null}
            </>
          )}
          {next.kind === 'paste' && isCopyable(next.file) ? <CopyFile key={next.file} file={next.file} /> : null}
          {next.kind === 'paste' && source !== null ? (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className={LINE_LINK}
            >
              Open {next.file === HELPER_FILE ? 'the AI helper' : next.file} on GitHub
            </a>
          ) : null}
          {next.kind === 'paste' && next.file === HELPER_FILE ? (
            <>
              <p>
                If Edge Functions also lists read-receipt, replace it the same way, or delete it. The AI helper reads receipts
                without it. Its older copy lets anyone with the app’s public key use your Gemini key.
              </p>
              <CopyFile file={READ_RECEIPT_FILE} />
              <a
                href={`${REPO}supabase/functions/read-receipt/index.ts`}
                target="_blank"
                rel="noopener noreferrer"
                className={LINE_LINK}
              >
                Open read-receipt on GitHub
              </a>
            </>
          ) : null}
        </div>
      )}
      {/* aria-disabled, not disabled, while it checks: disabled drops focus (FE-6, e2e-setup-01). */}
      <Button variant="outline" aria-disabled={busy} onClick={() => {
        if (!busy) void check()
      }}>
        {busy ? 'Checking…' : 'Check again'}
      </Button>
    </section>
  )
}

/** A one-time update's steps, numbered. */
function Steps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  )
}
