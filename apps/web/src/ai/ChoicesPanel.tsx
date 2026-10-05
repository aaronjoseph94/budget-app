import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { AiProvider, AiServiceStatus, AiStatusReply } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { NativeSelect, SWITCH } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { hashOf } from '../nav.js'
import { DAILY_CAPS, moved, readChoices, saveChoices, saveEnabled, type AiChoices } from './choices.js'
import { SENTENCE_LINK } from '../components/ui/link.js'

const NAME: Readonly<Record<AiProvider, string>> = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

const TESTED: Readonly<Record<NonNullable<AiServiceStatus['status']>, string>> = {
  ok: 'works',
  busy: 'was busy when last tried',
  rejected: 'was turned down: paste it again',
  locked: 'can’t be opened after a Supabase key change: paste it again',
}

/** Where a service's key comes from, in words: never the key, at most its last four characters. */
function keyLine(s: AiServiceStatus): string {
  const ending = s.hint === null ? '' : ` ending …${s.hint}`
  if (s.source === 'secret') return `Your receipts key${ending}, from Supabase`
  if (s.source === 'none') return 'No key yet'
  return `Key${ending}${s.status === null ? '' : ` ${TESTED[s.status]}`}`
}

type Loaded = { readonly state: 'loading' } | { readonly state: 'missing' | 'unreachable' } | { readonly state: 'ready'; readonly choices: AiChoices }

/**
 * Use AI, the switch that stops anything being sent to an AI service
 * (plan §8.3, backend-c2-01), then Try in this order, Use paid services
 * and Daily limit (plan §8.3, A11),
 * with today's calls. Each change is saved to ai_settings at once, and the
 * helper follows it from its next call. If 0016 is not in, this panel says
 * so in one line and the rest of AI settings still works.
 */
