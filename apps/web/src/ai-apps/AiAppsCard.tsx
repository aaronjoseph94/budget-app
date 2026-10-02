import { Fragment, useEffect, useId, useState } from 'react'
import { useAppData } from '../app-data.js'
import { hashOf } from '../nav.js'
import type { HelpTopic } from '../help/topics.js'
import { Section } from '../forecast/parts.js'
import { SWITCH } from '../components/ui/form.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { HELPER_FILE, READ_RECEIPT_FILE, SERVER_FILE, SIGNUPS_OFF, aiAppsReady } from '../help/updates.js'
import { readAccess, saveAccess, type Access } from './access.js'
import { ConnectNew } from './ConnectNew.js'
import { ConnectedApps } from './ConnectedApps.js'

type Loaded = { readonly state: 'loading' | 'needs_update' | 'unreachable' } | { readonly state: 'ready'; readonly access: Access }

const HELP: readonly (readonly [HelpTopic, string])[] = [
  ['connect-claude', 'Connect Claude'],
  ['connect-chatgpt', 'Connect ChatGPT'],
  ['ai-apps', 'What AI apps can do'],
]

const SAVE_FAILED = { needs_update: 'That needs a one-time update first. See One-time updates in Help.', unreachable: 'Couldn’t save that just now. Try again.' }

/** Why AI apps cannot be switched on yet (mcp-3-03), with One-time updates beside it. */
const FIRST = (file: string | null) =>
  file === SIGNUPS_OFF
    ? 'Turn off Allow new users to sign up in Supabase first.'
    : file === HELPER_FILE
      ? 'Paste the AI helper’s new version first.'
      : file === READ_RECEIPT_FILE
        ? 'Delete read-receipt, or paste its new version, first.'
        : file === SERVER_FILE
          ? 'Paste the AI apps server’s new version first.'
          : file === null
            ? 'Couldn’t check the one-time updates just now. Try again.'
            : 'That needs a one-time update first.'

/**
 * Settings → AI apps (PLAN §2.9, ADR 0012): Let AI apps connect, off until
 * the owner turns it on; while on, Let them add to Review, the address to
 * paste and Connect a new AI app; and the apps connected, each with
 * Disconnect. Each switch is saved at once; a save that fails puts the
 * switch back as it is stored.
 */
export function AiAppsCard() {
  const { supabase, userId } = useAppData()
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [saving, setSaving] = useState(false)
  const [said, setSaid] = useState('')
  const [first, setFirst] = useState(false)
  const ids = { on: useId(), onHint: useId(), add: useId(), addHint: useId() }

  useEffect(() => {
    let live = true
    void readAccess(supabase, userId).then((read) => {
      if (live) setLoaded(read.ok ? { state: 'ready', access: read.access } : { state: read.why })
    })
    return () => void (live = false)
  }, [supabase, userId])

  const change = async (was: Access, next: Access, saved: Parameters<typeof saveAccess>[2]) => {
    setSaving(true)
    setSaid('')
    setFirst(false)
    // Switching on waits for what keeps an AI app's token harmless (mcp-3-03); off never waits.
    if (saved.enabled === true) {
      const ready = await aiAppsReady(supabase)
      if (!ready.ready) {
        setSaving(false)
        setSaid(FIRST(ready.file))
        setFirst(true)
        return
      }
    }
    setLoaded({ state: 'ready', access: next })
    const outcome = await saveAccess(supabase, userId, saved)
    setSaving(false)
    if (outcome === true) return
    setLoaded({ state: 'ready', access: was })
    setSaid(SAVE_FAILED[outcome])
  }

  return (
    <Section large title="AI apps">
      <p className="text-muted-foreground">
        Ask Claude or ChatGPT about your budget, and let them add purchases to Review. Nothing they add counts until you approve it.
      </p>
      {/* Help's articles, readable before the switch is on (M12a). */}
      <p className="text-sm">
        Step by step:{' '}
        {HELP.map(([topic, words], i) => (
          <Fragment key={topic}>
            {i === 0 ? null : ' · '}
            <a href={hashOf({ screen: 'help', param: topic })} className={SENTENCE_LINK}>
              {words}
            </a>
          </Fragment>
        ))}
      </p>
      {loaded.state === 'loading' ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {loaded.state === 'needs_update' ? (
        <p>
          AI apps need a one-time update first.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
            One-time updates
          </a>
        </p>
      ) : null}
      {loaded.state === 'unreachable' ? <p>Couldn’t load your AI apps settings just now. Check your connection and try again.</p> : null}
      {loaded.state === 'ready' ? (
        <>
          <label htmlFor={ids.on} className="flex min-h-11 cursor-pointer items-center gap-3">
            <span className="flex-1 text-base font-semibold">Let AI apps connect</span>
            <input
              id={ids.on}
              type="checkbox"
              role="switch"
              aria-describedby={ids.onHint}
              className={SWITCH}
              checked={loaded.access.enabled}
              disabled={saving}
              onChange={(e) => void change(loaded.access, { ...loaded.access, enabled: e.target.checked }, { enabled: e.target.checked })}
            />
          </label>
          <p id={ids.onHint} className="text-sm text-muted-foreground">
            {loaded.access.enabled
              ? 'On: an AI app you connect can read your figures and search your charges. In your budget it cannot approve, change or delete anything.'
              : 'Off: no AI app can reach your budget. This does not end an app’s sign-in; Disconnect, below, should.'}
          </p>
          {loaded.access.enabled ? (
            <>
              <label htmlFor={ids.add} className="flex min-h-11 cursor-pointer items-center gap-3 border-t pt-3">
                <span className="flex-1 text-base font-semibold">Let them add to Review</span>
                <input
                  id={ids.add}
                  type="checkbox"
                  role="switch"
                  aria-describedby={ids.addHint}
                  className={SWITCH}
                  checked={loaded.access.allowAdd}
                  disabled={saving}
                  onChange={(e) => void change(loaded.access, { ...loaded.access, allowAdd: e.target.checked }, { allowAdd: e.target.checked })}
                />
              </label>
              <p id={ids.addHint} className="text-sm text-muted-foreground">
                {loaded.access.allowAdd
                  ? 'On: they can add a purchase or money received to Review, where it waits for you.'
                  : 'Off: they can only read. Nothing is added to Review.'}
              </p>
              <ConnectNew />
            </>
          ) : null}
        </>
      ) : null}
      <p aria-live="polite" className="text-base font-medium empty:sr-only">
        {said}
        {first ? (
          <>
            {' '}
            <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
              One-time updates
            </a>
          </>
        ) : null}
      </p>
      <ConnectedApps on={loaded.state === 'ready' && loaded.access.enabled} />
    </Section>
  )
}
