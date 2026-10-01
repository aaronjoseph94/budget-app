import { useEffect, useState, type ReactNode } from 'react'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import type { SupabaseClient } from '../supabase.js'
import { SignIn, useSession } from '../auth.js'
import { Card } from '../components/ui/card.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Loading } from '../components/ui/feedback.js'
import { checkCallback, type Callback } from './hosts.js'
import { readAccess, shownName, type Access } from './access.js'

/** Supabase's authorization ids are short URL-safe tokens; anything else is not one, and is never sent. */
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Whether Supabase's answer may send the browser on: to the callback the
 * page named, exactly, then `?` and a query, and nothing else (no
 * fragment, no user name), which the allowlist passes.
 */
function followable(redirectUrl: string, callback: string): boolean {
  let url: URL
  try {
    url = new URL(redirectUrl)
  } catch {
    return false
  }
  const base = `${url.protocol}//${url.host}${url.pathname}`
  if (url.href !== `${base}${url.search}` || url.search.length < 2 || !checkCallback(base).allowed) return false
  return base === new URL(callback).href
}

/** AI apps on, and Connect a new AI app pressed within its 15 minutes, by this browser's clock. */
const opened = (access: Access | null, now: number) =>
  access !== null && access.enabled && access.connectUntil !== null && Date.parse(access.connectUntil) > now

const AGAIN = 'If you are connecting Claude or ChatGPT yourself, open Settings → AI apps'
const NOT_STARTED = `This connection wasn’t started from the budget app. ${AGAIN}, press Connect a new AI app, and press Connect in Claude or ChatGPT again.`
const SWITCHED_OFF = `AI apps are switched off in the budget app. ${AGAIN}, turn on Let AI apps connect, press Connect a new AI app, and press Connect in Claude or ChatGPT again.`

type Seen =
  | { readonly kind: 'reading' }
  | { readonly kind: 'said'; readonly title: string; readonly words: string }
  | { readonly kind: 'asking'; readonly id: string; readonly details: OAuthAuthorizationDetails; readonly callback: Callback; readonly access: Access | null }

const SAID = {
  bad_link: { kind: 'said', title: 'This isn’t a connection request', words: 'To connect Claude or ChatGPT, start from Settings → AI apps in the budget app.' },
  expired: { kind: 'said', title: 'This request has expired', words: 'Go back to Claude or ChatGPT and press Connect again.' },
  unreachable: { kind: 'said', title: 'Couldn’t reach Supabase', words: 'Check your connection, then reload this page.' },
  not_started: { kind: 'said', title: 'Start from the budget app', words: NOT_STARTED },
  bad_reply: { kind: 'said', title: 'Not sent back', words: 'Supabase answered with an address that is not Claude’s or ChatGPT’s, so this page went nowhere. Go back to Claude or ChatGPT and press Connect again.' },
  refused: { kind: 'said', title: 'Refused', words: 'You can close this tab.' },
} as const satisfies Record<string, Seen>

/**
 * Connect an AI app. Signed out, it shows the sign-in card, whose emailed
 * link brings the owner back here. Then it asks Supabase what is asking,
 * and offers Allow only when all three hold: the callback is exactly one
 * Claude or ChatGPT documents (hosts.ts), AI apps are on, and Connect a
 * new AI app was pressed less than 15 minutes ago. So a link someone else
 * started and sent the owner finds no Allow. Allow never turns anything
 * on. Deny follows Supabase's answer only back to an allowed callback,
 * never to an unknown site. `go` is how the page leaves, handed in so a
 * test can see where.
 */
export function Consent({ supabase, go }: { supabase: SupabaseClient; go: (url: string) => void }) {
  const session = useSession(supabase)
  if (session.status === 'loading') return <Loading what="the connection" />
  if (session.status === 'signed-out') return <SignIn supabase={supabase} linkRefused={session.linkRefused} returnTo={window.location.href} />
  return <Decide supabase={supabase} userId={session.session.user.id} go={go} />
}

