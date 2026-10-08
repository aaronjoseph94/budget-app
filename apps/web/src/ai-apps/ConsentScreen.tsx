import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { readEnv, type Env } from '../env.js'
import { createSupabase, type SupabaseClient } from '../supabase.js'
import { NotConfigured, SignIn, useSession } from '../auth.js'
import { Card } from '../components/ui/card.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Loading } from '../components/ui/feedback.js'
import { checkCallback, type Callback } from './hosts.js'
import { readAccess, saveAccess, shownName, type Access } from './access.js'
import { aiAppsReady } from '../help/updates.js'

/** Supabase's authorization ids are short URL-safe tokens; anything else is not one, and is never sent. */
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Whether Supabase's answer may send the browser on: to the callback the
 * page named, exactly, then `?` and a query, and nothing else (no
 * fragment, no user name), which the allowlist passes. An answer to a
 * request allowed before names no callback first.
 */
function followable(redirectUrl: string, callback: string | null): boolean {
  let url: URL
  try {
    url = new URL(redirectUrl)
  } catch {
    return false
  }
  const base = `${url.protocol}//${url.host}${url.pathname}`
  if (url.href !== `${base}${url.search}` || url.search.length < 2 || !checkCallback(base).allowed) return false
  return callback === null || base === new URL(callback).href
}

/** AI apps on, and Connect a new AI app pressed within its 15 minutes, by this browser's clock. */
const opened = (access: Access | null, now: number) =>
  access !== null && access.enabled && access.connectUntil !== null && Date.parse(access.connectUntil) > now

// AI apps is on Settings' Account tab (ADR 0014 §2).
const AGAIN = 'If you are connecting Claude or ChatGPT yourself, open Settings → Account → AI apps'
const NOT_STARTED = `This connection wasn’t started from the budget app. ${AGAIN}, press Connect a new AI app, and press Connect in Claude or ChatGPT again.`
const SWITCHED_OFF = `AI apps are switched off in the budget app. ${AGAIN}, turn on Let AI apps connect, press Connect a new AI app, and press Connect in Claude or ChatGPT again.`
/** Something aiAppsReady checks (BEFORE_AI_APPS in help/updates.ts) is not in yet (mcp-3-03). */
const NEEDS_UPDATE = 'The budget app needs a one-time update first. Open it, go to Help → One-time updates and do the step it names, then press Connect in Claude or ChatGPT again.'

type Seen =
  | { readonly kind: 'reading' }
  | { readonly kind: 'said'; readonly title: string; readonly words: string }
  | {
      readonly kind: 'asking'
      readonly id: string
      readonly details: OAuthAuthorizationDetails
      readonly callback: Callback
      readonly access: Access | null
      /** What keeps an AI app's token harmless is in (mcp-3-03). */
      readonly ready: boolean
    }

const SAID = {
  bad_link: { kind: 'said', title: 'This isn’t a connection request', words: 'To connect Claude or ChatGPT, start from Settings → Account → AI apps in the budget app.' },
  expired: { kind: 'said', title: 'This request has expired', words: 'Go back to Claude or ChatGPT and press Connect again.' },
  unreachable: { kind: 'said', title: 'Couldn’t reach Supabase', words: 'Check your connection, then reload this page.' },
  not_started: { kind: 'said', title: 'Start from the budget app', words: NOT_STARTED },
  switched_off: { kind: 'said', title: 'AI apps are switched off', words: SWITCHED_OFF },
  needs_update: { kind: 'said', title: 'A one-time update first', words: NEEDS_UPDATE },
  bad_reply: { kind: 'said', title: 'Not sent back', words: 'Supabase answered with an address that is not Claude’s or ChatGPT’s, so this page went nowhere. Go back to Claude or ChatGPT and press Connect again.' },
  refused: { kind: 'said', title: 'Refused', words: 'You can close this tab.' },
} as const satisfies Record<string, Seen>

