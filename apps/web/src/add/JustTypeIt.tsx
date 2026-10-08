import { useRef, useState, type ReactNode } from 'react'
import { useAppData } from '../app-data.js'
import { listRules } from '../ledger.js'
import { todayIso } from '../format.js'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { readQuickEntry, type QuickFill, type QuickHelp } from './quick-add.js'
import { LINE_LINK } from '../components/ui/link.js'

/** Why the AI did not fill the rest, in Add's own words, with the one place that fixes it. */
function stopped(help: Extract<QuickHelp, { kind: 'stopped' }>): ReactNode {
  const to = (href: string, words: string) => (
    <a href={href} className={LINE_LINK}>
      {words}
    </a>
  )
  switch (help.view.state) {
    case 'not_deployed':
    case 'needs_update':
    case 'helper_error':
      return <>The AI helper needs a one-time update to fill in the rest. {to(hashOf({ screen: 'help', param: 'updates' }), 'See One-time updates')}</>
    case 'not_set_up':
      return <>Turn on free AI to have the rest filled in. {to(hashOf({ screen: 'settings', param: 'ai' }), 'Turn on free AI (2 minutes)')}</>
    case 'off':
      return <>AI is off. {to(hashOf({ screen: 'settings', param: 'ai' }), 'Turn AI back on')}</>
    case 'limit_reached':
    case 'all_resting':
    case 'all_failed':
      return <>The AI is resting, so fill in the rest yourself. {to(hashOf({ screen: 'help', param: 'ai-rests' }), 'Why?')}</>
    default:
      return help.view.sentence
  }
}

function said(help: QuickHelp): ReactNode {
  if (help.kind === 'not_needed') return 'Filled in from what you typed. Check it, then press Add.'
  if (help.kind === 'asked' && help.filled > 0) return '✨ The AI filled in the rest. Check each field, then press Add.'
  return help.kind === 'stopped' ? (
    <>
      Filled in what the app could read. {stopped(help)}
    </>
  ) : (
    'Filled in what the app could read; fill in the rest, then press Add.'
  )
}

/**
 * Just type it (plan A22): one line, such as "coffee 4.50 yesterday", that
 * fills the typed form below it. It never saves: the form's own **Add**
 * does, once the owner has checked it (plan §3.9).
 */
export function JustTypeIt({ onFill, edits }: { onFill: (fill: QuickFill) => void; edits: { readonly current: number } }) {
  const { supabase, categories } = useAppData()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState<QuickHelp | null>(null)
  // Which reading is current. A slow AI's answer is dropped once the owner
  // has changed or sent the form meanwhile (`edits`, counted by the form),
  // so it never writes over what they typed (FE-4).
  const asked = useRef(0)

  const go = async () => {
    if (text.trim().length === 0) return
    const mine = ++asked.current
    const since = edits.current
    const current = () => mine === asked.current && since === edits.current
    setBusy(true)
    setHelp(null)
    try {
      // Without the learned rules the category is left for the owner or the AI; the rest still reads.
      const rules = await listRules(supabase).catch(() => new Map<string, string>())
      const read = await readQuickEntry(supabase, { text, asOf: todayIso(), rules, categories })
      if (!current()) return
      onFill(read.fill)
      setHelp(read.help)
    } catch {
      if (current()) setHelp({ kind: 'unreadable' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      <label htmlFor="just-type-it" className="flex items-center gap-1.5 text-sm font-semibold md:text-base">
        <Icon name="sparkles" className="size-4 shrink-0 text-primary" /> Just type it
      </label>
      <div className="flex gap-2">
        <Input
          id="just-type-it"
          className="min-w-0 flex-1"
          placeholder="e.g. coffee 4.50 yesterday"
          value={text}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="outline" className="min-h-11 shrink-0" disabled={busy}>
          {busy ? 'Reading…' : 'Fill in'}
        </Button>
      </div>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {help === null ? 'Say what, how much and when; “got paid 2100” is money in. Nothing is added until you press Add.' : said(help)}
      </p>
    </form>
  )
}