function Decide({ supabase, userId, go }: { supabase: SupabaseClient; userId: string; go: (url: string) => void }) {
  const [seen, setSeen] = useState<Seen>({ kind: 'reading' })
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    const id = new URLSearchParams(window.location.search).get('authorization_id')
    if (id === null || !AUTHORIZATION_ID.test(id)) {
      setSeen(SAID.bad_link)
      return
    }
    void Promise.all([supabase.auth.oauth.getAuthorizationDetails(id), readAccess(supabase, userId)]).then(([asked, read]) => {
      if (!live) return
      const access = read.ok ? read.access : null
      if (asked.error !== null) {
        setSeen(asked.error.status !== undefined && asked.error.status >= 400 && asked.error.status < 500 ? SAID.expired : SAID.unreachable)
      } else if ('authorization_id' in asked.data) {
        setSeen({ kind: 'asking', id, details: asked.data, callback: checkCallback(asked.data.redirect_uri), access })
      } else setSeen(SAID.not_started)
    })
    return () => void (live = false)
  }, [supabase, userId, go])

  if (seen.kind === 'reading') return <Loading what="the connection" />
  if (seen.kind === 'said') {
    return (
      <Page title={seen.title}>
        <p>{seen.words}</p>
      </Page>
    )
  }
  const { id, details, callback, access } = seen
  const allow = callback.allowed && opened(access, now)

  const answer = async (approve: boolean) => {
    const at = Date.now()
    setNow(at)
    if (approve && !opened(access, at)) return
    setBusy(true)
    const reply = approve
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    // Never to an unknown callback, even with the owner's no: that would be an open redirect.
    if (callback.allowed && reply.error === null && followable(reply.data.redirect_url, details.redirect_uri)) {
      go(reply.data.redirect_url)
      return
    }
    setBusy(false)
    setSeen(!approve ? SAID.refused : reply.error === null ? SAID.bad_reply : SAID.expired)
  }

  return (
    <Page title="Connect an AI app">
      <p className="text-lg">
        “<bdi>{shownName(details.client.name)}</bdi>” wants to connect to your budget.
      </p>
      {callback.allowed ? (
        <>
          <p>
            It will send you back to <strong className="font-semibold">{callback.host}</strong>.
          </p>
          {callback.local ? (
            <p className="rounded-lg border border-waiting-border bg-waiting px-4 py-3">
              This sends you to a program on this computer. Any program on it could be listening; only continue if you started this from a
              program you trust.
            </p>
          ) : null}
          <p>
            If you allow it, it can read your budget figures, search your charges, and add items to Review. It cannot approve, change or
            delete anything.
          </p>
          <p>Your budget details go to the company that runs this AI app: Anthropic for Claude, OpenAI for ChatGPT.</p>
          <p className="font-semibold">
            {allow ? 'Only continue if you just pressed Connect in Claude or ChatGPT yourself.' : access?.enabled === true ? NOT_STARTED : SWITCHED_OFF}
          </p>
        </>
      ) : (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive">
          This app would send you to <strong className="font-semibold">{callback.host ?? 'an address that cannot be read'}</strong>, which
          is not Claude or ChatGPT, so the budget app refused it.
        </p>
      )}
      <div className="flex flex-wrap gap-3 pt-2">
        {allow ? (
          <Button size="lg" disabled={busy} onClick={() => void answer(true)}>
            Allow
          </Button>
        ) : null}
        <Button size="lg" variant="outline" disabled={busy} onClick={() => void answer(false)}>
          Deny
        </Button>
      </div>
    </Page>
  )
}

/** Mockup A's sign-in look, flat: the app's tile and name over one card, on the canvas washed with the accent's tint. */
function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-linear-to-b from-primary-tint to-canvas px-4 py-12">
      <p className="flex items-center gap-2.5 text-lg font-bold">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon name="wallet" className="size-5" />
        </span>
        Budget
      </p>
      <Card className="w-full max-w-[30rem] space-y-4 p-6 text-base sm:p-7">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
        {children}
      </Card>
    </main>
  )
}
