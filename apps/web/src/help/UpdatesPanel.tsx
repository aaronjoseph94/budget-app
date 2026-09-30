import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/cn.js'
import { CopyFile, isCopyable } from './CopyFile.js'
import { FIRST_FILE, HELPER_FILE, READ_RECEIPT_FILE, checkUpdates, nextStep, type Checked } from './updates.js'

/** Where each committed file can be opened and copied (HANDOFF §3, step 1). */
const REPO = 'https://github.com/aaronjoseph94/budget-app/blob/main/'
const sourceOf = (file: string) => (file === HELPER_FILE ? `${REPO}supabase/functions/ai/index.ts` : `${REPO}supabase/migrations/${file}`)

/** The exact clicks for the AI helper, which goes in the Edge Functions editor, not the SQL Editor (plan §10.2). */
const HELPER_STEPS = [
  'In Supabase, open Edge Functions, then Deploy a new function, then Via Editor.',
  'Name it exactly ai.',
  'Paste the helper over everything in the editor.',
  'Keep Enforce JWT verification on, and press Deploy.',
]

/** Pasting the helper's new version over an older copy (N78). */
const HELPER_AGAIN_STEPS = [
  'In Supabase, open Edge Functions, then the function named ai, then its code.',
  'Paste the new version over everything in the editor.',
  'Keep Enforce JWT verification on, and deploy it.',
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
                <span className="block font-mono text-xs [overflow-wrap:anywhere]">{c.update.file}</span>
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
          ) : next.file === HELPER_FILE ? (
            <>
              <p>
                {helperOld
                  ? 'Next: paste the AI helper’s new version over the one you have. About 5 minutes, easiest on a computer.'
                  : 'Next: install the AI helper. About 5 minutes, easiest on a computer.'}
              </p>
              <ol className="list-decimal space-y-1 pl-5">
                {(helperOld ? HELPER_AGAIN_STEPS : HELPER_STEPS).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p>
                Next: paste <span className="font-mono text-xs [overflow-wrap:anywhere]">{next.file}</span>, then each file
                after it in number order, one at a time.
              </p>
              {next.fromStart ? (
                <p>{FIRST_FILE} is the first. A file already pasted is refused rather than applied twice, so that does no harm.</p>
              ) : null}
            </>
          )}
          {next.kind === 'paste' && isCopyable(next.file) ? <CopyFile key={next.file} file={next.file} /> : null}
          {next.kind === 'paste' ? (
            <a
              href={sourceOf(next.file)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            >
              Open {next.file === HELPER_FILE ? 'the AI helper' : next.file} on GitHub
            </a>
          ) : null}
          {next.kind === 'paste' && next.file === HELPER_FILE ? (
            <>
              <p>
                If Edge Functions also lists read-receipt, paste its new version over it the same way, or delete it. The AI
                helper reads receipts without it, and its older copy lets anyone with the app’s public key use your Gemini key.
              </p>
              <CopyFile file={READ_RECEIPT_FILE} />
              <a
                href={`${REPO}supabase/functions/read-receipt/index.ts`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
              >
                Open read-receipt on GitHub
              </a>
            </>
          ) : null}
        </div>
      )}
      <Button variant="outline" disabled={busy} onClick={() => void check()}>
        {busy ? 'Checking…' : 'Check again'}
      </Button>
    </section>
  )
}
