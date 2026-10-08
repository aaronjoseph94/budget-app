import { useEffect, useRef, useState } from 'react'
import { useAppData } from '../app-data.js'
import { hashOf } from '../nav.js'
import { formatIsoDate, localDateOf } from '../format.js'
import { Button } from '../components/ui/button.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { useFocusWhereItWas } from '../lib/return-focus.js'
import { disconnect, readConnectedApps, type AppsRead, type ConnectedApp } from './access.js'

/**
 * Connected apps, and Disconnect (PLAN §2.9): each AI app the owner has
 * allowed, by the name its registrant gave it, drawn as text, with when it
 * was allowed and when it last asked something. Shown while AI apps are on,
 * and whenever one is still connected, so it can be disconnected with the
 * switch off.
 */
export function ConnectedApps({ on }: { on: boolean }) {
  const { supabase } = useAppData()
  const [read, setRead] = useState<AppsRead | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  // Keep it and Yes, disconnect go as they are pressed: focus goes to that
  // app's Disconnect, the next app's once it is gone, or the heading (e2e-setup-06).
  const list = useRef<HTMLUListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const apps = read?.ok === true ? read.apps : []
  const refocus = useFocusWhereItWas(list, `${asking ?? ''} ${apps.map((a) => a.clientId).join(' ')}`, 'button[aria-expanded]', heading)
  const settle = (app: ConnectedApp) => refocus(apps.indexOf(app))

  useEffect(() => {
    let live = true
    void readConnectedApps(supabase).then((r) => {
      if (live) setRead(r)
    })
    return () => void (live = false)
  }, [supabase])

  const end = async (app: ConnectedApp) => {
    settle(app)
    setBusy(true)
    const done = await disconnect(supabase, app.clientId)
    if (done) setRead(await readConnectedApps(supabase))
    setBusy(false)
    setAsking(null)
    setSaid(done ? `Disconnected “${app.name}”. It has to sign in again to come back.` : 'Couldn’t disconnect it just now. Try again.')
  }

  const listed = read?.ok === true && read.apps.length > 0
  if (read === null || (!on && !listed && said === '')) return null
  return (
    <div className="space-y-2 border-t pt-3">
      <h3 ref={heading} tabIndex={-1} className="text-base font-semibold outline-none">
        Connected apps
      </h3>
      {read.ok === false ? (
        <>
          <p className="text-sm">
            {read.why === 'oauth_off' ? 'Sign-in for AI apps is not switched on in Supabase yet. ' : 'Couldn’t load your connected apps just now. '}
            {read.why === 'oauth_off' ? (
              <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
                One-time updates
              </a>
            ) : null}
          </p>
          {/* With Supabase's sign-in for AI apps off, nothing here can be disconnected (mcp-3-01). */}
          {read.why === 'oauth_off' ? (
            <p className="text-sm text-muted-foreground">
              If you turned it off in an emergency, an app connected before may still hold a sign-in. To end every sign-in, yours too, open
              the SQL Editor in Supabase and run <code className="font-mono">delete from auth.sessions;</code> then sign in again.
            </p>
          ) : null}
        </>
      ) : read.apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul ref={list} className="divide-y rounded-lg border">
          {read.apps.map((app) => (
            <li key={app.clientId} className="space-y-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* Disconnect drops under the words where they would have under 10rem. */}
                <div className="min-w-[10rem] flex-1">
                  {/* Isolated, so a name cannot turn the words around it. */}
                  <p className="font-semibold break-words">
                    <bdi>{app.name}</bdi>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="whitespace-nowrap">Connected {formatIsoDate(localDateOf(app.connectedAt))}</span>
                    {read.lastUseKnown ? ' · ' : null}
                    {read.lastUseKnown ? (
                      <span className="whitespace-nowrap">
                        {app.lastUsedAt === null ? 'Not used yet' : `Last asked ${formatIsoDate(localDateOf(app.lastUsedAt))}`}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button variant="outline" size="tall" disabled={busy} aria-expanded={asking === app.clientId} onClick={() => setAsking(asking === app.clientId ? null : app.clientId)}>
                  Disconnect
                </Button>
              </div>
              {asking === app.clientId ? (
                <div className="space-y-2 rounded-lg border px-3 py-2 text-sm">
                  <p>
                    Disconnect <bdi>“{app.name}”</bdi>? It has to sign in again to come back, and the budget app should refuse it at once.
                    Until the one-time update 0030 is in, it may still reach your budget for up to an hour. Turning off Let AI apps connect
                    stops that too.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="destructive" size="tall" disabled={busy} onClick={() => void end(app)}>
                      Yes, disconnect
                    </Button>
                    <Button
                      variant="outline"
                      size="tall"
                      disabled={busy}
                      onClick={() => {
                        settle(app)
                        setAsking(null)
                      }}
                    >
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="text-sm font-medium empty:sr-only">
        {said}
      </p>
    </div>
  )
}
