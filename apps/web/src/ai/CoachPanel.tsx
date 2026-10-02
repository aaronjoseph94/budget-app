import { useEffect, useId, useState } from 'react'
import type { Tone } from '@budget/savings-coach'
import { useAppData } from '../app-data.js'
import { hashOf } from '../nav.js'
import { readCoachSettings, saveCoachSettings, type CoachSettings } from './coach-settings.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { SWITCH } from '../components/ui/form.js'

type Loaded = { readonly state: 'loading' } | { readonly state: 'missing' | 'unreachable' } | { readonly state: 'ready'; readonly settings: CoachSettings }

const TONES: readonly { readonly tone: Tone; readonly name: string; readonly says: string }[] = [
  { tone: 'cheerleader', name: 'Cheerleader', says: 'A win first, then one thing to try. Never shaming.' },
  { tone: 'straight', name: 'Straight talker', says: 'Says it plainly, and still gives one thing to try.' },
]

/**
 * Coach tone and Share shop names (plan §8.3, A12). Shown whether or not
 * the AI helper is installed, since the app's own words follow the tone
 * too. Each change is saved at once; if 0016 is not in, this says so in
 * one line and the rest of AI settings still works.
 */
export function CoachPanel() {
  const { supabase, userId } = useAppData()
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { title: useId(), share: useId(), shareHint: useId() }

  useEffect(() => {
    let live = true
    void readCoachSettings(supabase, userId).then((read) => {
      if (live) setLoaded(read.ok ? { state: 'ready', settings: read.settings } : { state: read.why === 'needs_update' ? 'missing' : 'unreachable' })
    })
    return () => void (live = false)
  }, [supabase, userId])

  const change = async (settings: CoachSettings, next: CoachSettings) => {
    setSaving(true)
    setProblem(null)
    setLoaded({ state: 'ready', settings: next })
    const saved = await saveCoachSettings(supabase, userId, next)
    setSaving(false)
    if (saved === true) return
    // Show what is really stored: the change did not happen.
    setLoaded({ state: 'ready', settings })
    setProblem(saved === 'needs_update' ? 'That needs a one-time update first. See One-time updates in Help.' : 'Couldn’t save that just now. Try again.')
  }

  return (
    <section aria-labelledby={ids.title} className="space-y-3 rounded-xl border bg-card p-5 sm:p-6">
      <h2 id={ids.title} className="text-lg font-semibold leading-tight">
        How the Coach talks
      </h2>
      {loaded.state === 'loading' ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {loaded.state === 'missing' || loaded.state === 'unreachable' ? (
        <p className="text-base">
          {loaded.state === 'missing'
            ? 'Choosing the Coach’s tone needs a one-time update. Until then it cheers you on. '
            : 'Couldn’t load the Coach’s tone just now. Check your connection and try again.'}
          {loaded.state === 'missing' ? (
            <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
              One-time updates
            </a>
          ) : null}
        </p>
      ) : null}
      {loaded.state === 'ready' ? (
        <>
          <fieldset className="space-y-2">
            <legend className="sr-only">Tone</legend>
            {TONES.map((t) => (
              // Mockup A's option cards; the chosen one on the accent's soft fill, edged in
              // the accent, its muted words in canvas-muted, which reads there.
              <label
                key={t.tone}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:[--muted-foreground:var(--canvas-muted)]"
              >
                <input
                  type="radio"
                  name="coach-tone"
                  className="mt-1 size-5 shrink-0 accent-primary"
                  checked={loaded.settings.tone === t.tone}
                  disabled={saving}
                  onChange={() => void change(loaded.settings, { ...loaded.settings, tone: t.tone })}
                />
                <span className="min-w-0">
                  <span className="block text-base font-semibold">{t.name}</span>
                  <span className="block text-sm text-muted-foreground">{t.says}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label htmlFor={ids.share} className="flex min-h-11 cursor-pointer items-center gap-3 border-t pt-3">
            <span className="flex-1 text-base font-semibold">Share shop names with the AI</span>
            <input
              id={ids.share}
              type="checkbox"
              role="switch"
              aria-describedby={ids.shareHint}
              className={SWITCH}
              checked={loaded.settings.shareShopNames}
              disabled={saving}
              onChange={(e) => void change(loaded.settings, { ...loaded.settings, shareShopNames: e.target.checked })}
            />
          </label>
          <p id={ids.shareHint} className="text-sm text-muted-foreground">
            {loaded.settings.shareShopNames
              ? 'On: when the Coach speaks of a shop, or Review asks for a category, the AI sees its name, with long numbers hidden. The Coach and Review never send an amount or a date; Just type it and receipt photos send what you give them.'
              : 'Off: the Coach tells the AI “a shop” instead of the name, and Review suggests no categories. The Coach and Review never send an amount or a date; Just type it and receipt photos send what you give them.'}
          </p>
          <a href={hashOf({ screen: 'help', param: 'ai-sees' })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
            What the AI sees
          </a>
        </>
      ) : null}
      <p aria-live="polite" className="text-base font-medium text-destructive">
        {problem}
      </p>
    </section>
  )
}
