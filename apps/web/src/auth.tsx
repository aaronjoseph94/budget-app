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

type SendState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent'; readonly email: string }
  | { readonly kind: 'failed'; readonly message: string }

export function SignIn({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [send, setSend] = useState<SendState>({ kind: 'idle' })

  const submit = async () => {
    const address = email.trim()
    if (address.length === 0) return
    setSend({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin },
    })
    // The message names what went wrong and never the address: an auth error
    // is a thing that gets logged.
    setSend(
      error === null
        ? { kind: 'sent', email: address }
        : { kind: 'failed', message: error.message },
    )
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Your statements and your spending, visible only to you.
      </p>

      <Card className="mt-8 p-5">
        {send.kind === 'sent' ? (
          <div>
            <Label>Check your email</Label>
            <p className="mt-2 text-sm">
              A sign-in link is on its way to <strong className="font-medium">{send.email}</strong>.
              Open it on this device and you are in — there is no password to remember.
            </p>
            <div className="mt-4">
              <Button variant="quiet" onClick={() => setSend({ kind: 'idle' })}>
                Use a different address
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
                className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
              />
            </label>
            <div className="mt-4">
              <Button type="submit" disabled={send.kind === 'sending'}>
                {send.kind === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
              </Button>
            </div>
            {send.kind === 'failed' ? (
              <p className="mt-3 text-sm text-spend">{send.message}</p>
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
        <ul className="mt-2 list-inside list-disc text-sm text-ink-soft">
          {missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-lg border border-line bg-surface p-4 text-sm">
          {hosted ? (
            <>
              <p className="font-medium">To fix this on the hosted site</p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-ink-soft">
                <li>Add both values to the site’s environment variables.</li>
                <li>
                  <strong className="font-medium text-ink">Then trigger a new deploy.</strong> This
                  is the step that is easy to miss: the values are compiled in when the site is
                  built, so adding them changes nothing until it builds again.
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-medium">To fix this locally</p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-ink-soft">
                <li>
                  Put both values in <code>apps/web/.env.local</code> — that exact folder, beside{' '}
                  <code>vite.config.ts</code>, not the repository root.
                </li>
                <li>Restart the dev server. It reads the file once, at startup.</li>
              </ol>
            </>
          )}
        </div>

        <p className="mt-4 text-sm text-ink-soft">
          Both come from the Supabase project’s API settings and are safe to publish — they travel
          in every request the browser makes, and the database’s own access rules are what protect
          the data. The <code>service_role</code> key is a different thing entirely and does not
          belong here.
        </p>
      </Card>
    </div>
  )
}
