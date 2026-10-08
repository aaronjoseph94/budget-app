import type { AiView } from '../ai/client.js'
import { KeyCard } from '../ai/KeyCard.js'
import { UpdatesPanel } from '../help/UpdatesPanel.js'
import { isOlder } from '../help/updates.js'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { LINE_LINK } from '../components/ui/link.js'
import { cn } from '../lib/cn.js'

/**
 * Step 8, turn on free AI (plan §8.1): honest about time. With the AI
 * helper not installed, or its one-time update not pasted, One-time
 * updates comes first, with its own live check; that is about 15
 * minutes, once, easiest on a computer. Then AI settings' own Gemini
 * card: get a free key, paste it, Save & test, under 2 minutes on an
 * iPhone. With a key that works already, or the receipts key, or AI
 * switched off by choice, there is nothing to do here.
 */
export function AiStep({ ai, onChanged }: { ai: AiView | null; onChanged: () => void }) {
  if (ai === null) return <p className="text-sm text-muted-foreground">Asking the AI helper…</p>
  const settings = (
    <a href={hashOf({ screen: 'settings', param: 'ai' })} className={cn(LINE_LINK, 'text-sm')}>
      More services and choices are in AI settings
    </a>
  )
  if (ai.state === 'not_deployed' || ai.state === 'needs_update') {
    return (
      <div className="space-y-3">
        <p className="text-base">
          First, the one-time updates: about 15 minutes, once, and easiest on a computer. The key itself then takes under 2 minutes, on your iPhone too.
        </p>
        <UpdatesPanel />
        <Button variant="outline" onClick={onChanged}>
          Done these? Check the AI again
        </Button>
      </div>
    )
  }
  const status = ai.status
  const gemini = status?.services.find((s) => s.provider === 'gemini')
  const ready = ai.state === 'on' || ai.state === 'off' || ai.state === 'limit_reached' || ai.state === 'all_resting' || ai.state === 'all_failed'
  return (
    <div className="space-y-3">
      <p aria-live="polite" className="text-base font-medium">
        {ai.sentence}
      </p>
      {ready || status === null || gemini === undefined ? null : (
        <KeyCard service={gemini} outdated={isOlder(status.version)} allowPaid={status.allowPaid} onChanged={onChanged} />
      )}
      {status === null ? (
        <Button variant="outline" onClick={onChanged}>
          Check again
        </Button>
      ) : (
        settings
      )}
    </div>
  )
}
