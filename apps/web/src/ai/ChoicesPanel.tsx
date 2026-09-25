import { useEffect, useId, useState } from 'react'
import type { AiProvider, AiServiceStatus, AiStatusReply } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { hashOf } from '../nav.js'
import { moved, readChoices, saveChoices, type AiChoices } from './choices.js'

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
 * Try in this order (plan §8.3, A11), with each service's key. Each change is saved to ai_settings at once, and the
 * helper follows it from its next call. If 0016 is not in, this panel says
 * so in one line and the rest of AI settings still works.
 */
export function ChoicesPanel({ status, onChanged }: { readonly status: AiStatusReply; readonly onChanged: () => void }) {
  const { supabase, userId } = useAppData()
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { order: useId() }

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
          ? 'Choosing the order needs a one-time update. '
          : 'Couldn’t load your AI choices just now. Check your connection and try again. '}
        {loaded.state === 'missing' ? (
          <a href={hashOf({ screen: 'help', param: 'updates' })} className="font-medium underline underline-offset-4">
            One-time updates
          </a>
        ) : null}
      </p>
    )
  }

  const { choices } = loaded
  const change = async (next: AiChoices) => {
    setSaving(true)
    setProblem(null)
    setLoaded({ state: 'ready', choices: next })
    const saved = await saveChoices(supabase, userId, next)
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
    <div className="space-y-4">
      <section aria-labelledby={ids.order} className="space-y-2">
        <h2 id={ids.order} className="px-1 text-sm font-medium text-muted-foreground">
          Try in this order
        </h2>
        <ol className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {services.map((s, i) => (
            <li key={s.provider} className="flex items-center gap-2 py-2 pl-4 pr-2">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {i + 1}. {NAME[s.provider]}
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-normal">{s.tier === 'free' ? 'Free' : 'Paid'}</span>
                </span>
                <span className="block text-sm text-muted-foreground">{keyLine(s)}</span>
              </span>
              <Button
                variant="ghost"
                className="size-11 shrink-0 p-0"
                aria-label={`Move ${NAME[s.provider]} up`}
                disabled={saving || i === 0}
                onClick={() => void change({ ...choices, order: moved(choices.order, s.provider, -1) })}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                className="size-11 shrink-0 p-0"
                aria-label={`Move ${NAME[s.provider]} down`}
                disabled={saving || i === services.length - 1}
                onClick={() => void change({ ...choices, order: moved(choices.order, s.provider, 1) })}
              >
                ↓
              </Button>
            </li>
          ))}
        </ol>
        <p className="px-1 text-sm text-muted-foreground">When one is busy or out of free uses, the next is asked.</p>
      </section>

      <p className="px-1 text-sm text-muted-foreground">
        Today: {status.today.used} of {status.today.cap} AI calls. Resets overnight.
      </p>

      <p aria-live="polite" className="px-1 text-base font-medium text-destructive">
        {problem}
      </p>
    </div>
  )
}