/** The page Supabase sends an AI app's sign-in to (PLAN §2.10), at /oauth/consent. */
export function ConsentScreen() {
  const env = useMemo(() => readEnv(), [])
  if (!env.ok) return <NotConfigured missing={env.missing} />
  return <WithProject env={env.env} />
}

const leave = (url: string) => window.location.assign(url)

/**
 * One Connect, one connection (security review mcp-1-02): once a
 * connection is allowed, the 15 minutes end, so a second consent link
 * arriving in them, someone else's included, finds no Allow. A failed
 * write is not waited on twice: the owner did allow this one.
 */
const closeWindow = (supabase: SupabaseClient, userId: string) =>
  saveAccess(supabase, userId, { connectUntil: new Date(Date.now()).toISOString() }).catch(() => null)

function WithProject({ env }: { env: Env }) {
  const supabase = useMemo(() => createSupabase(env), [env])
  return <Consent supabase={supabase} go={leave} />
}

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
    void Promise.all([supabase.auth.oauth.getAuthorizationDetails(id), readAccess(supabase, userId), aiAppsReady(supabase)]).then(([asked, read, readiness]) => {
      if (!live) return
      const access = read.ok ? read.access : null
      if (asked.error !== null) {
        setSeen(asked.error.status !== undefined && asked.error.status >= 400 && asked.error.status < 500 ? SAID.expired : SAID.unreachable)
      } else if ('authorization_id' in asked.data) {
        setSeen({ kind: 'asking', id, details: asked.data, callback: checkCallback(asked.data.redirect_uri), access, ready: readiness.ready })
      } else if (!followable(asked.data.redirect_url, null)) {
        setSeen(SAID.bad_reply)
      } else if (!opened(access, Date.now())) {
        // Allowed before, so Supabase has already issued a code: followed only on Allow's terms.
        setSeen(access?.enabled === true ? SAID.not_started : SAID.switched_off)
      } else if (!readiness.ready) {
        setSeen(SAID.needs_update)
      } else {
        const back = asked.data.redirect_url
        void closeWindow(supabase, userId).then(() => go(back))
      }
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
  const { id, details, callback, access, ready } = seen
  const allow = callback.allowed && opened(access, now) && ready

  const answer = async (approve: boolean) => {
    setBusy(true)
    if (approve) {
      // All three again at the click, read afresh: another page's Allow may
      // have closed the window since this one loaded (mcp-1-02), or an
      // update gone; the window by the clock now. Unread is no.
      const [read, readiness] = await Promise.all([readAccess(supabase, userId), aiAppsReady(supabase)])
      const at = Date.now()
      setNow(at)
      if (!read.ok) {
        setBusy(false)
        setSeen(SAID.unreachable)
        return
      }
      if (!(callback.allowed && opened(read.access, at) && readiness.ready)) {
        setBusy(false)
        setSeen({ ...seen, access: read.access, ready: readiness.ready })
        return
      }
    }
    const reply = approve
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    // Never to an unknown callback, even with the owner's no: that would be an open redirect.
    if (callback.allowed && reply.error === null && followable(reply.data.redirect_url, details.redirect_uri)) {
      if (approve) await closeWindow(supabase, userId)
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
            If you allow it, it can read your budget figures, search your charges, add items to Review, and suggest changes that wait in
            Review until you apply them. In your budget it cannot approve, apply, change or delete anything. Like any sign-in, it could also be used on your Supabase account itself, such as its email
            or password, until its sign-in ends, which Disconnect should do, so only allow an app you trust.
          </p>
          <p>Your budget details go to the company that runs this AI app: Anthropic for Claude, OpenAI for ChatGPT.</p>
          <p className="font-semibold">
            {allow
              ? 'Only continue if you just pressed Connect in Claude or ChatGPT yourself.'
              : access?.enabled !== true
                ? SWITCHED_OFF
                : !ready
                  ? NEEDS_UPDATE
                  : NOT_STARTED}
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
