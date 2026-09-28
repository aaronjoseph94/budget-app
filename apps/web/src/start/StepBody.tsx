import { useState } from 'react'
import { useAppData } from '../app-data.js'
import { saveDisplayName } from '../profile.js'
import { ARTICLES, boldParts } from '../help/articles.js'
import { hashOf, type Screen } from '../nav.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input } from '../components/ui/form.js'
import { SetupLists } from '../screens/SetupScreen.js'
import { openFromHomeScreen } from './checks.js'
import type { StepId } from './steps.js'

export interface StepBodyProps {
  readonly id: StepId
  /** The name as saved, or as just typed and saved here. */
  readonly name: string
  readonly onNamed: (name: string) => void
  readonly phoneTicked: boolean
  /** Keep the iPhone step's tick; throws with a sentence when it was not kept. */
  readonly onTick: (ticked: boolean) => Promise<void>
}

/** Where each step's editor lives, until this screen holds it itself. */
const ELSEWHERE: Readonly<Partial<Record<StepId, { readonly screen: Screen; readonly words: string }>>> = {
  goals: { screen: 'savings', words: 'Open Savings' },
  statement: { screen: 'add', words: 'Open Add' },
  balance: { screen: 'month', words: 'Open the Month' },
  ai: { screen: 'ai', words: 'Open AI settings' },
}

/** The control each step puts on its screen. */
export function StepBody(props: StepBodyProps) {
  if (props.id === 'name') return <NameStep name={props.name} onNamed={props.onNamed} />
  if (props.id === 'phone') return <PhoneStep ticked={props.phoneTicked} onTick={props.onTick} />
  // Setup's own cards: the starter list and everyday spending, then income, then the three that owe.
  if (props.id === 'lists') return <SetupLists kinds={['variable']} starter />
  if (props.id === 'pay') return <SetupLists kinds={['income']} />
  if (props.id === 'bills') return <SetupLists kinds={['bill', 'debt', 'subscription']} />
  const there = ELSEWHERE[props.id]
  return there === undefined ? null : (
    <a href={hashOf({ screen: there.screen, param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
      {there.words}
    </a>
  )
}

/** Step 1: the name Setup's "My name is" keeps, saved the same way. */
function NameStep({ name, onNamed }: { name: string; onNamed: (name: string) => void }) {
  const { supabase } = useAppData()
  const [text, setText] = useState(name)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    const trimmed = text.trim()
    if (trimmed === '') {
      setSaid({ ok: false, text: 'Type your first name, then press Save.' })
      return
    }
    setBusy(true)
    try {
      await saveDisplayName(supabase, trimmed)
      onNamed(trimmed)
      setSaid({ ok: true, text: `Saved. Hello, ${trimmed}.` })
    } catch (cause) {
      setSaid({ ok: false, text: cause instanceof Error ? cause.message : 'Your name was not saved.' })
    }
    setBusy(false)
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Field label="Your first name">
        <Input value={text} maxLength={60} autoComplete="given-name" onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
      {said === null ? null : said.ok ? (
        <p role="status" className="text-sm text-income">
          {said.text}
        </p>
      ) : (
        <Alert tone="error">{said.text}</Alert>
      )}
    </form>
  )
}

const IPHONE = ARTICLES.find((a) => a.id === 'iphone')

/** Step 9: Help's own four steps, and a tick for when it is done where the app cannot see it. */
function PhoneStep({ ticked, onTick }: { ticked: boolean; onTick: (ticked: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  if (openFromHomeScreen()) {
    return <p className="text-base">You’re using the app from your home screen, so this one is done.</p>
  }
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-2 pl-5 text-base">
        {IPHONE?.steps.map((step) => (
          <li key={step}>
            {boldParts(step).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
          </li>
        ))}
      </ol>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={ticked}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.checked
            setBusy(true)
            setProblem(null)
            onTick(next)
              .catch((cause: unknown) => setProblem(cause instanceof Error ? cause.message : 'That was not saved. Try again.'))
              .finally(() => setBusy(false))
          }}
        />
        It’s on my home screen
      </label>
      {problem !== null ? <Alert tone="error">{problem}</Alert> : null}
    </div>
  )
}
