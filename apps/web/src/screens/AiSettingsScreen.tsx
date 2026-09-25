import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiServiceStatus } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { aiStatus, type AiView } from '../ai/client.js'
import { ChoicesPanel } from '../ai/ChoicesPanel.js'
import { KeyCard } from '../ai/KeyCard.js'
import { Button } from '../components/ui/button.js'
import { HelpButton } from '../help/HelpButton.js'
import { isOlder } from '../help/updates.js'
import { hashOf } from '../nav.js'

/**
 * AI settings (plan §8.3): one true sentence on whether AI is on, the free
 * Gemini card (A10: paste a key, test it, remove it, choose a model), and
 * the order the services are tried in, with where each one's key comes
 * from (A11); today's calls against the daily limit.
 *
 * Its own chunk, and the only screen that asks the helper anything, so a
 * helper not installed, or 0016 not pasted, changes this page and nothing
 * else. Only the newest check is shown, as One-time updates does.
 */
export function AiSettingsScreen() {
  const { supabase } = useAppData()
  const [view, setView] = useState<AiView | null>(null)
  const latest = useRef(0)

  // Quiet after a step on the card: the page stays as it is until the new status arrives.
  const check = useCallback(async (quiet = false) => {
    const run = ++latest.current
    if (!quiet) setView(null)
    const next = await aiStatus(supabase)
    if (run === latest.current) setView(next)
  }, [supabase])

  useEffect(() => {
    void check()
    return () => void ++latest.current
  }, [check])

  const status = view?.status ?? null
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
      {status === null ? null : (
        <>
          <KeyCard
            service={status.services.find((s) => s.provider === 'gemini') ?? GEMINI_NONE}
            outdated={isOlder(status.version)}
            allowPaid={status.allowPaid}
            onChanged={() => void check(true)}
          />
          <ChoicesPanel status={status} onChanged={() => void check(true)} />
        </>
      )}
    </div>
  )
}

// The helper always lists Gemini; this is only what the card shows if a reply ever did not.
const GEMINI_NONE: AiServiceStatus = { provider: 'gemini', tier: 'free', source: 'none', hint: null, status: null, model: 'gemini-3.5-flash-lite' }