export function ChoicesPanel({ status, onChanged }: { readonly status: AiStatusReply; readonly onChanged: () => void }) {
  const { supabase, userId } = useAppData()
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { use: useId(), order: useId(), paid: useId(), cap: useId(), capHint: useId() }
  // Every control is greyed with aria-disabled while a change saves, not
  // disabled: a browser drops focus from a control that is disabled, and a
  // second Enter on "Move … up" went nowhere (FE-6, e2e-setup-01). The move
  // button last pressed is also given back focus when its row is moved in
  // the page, which drops it the same way.
  const pressed = useRef<HTMLButtonElement | null>(null)
  useLayoutEffect(() => {
    const button = pressed.current
    if (button !== null && button.isConnected && (document.activeElement === null || document.activeElement === document.body)) button.focus()
  }, [loaded])

  useEffect(() => {
    let live = true
    void readChoices(supabase, userId).then((read) => {
      if (!live) return
      setLoaded(read.ok ? { state: 'ready', choices: read.choices } : { state: read.why === 'needs_update' ? 'missing' : 'unreachable' })
    })
    return () => void (live = false)
  }, [supabase, userId])

  if (loaded.state === 'loading') return <p className="px-1 text-sm text-muted-foreground">Loading your AI choices…</p>
  if (loaded.state !== 'ready') {
    return (
      <p className="px-1 text-base">
        {loaded.state === 'missing'
          ? 'Choosing the order, paid services and a daily limit needs a one-time update. '
          : 'Couldn’t load your AI choices just now. Check your connection and try again. '}
        {loaded.state === 'missing' ? (
          <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
            One-time updates
          </a>
        ) : null}
      </p>
    )
  }

  const { choices } = loaded
  const change = async (next: AiChoices) => {
    if (saving) return
    setSaving(true)
    setProblem(null)
    setLoaded({ state: 'ready', choices: next })
    // The switch writes its own column alone; the rest write theirs together.
    const saved = next.enabled !== choices.enabled ? await saveEnabled(supabase, userId, next.enabled) : await saveChoices(supabase, userId, next)
    setSaving(false)
    if (saved !== true) {
      // Show what is really stored: the change did not happen.
      setLoaded({ state: 'ready', choices })
      setProblem(saved === 'needs_update' ? 'That needs a one-time update first. See One-time updates in Help.' : 'Couldn’t save that just now. Try again.')
      return
    }
    onChanged()
  }
  const byProvider = new Map(status.services.map((s) => [s.provider, s]))
  const services = choices.order.flatMap((p) => byProvider.get(p) ?? [])

  return (
    <div className="space-y-2">
      {/* Mockup A: the order, paid services and the daily limit in one card, split by rules. */}
      <div className="divide-y rounded-xl border bg-card px-5 sm:px-6">
        <section aria-label="Use AI" className="space-y-1 pb-4 pt-4 sm:pt-5">
          <label htmlFor={ids.use} className="flex min-h-11 cursor-pointer items-center gap-3">
            <span className="flex-1 text-lg font-semibold leading-tight">Use AI</span>
            <input
              id={ids.use}
              type="checkbox"
              role="switch"
              className={SWITCH}
              checked={choices.enabled}
              aria-disabled={saving}
              onChange={(e) => void change({ ...choices, enabled: e.target.checked })}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            {choices.enabled
              ? 'On: the services below are asked, in their order, for the Coach, suggestions, Just type it and receipt photos.'
              : 'Off: the Coach, suggestions, Just type it and receipt photos send nothing to any AI service and use the app’s own words. AI apps you connect have their own switch in Settings.'}
          </p>
        </section>

        <section aria-labelledby={ids.order} className="space-y-3 pb-5 pt-5">
          <h2 id={ids.order} className="text-lg font-semibold leading-tight">
            Try in this order
          </h2>
          <ol className="divide-y overflow-hidden rounded-lg border">
            {services.map((s, i) => (
              <li key={s.provider} className="flex items-center gap-2 py-2 pl-4 pr-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {i + 1}. {NAME[s.provider]}
                    <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal">{s.tier === 'free' ? 'Free' : 'Paid'}</span>
                  </span>
                  <span className="block text-sm text-muted-foreground">{keyLine(s)}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11 shrink-0 text-muted-foreground"
                  aria-label={`Move ${NAME[s.provider]} up`}
                  aria-disabled={saving || i === 0}
                  onClick={(e) => {
                    if (i === 0) return
                    pressed.current = e.currentTarget
                    void change({ ...choices, order: moved(choices.order, s.provider, -1) })
                  }}
                >
                  <Icon name="up" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11 shrink-0 text-muted-foreground"
                  aria-label={`Move ${NAME[s.provider]} down`}
                  aria-disabled={saving || i === services.length - 1}
                  onClick={(e) => {
                    if (i === services.length - 1) return
                    pressed.current = e.currentTarget
                    void change({ ...choices, order: moved(choices.order, s.provider, 1) })
                  }}
                >
                  <Icon name="down" />
                </Button>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">When one is busy or out of free uses, the next is asked.</p>
        </section>

        <section aria-label="Use paid services" className="space-y-1 py-4">
          {/* The whole row is the switch's label, so the target is the row's 44 px, not the box's. */}
          <label htmlFor={ids.paid} className="flex min-h-11 cursor-pointer items-center gap-3">
            <span className="flex-1 text-base font-semibold">Use paid services</span>
            <input
              id={ids.paid}
              type="checkbox"
              role="switch"
              className={SWITCH}
              checked={choices.allowPaid}
              aria-disabled={saving}
              onChange={(e) => void change({ ...choices, allowPaid: e.target.checked })}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            {choices.allowPaid
              ? 'On: OpenAI and Anthropic are asked, in the order above, when their key is saved. They bill you for each use.'
              : 'Off: OpenAI and Anthropic are never asked, even with a key saved, so nothing is billed.'}
          </p>
        </section>

        <section aria-label="Daily limit" className="space-y-2 pb-5 pt-4 sm:pb-6">
          <label htmlFor={ids.cap} className="block text-base font-semibold">
            Daily limit
          </label>
          <NativeSelect
            id={ids.cap}
            aria-describedby={ids.capHint}
            value={String(choices.dailyCap)}
            aria-disabled={saving}
            onChange={(e) => void change({ ...choices, dailyCap: Number(e.target.value) })}
          >
            {[...new Set([...DAILY_CAPS, choices.dailyCap])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {n} AI calls a day
              </option>
            ))}
          </NativeSelect>
          <p id={ids.capHint} className="text-sm text-muted-foreground">
            Today: {status.today.used} of {status.today.cap}. Resets overnight. Past the limit, the app uses its own words until tomorrow.
          </p>
        </section>
      </div>
      <p aria-live="polite" className="px-1 text-base font-medium text-destructive">
        {problem}
      </p>
    </div>
  )
}
