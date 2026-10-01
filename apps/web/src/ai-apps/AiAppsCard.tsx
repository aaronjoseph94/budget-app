import { useEffect, useId, useState } from 'react'
import { useAppData } from '../app-data.js'
import { hashOf } from '../nav.js'
import { Section } from '../forecast/parts.js'
import { SWITCH } from '../components/ui/form.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { readAccess, saveAccess, type Access } from './access.js'

type Loaded = { readonly state: 'loading' | 'needs_update' | 'unreachable' } | { readonly state: 'ready'; readonly access: Access }

const SAVE_FAILED = { needs_update: 'That needs a one-time update first. See One-time updates in Help.', unreachable: 'Couldn’t save that just now. Try again.' }

/**
 * Settings → AI apps (PLAN §2.9, ADR 0012): Let AI apps connect, off until
 * the owner turns it on, and Let them add to Review. Each switch is saved
 * at once; a save that fails puts the switch back as it is stored.
 */
export function AiAppsCard() {
  const { supabase, userId } = useAppData()
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [saving, setSaving] = useState(false)
  const [said, setSaid] = useState('')
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
              ? 'On: an AI app you connect can read your figures and search your charges. It cannot approve, change or delete anything.'
              : 'Off: no AI app can read your figures or add anything.'}
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
            </>
          ) : null}
        </>
      ) : null}
      <p aria-live="polite" className="text-base font-medium empty:sr-only">
        {said}
      </p>
    </Section>
  )
}
