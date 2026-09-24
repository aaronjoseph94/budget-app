import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { SupabaseClient } from './supabase.js'
import { Button, Card, Label } from './ui.js'

export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly session: Session }

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

    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      setState(
        data.session === null
          ? { status: 'signed-out' }
          : { status: 'signed-in', session: data.session },
      )
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return
      setState(
        session === null ? { status: 'signed-out' } : { status: 'signed-in', session },
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
export function SignIn({ supabase }: { supabase: SupabaseClient }) {
  const [method, setMethod] = useState<Method>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [attempt, setAttempt] = useState<Attempt>({ kind: 'idle' })

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
    setAttempt(
      error === null
        ? { kind: 'link-sent', email: address }
        : { kind: 'failed', message: error.message },
    )
  }

  const busy = attempt.kind === 'working'

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your statements and your spending, visible only to you.
      </p>

      <Card className="mt-8 p-5">
        {attempt.kind === 'link-sent' ? (
          <div>
            <Label>Check your email</Label>
            <p className="mt-2 text-sm">
              A sign-in link is on its way to{' '}
              <strong className="font-medium">{attempt.email}</strong>. Open it on this device and
              you are in.
            </p>
            <div className="mt-4">
              <Button variant="quiet" onClick={() => setAttempt({ kind: 'idle' })}>
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
            <label className="block">
              <Label>Email address</Label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              />
            </label>

            {method === 'password' ? (
              <label className="mt-3 block">
                <Label>Password</Label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
                />
              </label>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Signing in…' : method === 'password' ? 'Sign in' : 'Email me a link'}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  setMethod(method === 'password' ? 'link' : 'password')
                  setAttempt({ kind: 'idle' })
                }}
              >
                {method === 'password' ? 'Email me a link instead' : 'Use a password instead'}
              </button>
            </div>

            {attempt.kind === 'failed' ? (
              <p className="mt-3 text-sm text-spend">{attempt.message}</p>
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
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-12">
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
    </div>
  )
}
