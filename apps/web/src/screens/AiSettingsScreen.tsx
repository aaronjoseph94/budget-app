import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiServiceStatus } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { aiStatus, type AiView } from '../ai/client.js'
import { Button } from '../components/ui/button.js'
import { HelpButton } from '../help/HelpButton.js'
import { hashOf } from '../nav.js'

/**
 * AI settings (plan §8.3), first version: one true sentence on whether AI
 * is on, the services and where each one's key comes from, and today's
 * calls against the daily limit. Pasting a key arrives with A10, and the
 * order, paid services, the limit and the tone with A11.
 *
 * Its own chunk, and the only screen that asks the helper anything, so a
 * helper not installed, or 0016 not pasted, changes this page and nothing
 * else. Only the newest check is shown, as One-time updates does.
 */
export function AiSettingsScreen() {
  const { supabase } = useAppData()
  const [view, setView] = useState<AiView | null>(null)
  const latest = useRef(0)

  const check = useCallback(async () => {
    const run = ++latest.current
    setView(null)
    const next = await aiStatus(supabase)
    if (run === latest.current) setView(next)
  }, [supabase])

  useEffect(() => {
    void check()
    return () => void ++latest.current
  }, [check])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI settings</h1>
        <HelpButton screen="ai" />
      </div>
      <section aria-labelledby="ai-now" className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h2 id="ai-now" className="sr-only">
          AI now
        </h2>
        <p aria-live="polite" className="text-base font-medium leading-snug">
          {view === null ? 'Checking the AI helper…' : view.sentence}
        </p>
        {view === null || view.help === null ? null : (
          <a
            href={hashOf({ screen: 'help', param: view.help })}
            className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
          >
            {view.help === 'updates' ? 'Open One-time updates' : 'Show me how'}
          </a>
        )}
        <Button variant="outline" disabled={view === null} onClick={() => void check()}>
          {view === null ? 'Checking…' : 'Check again'}
        </Button>
      </section>
      {view === null || view.status === null ? null : (
        <section aria-labelledby="ai-services" className="space-y-2">
          <h2 id="ai-services" className="px-1 text-sm font-medium text-muted-foreground">
            AI services, in the order they are tried
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
            {view.status.services.map((s) => (
              <li key={s.provider} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{NAME[s.provider]}</span>
                  <span className="block text-sm text-muted-foreground">{keyLine(s)}</span>
                </span>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{s.tier === 'free' ? 'Free' : 'Paid'}</span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-sm text-muted-foreground">
            Today: {view.status.today.used} of {view.status.today.cap} AI calls. Resets overnight.
          </p>
        </section>
      )}
    </div>
  )
}

const NAME: Readonly<Record<AiServiceStatus['provider'], string>> = {
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
