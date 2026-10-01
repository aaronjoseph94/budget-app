import { useEffect, useId, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { SupabaseClient } from './supabase.js'
import { Label } from './ui.js'
import { Input, refusal } from './components/ui/form.js'
import { Button } from './components/ui/button.js'
import { Card } from './components/ui/card.js'
import { Icon } from './components/ui/icons.js'
import { Alert } from './components/ui/feedback.js'
import { LINE_BUTTON } from './components/ui/link.js'
import { cn } from './lib/cn.js'

/** Why the page, opened from an emailed link, is not signed in: a PKCE link that failed, or a dashboard link. */
export type LinkRefusal = 'link' | 'dashboard'

export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-out'; readonly linkRefused: LinkRefusal | null }
  | { readonly status: 'signed-in'; readonly session: Session }

/** Said on sign-in when the page was opened from an emailed link that did not sign in. */
export const LINK_REFUSED =
  'That sign-in link only works once, and only in the browser that asked for it. Ask for a new link here, or use your password.'

/** Said when the link came from the Supabase dashboard, which sends a kind of link this app never accepts. */
export const DASHBOARD_LINK_REFUSED =
  'Links sent from the Supabase dashboard do not sign in here. Ask for a link on this screen, or use your password.'

/** Query keys an emailed link brings: its one-time code, or why it failed. */
const LINK_QUERY = ['code', 'error', 'error_code', 'error_description'] as const
/** After #: the tokens themselves, as a dashboard link (no PKCE) sends them, or why it failed. */
const LINK_FRAGMENT = ['access_token', 'refresh_token', 'provider_token', 'error', 'error_code'] as const

let fragmentTaken = false

/**
 * Takes a dashboard link's tokens out of the address at once. This client
 * runs PKCE and refuses them (SEC-5), so they sign nothing in, but a
 * refresh token in the address bar, the history and a screenshot is a live
 * credential that does not expire on its own (security-a-02). Run before
 * the app reads its address, so navigation never sees them; idempotent.
 */
export function takeTokensOutOfAddress(): void {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  if (!LINK_FRAGMENT.some((key) => fragment.has(key))) return
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  fragmentTaken = true
}

/**
 * Whether the page was opened from an emailed link, and, if so, takes the
 * link's code or error out of the address. A link opened in another browser
 * (on an iPhone, the Home Screen app's links open in Safari) cannot be
 * exchanged there, and it left the plain sign-in form with the code still
 * in the address bar and no reason given (SEC-NEW-2).
 */
function cameFromLink(): LinkRefusal | null {
  takeTokensOutOfAddress()
  const dashboard = fragmentTaken
  fragmentTaken = false
  const url = new URL(window.location.href)
  const inQuery = LINK_QUERY.some((key) => url.searchParams.has(key))
  if (inQuery) {
    for (const key of LINK_QUERY) url.searchParams.delete(key)
    window.history.replaceState(window.history.state, '', url.toString())
  }
  return dashboard ? 'dashboard' : inQuery ? 'link' : null
}

/**
 * The current session, restored from storage and kept current.
 *
 * Starts as `loading` rather than `signed-out`, so a returning user does not
 * see the sign-in screen flash before their stored session is read.
 */
export function useSession(supabase: SupabaseClient): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    let live = true
    takeTokensOutOfAddress()

    // getSession waits for the client to finish with the address, a link's
    // exchange included, so its answer says whether the link signed in.
    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      // Read only now: a link that did sign in has its code taken out by the client.
      const link = cameFromLink()
      const refused = data.session === null ? link : null
      setState(
        data.session === null
          ? { status: 'signed-out', linkRefused: refused }
          : { status: 'signed-in', session: data.session },
      )
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return
      // The first event can come after getSession's answer, and a null
      // session must not wipe the reason a link did not sign in.
      setState((was) =>
        session === null
          ? { status: 'signed-out', linkRefused: was.status === 'signed-out' ? was.linkRefused : null }
          : { status: 'signed-in', session },
      )
    })

    return () => {
      live = false
      subscription.subscription.unsubscribe()
    }
  }, [supabase])

  return state
}

type Attempt =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'link-sent'; readonly email: string }
  | { readonly kind: 'failed'; readonly message: string }

type Method = 'password' | 'link'

/** Supabase's refusal to email a link to an address that has no account. */
function isNoAccount(error: { readonly code?: string | undefined; readonly message: string }): boolean {
  return error.code === 'otp_disabled' || error.code === 'signup_disabled' || /signups not allowed/i.test(error.message)
}

/**
 * Sign in, by password or by emailed link.
 *
 * Password is the default because the alternative depends on a mail service:
 * Supabase's built-in sender allows a handful of messages an hour across the
 * whole project, so testing sign-in twice locks you out of it for an hour.
 * A password has no such limit and no dependency.
 *
 * There is deliberately no way to CREATE an account here. This app holds one
 * person's financial history; accounts are made in the Supabase dashboard, so
 * a public URL cannot be used to register against this project at all.
 */
