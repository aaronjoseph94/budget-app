import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/cn.js'
import { CopyFile, isCopyable } from './CopyFile.js'
import { FIRST_FILE, HELPER_FILE, OAUTH_SERVER, READ_RECEIPT_FILE, SERVER_FILE, SIGNING_KEY, SIGNUPS_OFF, checkUpdates, nextStep, type Checked } from './updates.js'
import { LINE_LINK } from '../components/ui/link.js'

/** The repository's files on GitHub. */
const REPO = 'https://github.com/aaronjoseph94/budget-app/blob/main/'
/** Where each committed file can be opened and copied (HANDOFF §3, step 1); null for a step with no committed file. */
const sourceOf = (file: string) =>
  file === HELPER_FILE ? `${REPO}supabase/functions/ai/index.ts` : file.endsWith('.sql') ? `${REPO}supabase/migrations/${file}` : null

/**
 * The exact clicks for the AI helper, which goes in the Edge Functions
 * editor, not the SQL Editor (plan §10.2), first or over an older copy
 * (N78). Its gateway check stays on only while Supabase signs with the old
 * shared secret: Supabase warns a changed key can break a function with it
 * on, and the helper checks every caller itself (ADR 0012).
 */
function helperSteps(again: boolean, newKey: boolean): string[] {
  const check = newKey ? 'Turn Enforce JWT verification off' : 'Keep Enforce JWT verification on'
  return again
    ? ['In Supabase, open Edge Functions, then the function named ai, then its code.', 'Paste the new version over everything in the editor.', `${check}, and deploy it.`]
    : [
        'In Supabase, open Edge Functions, then Deploy a new function, then Via Editor.',
        'Name it exactly ai.',
        'Paste the helper over everything in the editor.',
        `${check}, and press Deploy.${newKey ? ' The helper checks every caller itself.' : ''}`,
      ]
}

/**
 * Moving Supabase to its new signing key, which ChatGPT's sign-in needs
 * (PLAN §1, step 3): each helper's gateway check off first. read-receipt's
 * copy from before 2026-09-30 has no caller check of its own (PLAN §6,
 * finding 7), so it is replaced or deleted before its switch comes off;
 * this page cannot tell which copy is deployed.
 */
const SIGNING_KEY_STEPS = [
  'In Supabase, open Edge Functions, then the function named ai, then its settings. Turn Enforce JWT verification off, and save.',
  'If Edge Functions lists read-receipt, first paste its new version over it with Copy read-receipt below, or delete it: its older copy relies on that switch alone, and with it off anyone could use your Gemini key. Then turn its switch off the same way.',
  'Open Project Settings, then JWT Keys, and press Rotate keys, so the current key is the ECC (P-256) one. Do not revoke the old key.',
  'Sign out of this app and back in, then press Check again.',
]

/** Supabase's OAuth server, which finds the consent page from Site URL (PLAN §1, steps 4 and 5). */
const oauthSteps = (site: string) => [
  `In Supabase, open Authentication, then URL Configuration, and check Site URL is ${site}.`,
  'Open Authentication, then OAuth Server, and press Enable.',
  'Set Authorization Path to /oauth/consent.',
  'Turn on dynamic client registration, which lets Claude and ChatGPT register themselves, and press Save.',
  'Under Sign In / Providers, keep Allow new users to sign up off, and under Email keep Secure email change on.',
]

/**
 * Allow new users to sign up, off (backend-b-06): the switch's place moved
 * between dashboard versions, so the older names are given too.
 */
const SIGNUPS_STEPS = [
  'In Supabase, open Authentication, then Sign In / Providers. On an older dashboard it is Authentication, then Providers, then Email, or Authentication, then Settings.',
  'Turn off Allow new users to sign up, and press Save.',
  'Open Authentication, then Users, and delete any row that is not you.',
  'Press Check again.',
]

/**
 * The clicks for the AI apps server (ADR 0012). It checks every caller
 * itself, and Claude and ChatGPT find their sign-in only through its own
 * 401, which Supabase's JWT check would answer first.
 */
const SERVER_STEPS = [
  'In Supabase, open Edge Functions, then Deploy a new function, then Via Editor.',
  'Name it exactly mcp.',
  'Paste the server over everything in the editor.',
  'Turn Enforce JWT verification off, and press Deploy. The server checks every caller itself.',
]

/** read-receipt from before 2026-10-01: deleted, as the helper reads receipts, or replaced (security review mcp-3-03). */
const READ_RECEIPT_STEPS = [
  'In Supabase, open Edge Functions, then read-receipt, then its ⋯ menu, and press Delete.',
  'Or, to keep it, open its code, paste its new version over everything with Copy below, and deploy it.',
]

const SERVER_AGAIN_STEPS = [
  'In Supabase, open Edge Functions, then the function named mcp, then its code.',
  'Paste the new version over everything in the editor, and deploy it.',
  'Open its settings and check Enforce JWT verification is still off.',
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
  const newKey = checked?.some((c) => c.update.file === SIGNING_KEY && c.state === 'in') === true
  const source = next?.kind === 'paste' ? sourceOf(next.file) : null
  const serverOld = checked?.some((c) => c.update.file === SERVER_FILE && c.state === 'old') === true
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
              <Steps steps={helperSteps(helperOld, newKey)} />
            </>
          ) : next.file === SIGNING_KEY || next.file === OAUTH_SERVER ? (
            <>
              <p>
                {next.file === SIGNING_KEY
                  ? 'Next: move Supabase to its new signing key, which ChatGPT needs to sign in. About 5 minutes, on a computer.'
                  : 'Next: turn on sign-in for AI apps in Supabase, so Claude or ChatGPT can ask you to allow them. About 5 minutes, on a computer.'}
              </p>
              <Steps steps={next.file === SIGNING_KEY ? SIGNING_KEY_STEPS : oauthSteps(window.location.origin)} />
            </>
          ) : next.file === READ_RECEIPT_FILE ? (
            <>
              <p>Next: delete read-receipt, or paste its new version over it. About 2 minutes, on a computer.</p>
              <Steps steps={READ_RECEIPT_STEPS} />
            </>
          ) : next.file === SERVER_FILE ? (
            <>
              <p>
                {serverOld
                  ? 'Next: paste the AI apps server’s new version over the one you have. About 5 minutes, on a computer.'
                  : 'Next: install the AI apps server, which Claude or ChatGPT connect to. About 5 minutes, on a computer.'}
              </p>
              <Steps steps={serverOld ? SERVER_AGAIN_STEPS : SERVER_STEPS} />
            </>
          ) : (
            <>
              <p>
                Next: paste <span className="font-mono text-xs [overflow-wrap:anywhere]">{next.file}</span>, then each file
                after it in number order, one at a time.
              </p>
              {next.fromStart ? (
                <p>{FIRST_FILE} is the first. A file already pasted is refused with nothing changed, or runs again to the same result, so that does no harm.</p>
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
          {next.kind === 'paste' && (next.file === HELPER_FILE || next.file === SIGNING_KEY) ? (
            <>
              {next.file === HELPER_FILE ? (
                <p>
                  If Edge Functions also lists read-receipt, paste its new version over it the same way, or delete it. The AI
                  helper reads receipts without it, and its older copy lets anyone with the app’s public key use your Gemini key.
                </p>
              ) : null}
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
