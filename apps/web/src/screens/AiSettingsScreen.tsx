import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiProvider, AiServiceStatus, AiStatusReply } from '@budget/schema'
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
 * AI settings (plan §8.3; ADR 0015), read top to bottom: Use AI and one
 * true sentence on whether AI is on; the Free AI card, the three free
 * services in the order they are tried, each with its key steps (A10:
 * paste a key, test it, remove it, choose a model) and Test; then
 * Advanced, folded, with the paid services' keys, the order, Use paid
 * services and the daily limit with today's calls (A11), and how the
 * Coach talks (A12), which is there even with no helper, since the app's
 * own words follow its tone too.
 *
 * Its own chunk. A helper not installed, or 0016 not pasted, is said here
 * with the way to fix it; elsewhere the app's own words stand in. Only the
 * newest check is shown, as One-time updates does. `embedded` draws it as
 * a tab of Settings: no title or way back of its own.
 */
export function AiSettingsScreen({ embedded = false }: { readonly embedded?: boolean }) {
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
  // The services in the order they are tried: the owner's, once read; the helper's own until then.
  const ordered = status === null ? [] : inOrder(status, choices.loaded.state === 'ready' ? choices.loaded.choices.order : [])
  const card = (service: AiServiceStatus) =>
    status === null ? null : <KeyCard key={service.provider} frame="row" service={service} outdated={isOlder(status.version)} allowPaid={status.allowPaid} onChanged={() => void check(true)} />

  return (
    // Mockup A: a reading width of its own, read top to bottom in one column.
    <div className="max-w-3xl space-y-5">
      {embedded ? null : (
        <>
          {/* AI settings has no sidebar item of its own; its way back is on the page (design-review P1 item 2). */}
          <a href={hashOf({ screen: 'settings', param: null })} className={cn('-mb-2', LINE_LINK, 'text-sm')}>
            ← Settings
          </a>
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>AI settings</MonthTitle>
            <HelpButton screen="ai" />
          </div>
        </>
      )}
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
      {status === null ? null : (
        <section aria-labelledby="free-ai" className={CARD}>
          <div className="space-y-1 pb-5">
            <h2 id="free-ai" className="text-lg font-semibold leading-tight">
              Free AI
            </h2>
            <p className="text-sm text-muted-foreground">Tried in this order. Each needs a free key.</p>
          </div>
          <div className="divide-y">{ordered.filter((s) => s.tier === 'free').map(card)}</div>
        </section>
      )}
      <details className="group rounded-xl border bg-card px-5 sm:px-6">
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-baseline gap-x-3 py-4">
          <span className="text-lg font-semibold leading-snug">Advanced</span>
          <span className="text-sm text-muted-foreground">Paid services, limits, order, Coach tone</span>
        </summary>
        <div className="space-y-5 pb-5">
          {status === null ? null : <div className={cn('divide-y', CARD)}>{ordered.filter((s) => s.tier === 'paid').map(card)}</div>}
          {status === null ? null : <ChoicesPanel status={status} choices={choices} />}
          <CoachPanel />
        </div>
      </details>
    </div>
  )
}

/** Mockup A's card: flat, 16px corners, 20 to 24px in. */
const CARD = 'rounded-xl border bg-card p-5 sm:p-6'

/** The helper's services in the owner's order, any it leaves out after, as the helper tries them. */
function inOrder(status: AiStatusReply, order: readonly AiProvider[]): readonly AiServiceStatus[] {
  const rank = new Map(order.map((p, i) => [p, i]))
  return [...status.services].sort((a, b) => (rank.get(a.provider) ?? order.length) - (rank.get(b.provider) ?? order.length))
}