export function SignIn({ supabase, linkRefused = null }: { supabase: SupabaseClient; linkRefused?: LinkRefusal | null }) {
  const [method, setMethod] = useState<Method>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [attempt, setAttempt] = useState<Attempt>({ kind: 'idle' })
  // The Sign in button is disabled while it works, which drops focus to the
  // page; a failure puts it on the reason, which is then read out (FE-6).
  const reason = useRef<HTMLParagraphElement>(null)
  const reasonId = useId()
  useEffect(() => {
    if (attempt.kind === 'failed') reason.current?.focus()
  }, [attempt])

  const submit = async () => {
    const address = email.trim()
    if (address.length === 0) return
    setAttempt({ kind: 'working' })

    if (method === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password })
      // Supabase deliberately returns the same message whether the address is
      // unknown or the password is wrong, so the form cannot be used to find
      // out which addresses have accounts. Passed through unchanged.
      setAttempt(error === null ? { kind: 'idle' } : { kind: 'failed', message: error.message })
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    })
    // An address with no account is refused by Supabase (no account is made
    // and no email goes out), but showing that refusal would tell a stranger
    // which addresses are registered. So it reads exactly as a sent link does,
    // as the password form's single message does.
    setAttempt(
      error === null || isNoAccount(error)
        ? { kind: 'link-sent', email: address }
        : { kind: 'failed', message: error.message },
    )
  }

  const busy = attempt.kind === 'working'
  // Both fields are named by the refusal: Supabase will not say which was wrong.
  const refused = refusal(reasonId, attempt.kind === 'failed')

  // <main>, as the signed-in app's screens are: a screen reader finds the
  // page by its landmark, and axe flags a page without one (FE-14).
  // Mockup A: a centred card on the canvas, washed with the accent's tint at
  // the top; muted words off the card take the grey measured on both.
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-linear-to-b from-primary-tint to-canvas px-4 py-12 [--muted-foreground:var(--canvas-muted)]">
      <div className="w-full max-w-[26rem]">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Icon name="wallet" className="size-7" />
          </span>
          <h1 className="mt-4 text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">Budget</h1>
          <p className="mt-1 text-balance text-muted-foreground">Your statements and your spending, visible only to you.</p>
        </div>

        {linkRefused !== null && attempt.kind === 'idle' ? (
          <div className="mt-6">
            <Alert tone="error">{linkRefused === 'dashboard' ? DASHBOARD_LINK_REFUSED : LINK_REFUSED}</Alert>
          </div>
        ) : null}

        {/* The one card in the app with a shadow (Mockup A). */}
        <Card className="mt-7 p-6 shadow-[0_10px_30px_rgba(17,24,39,.06)] sm:p-7">
          {attempt.kind === 'link-sent' ? (
            <div>
              <h2 className="font-semibold">Check your email</h2>
              <p className="mt-2 text-sm">
                If <strong className="font-medium">{attempt.email}</strong> has an account here, a sign-in
                link is on its way to it. Open it on this device, in
                this same browser, and you are in. If you asked from the app on your Home Screen, sign in there with
                your password instead: its links open in another browser.
              </p>
              <div className="mt-4">
                <Button variant="outline" onClick={() => setAttempt({ kind: 'idle' })}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              {/* The app's own field: 44 px tall and 16 px text, where these were
                41 px and 14 (FE-1). */}
              <label className="block">
                <span className="text-sm font-semibold">Email address</span>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  {...refused}
                  className="mt-1.5"
                />
              </label>

              {method === 'password' ? (
                <label className="mt-4 block">
                  <span className="text-sm font-semibold">Password</span>
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    {...refused}
                    className="mt-1.5"
                  />
                </label>
              ) : null}

              <div className="mt-5 flex flex-col items-center gap-2">
                <Button type="submit" size="lg" disabled={busy} className="w-full">
                  {busy ? 'Signing in…' : method === 'password' ? 'Sign in' : 'Email me a link'}
                </Button>
                {/* 44 px for a finger, as the Year's line buttons are (A26). */}
                <button
                  type="button"
                  className={cn('text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground', LINE_BUTTON)}
                  onClick={() => {
                    setMethod(method === 'password' ? 'link' : 'password')
                    setAttempt({ kind: 'idle' })
                  }}
                >
                  {method === 'password' ? 'Email me a link instead' : 'Use a password instead'}
                </button>
              </div>

              {attempt.kind === 'failed' ? (
                <p ref={reason} id={reasonId} role="alert" tabIndex={-1} className="mt-3 text-sm text-spend outline-none">
                  {attempt.message}
                </p>
              ) : null}

              {method === 'link' ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Emailed links are limited to a few per hour on this project’s mail settings. A
                  password has no such limit.
                </p>
              ) : null}
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}

/**
 * Shown when the app was built without the two public Supabase values.
 *
 * Says where to put them, because the answer differs by where this is running
 * and the difference is not obvious: Vite substitutes `import.meta.env` values
 * at BUILD time, so a hosted build that ran before the variables existed has
 * "missing" compiled into it. Setting them afterwards changes nothing until it
 * is rebuilt — which looks exactly like the settings not working.
 */
export function NotConfigured({ missing }: { missing: readonly string[] }) {
  const hosted = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-12">
      <Card className="p-5">
        <Label>Not configured</Label>
        <p className="mt-2 text-sm">
          This build is missing {missing.length === 1 ? 'a setting' : 'some settings'}:
        </p>
        <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
          {missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-lg border border-border bg-muted p-4 text-sm">
          {hosted ? (
            <>
              <p className="font-medium">To fix this on the hosted site</p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                <li>Add both values to the site’s environment variables.</li>
                <li>
                  <strong className="font-medium text-foreground">Then trigger a new deploy.</strong> This
                  is the step that is easy to miss: the values are compiled in when the site is
                  built, so adding them changes nothing until it builds again.
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-medium">To fix this locally</p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                <li>
                  Put both values in <code>apps/web/.env.local</code> — that exact folder, beside{' '}
                  <code>vite.config.ts</code>, not the repository root.
                </li>
                <li>Restart the dev server. It reads the file once, at startup.</li>
              </ol>
            </>
          )}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Both come from the Supabase project’s API settings and are safe to publish — they travel
          in every request the browser makes, and the database’s own access rules are what protect
          the data. The <code>service_role</code> key is a different thing entirely and does not
          belong here.
        </p>
      </Card>
    </main>
  )
}
