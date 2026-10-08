import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiServiceStatus } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { aiStatus, NOT_SET_UP_HERE, type AiView } from '../ai/client.js'
import { ChoicesLine, ChoicesPanel, useAiChoices, UseAiSwitch } from '../ai/ChoicesPanel.js'
import { CoachPanel } from '../ai/CoachPanel.js'
import { KeyCard } from '../ai/KeyCard.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { MonthTitle } from '../components/ui/type.js'
import { HelpButton } from '../help/HelpButton.js'
import { isOlder } from '../help/updates.js'
import { hashOf } from '../nav.js'
import { LINE_LINK } from '../components/ui/link.js'
import { cn } from '../lib/cn.js'

/**
 * AI settings (plan §8.3; ADR 0015): Use AI and one true sentence on
 * whether AI is on at the top, the free Gemini card (A10: paste a key,
 * test it, remove it, choose a model), the other four services' cards
 * folded under More AI services, then the order they are tried in, Use
 * paid services and the daily limit with today's calls (A11); and how
 * the Coach talks (A12), which is shown even with no helper, since the
 * app's own words follow its tone too.
 *
 * Its own chunk. A helper not installed, or 0016 not pasted, is said here
 * with the way to fix it; elsewhere the app's own words stand in. Only the
 * newest check is shown, as One-time updates does.
 */
export function AiSettingsScreen() {
  const { supabase } = useAppData()
  const [view, setView] = useState<AiView | null>(null)
  const latest = useRef(0)

  // Quiet after a step on a card or a choice: the page stays as it is until the new status arrives.
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

  // The choices are read from ai_settings itself, so Use AI is there with no helper installed.
  const choices = useAiChoices(() => void check(true))
  const status = view?.status ?? null
  return (
    // Mockup A: a reading width of its own, the status across the top, then
    // from 1280px the keys on the left and the choices and the Coach's tone
    // on the right, each column read top to bottom.
    <div className="max-w-5xl space-y-5">
      {/* AI settings has no sidebar item of its own; its way back is on the page (design-review P1 item 2). */}
      <a href={hashOf({ screen: 'settings', param: null })} className={cn('-mb-2', LINE_LINK, 'text-sm')}>
        ← Settings
      </a>
      <div className="flex flex-wrap items-center gap-1">
        <MonthTitle>AI settings</MonthTitle>
        <HelpButton screen="ai" />
      </div>
      {/* The one card tinted to the accent, as each screen's one hero is; its
        tile is the accent's, not the mockup's green, which names Income. */}
      <section
        aria-labelledby="ai-now"
        className="space-y-3 rounded-xl border bg-gradient-to-r from-card to-primary-tint p-5 sm:px-6 [--muted-foreground:var(--canvas-muted)]"
      >
        <h2 id="ai-now" className="sr-only">
          AI now
        </h2>
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="sparkles" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <UseAiSwitch choices={choices} />
          </div>
        </div>
        <p aria-live="polite" className="text-lg font-semibold leading-snug">
          {view === null ? 'Checking the AI helper…' : view.state === 'not_set_up' ? NOT_SET_UP_HERE : view.sentence}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {view === null || view.help === null ? null : (
            <a href={hashOf({ screen: 'help', param: view.help })} className={cn(LINE_LINK, 'text-sm')}>
              {view.help === 'updates' ? 'Open One-time updates' : 'Show me how'}
            </a>
          )}
          {/* aria-disabled, not disabled, while it checks: disabled drops focus (FE-6, e2e-setup-01). */}
          <Button variant="outline" aria-disabled={view === null} onClick={() => {
            if (view !== null) void check()
          }}>
            {view === null ? 'Checking…' : 'Check again'}
          </Button>
        </div>
      </section>
      {choices.loaded.state === 'missing' || choices.loaded.state === 'unreachable' ? <ChoicesLine state={choices.loaded.state} /> : null}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        {status === null ? null : (
          <div className="space-y-5">
            <KeyCard
              service={status.services.find((s) => s.provider === 'gemini') ?? GEMINI_NONE}
              outdated={isOlder(status.version)}
              allowPaid={status.allowPaid}
              onChanged={() => void check(true)}
            />
            <details className="group rounded-xl border bg-card px-5 sm:px-6">
              <summary className="flex min-h-11 cursor-pointer items-center py-4 text-lg font-semibold leading-snug">
                More AI services: Groq, OpenRouter, and paid ones
              </summary>
              <div className="space-y-4 pb-5">
                <p className="text-sm text-muted-foreground">
                  Optional. When Gemini is busy or out of free uses, the next service with a key answers instead.
                </p>
                {status.services
                  .filter((s) => s.provider !== 'gemini')
                  .map((s) => (
                    <KeyCard key={s.provider} service={s} outdated={isOlder(status.version)} allowPaid={status.allowPaid} onChanged={() => void check(true)} />
                  ))}
              </div>
            </details>
          </div>
        )}
        <div className="space-y-5">
          {status === null ? null : <ChoicesPanel status={status} choices={choices} />}
          <CoachPanel />
        </div>
      </div>
    </div>
  )
}

// The helper always lists Gemini; this is only what the card shows if a reply ever did not.
const GEMINI_NONE: AiServiceStatus = { provider: 'gemini', tier: 'free', source: 'none', hint: null, status: null, model: 'gemini-3.5-flash-lite' }
