import { useId, useState, type FormEvent } from 'react'
import type { AiProvider, AiServiceStatus } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { Input, NativeSelect } from '../components/ui/form.js'
import { Badge } from '../components/ui/feedback.js'
import { cn } from '../lib/cn.js'
import { hashOf } from '../nav.js'
import { chooseModel, COMPANY, forgetKey, saveKey, shortModel, speedTest, testKey, type KeyResult } from './keys.js'
import { SERVICE_NAME } from './client.js'
import { LINE_LINK } from '../components/ui/link.js'

/**
 * What each service's card says (plan §8.3). Each key comes from the
 * service's own page, a fixed address opened in a new tab; the helper,
 * never the page, is what talks to the service. Free services may keep
 * what they are sent, as the owner accepted for Gemini (ADR 0002), and
 * each free card says so in a few words before a key is pasted (ADR
 * 0004, ADR 0015); whether it is quick is what the owner asked to know.
 */
const CARDS: Readonly<Record<AiProvider, { readonly getKey: string; readonly getLabel: string; readonly where: string; readonly about: string }>> = {
  gemini: {
    getKey: 'https://aistudio.google.com/apikey',
    getLabel: 'Get a free key ↗',
    where: 'Google AI Studio opens in a new tab. Press Create API key, then copy it.',
    about: 'Free. Reads photos. Slow for some. May keep what it is sent.',
  },
  groq: {
    getKey: 'https://console.groq.com/keys',
    getLabel: 'Get a free Groq key ↗',
    where: 'Groq’s console opens in a new tab. Sign in, press Create API Key, then copy it.',
    about: 'Free and very quick. Reads photos. May keep what it is sent.',
  },
  openrouter: {
    getKey: 'https://openrouter.ai/settings/keys',
    getLabel: 'Get a free OpenRouter key ↗',
    where: 'OpenRouter opens in a new tab. Sign in, press Create API Key, then copy it.',
    about: 'Free and quick. Reads photos. May keep what it is sent.',
  },
  openai: {
    getKey: 'https://platform.openai.com/api-keys',
    getLabel: 'Get an OpenAI key ↗',
    where: 'OpenAI opens in a new tab. Sign in, press Create new secret key, then copy it.',
    about: 'Paid: OpenAI bills you for each use. Tried only when Use paid services is on.',
  },
  anthropic: {
    getKey: 'https://platform.claude.com/settings/keys',
    getLabel: 'Get an Anthropic key ↗',
    where: 'Anthropic opens in a new tab. Sign in, press Create Key, then copy it.',
    about: 'Paid: Anthropic bills you for each use. Tried only when Use paid services is on.',
  },
}

/**
 * One AI service's key, in three steps (plan §8.3): get a key, paste it,
 * Save & test. A key is read from the field only when it is sent, and the
 * field is emptied at once: it is never held in the screen's state, and
 * nothing shows more of it than its last four characters.
 *
 * Each card names its service by its one name with a Free or Paid chip,
 * and the model the app will use on it (ADR 0015); the order they sit in
 * says which is tried first. Gemini's says "Already on" when the receipts
 * secret is set. A paid service's saved key says it waits for Use paid
 * services. `onChanged` asks AI settings to read the helper's status
 * again, quietly, so the sentence at the top follows what happened.
 *
 * `frame` is `card` on its own, or `row` as one of a card's rows, parted
 * by the parent's rules.
 */
export function KeyCard({
  service,
  outdated,
  allowPaid,
  onChanged,
  frame = 'card',
}: {
  readonly service: AiServiceStatus
  /** The deployed helper is older than this app, so it cannot take this key yet (N78). */
  readonly outdated: boolean
  readonly allowPaid: boolean
  readonly onChanged: () => void
  readonly frame?: 'card' | 'row'
}) {
  const { supabase, userId } = useAppData()
  const provider = service.provider
  const card = CARDS[provider]
  const title = SERVICE_NAME[provider]
  const frameClass = frame === 'card' ? CARD : ROW
  const [shown, setShown] = useState(false)
  const [working, setWorking] = useState<null | 'save' | 'test' | 'speed' | 'forget' | 'model'>(null)
  const [result, setResult] = useState<KeyResult | null>(null)
  const ids = { title: useId(), steps: useId(), key: useId(), model: useId() }

  const run = async (step: NonNullable<typeof working>, act: () => Promise<KeyResult | null>) => {
    setWorking(step)
    const next = await act()
    setWorking(null)
    if (next !== null) setResult(next)
    onChanged()
  }

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem(`${provider}-key`)
    if (!(input instanceof HTMLInputElement)) return
    const pasted = input.value
    input.value = ''
    setShown(false)
    void run('save', () => saveKey(supabase, provider, pasted))
  }

  const forget = () =>
    void run('forget', async () => {
      const gone = await forgetKey(supabase, provider)
      return gone === true ? { sentence: 'Key removed.', good: true, help: null, models: null } : gone
    })

  const choose = (model: string) =>
    void run('model', async () =>
      (await chooseModel(supabase, userId, provider, model))
        ? null
        : { sentence: 'Couldn’t save that choice just now. Try again.', good: false, help: null, models: result?.models ?? null },
    )

  // The three steps: open while there is no key, folded under "Paste a different key" once there is one.
  const steps = (
    <form onSubmit={save} aria-labelledby={ids.steps}>
      <h3 id={ids.steps} className="sr-only">
        Turn on {title}
      </h3>
      <ol className="space-y-4">
        <li className="space-y-1">
          <p className="text-sm font-medium">Step 1</p>
          <a
            href={card.getKey}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border bg-card px-4 text-base font-medium hover:bg-accent"
          >
            {card.getLabel}
          </a>
          <p className="text-sm text-muted-foreground">{card.where}</p>
        </li>
        <li className="space-y-2">
          <label htmlFor={ids.key} className="block text-sm font-medium">
            Step 2: paste it here
          </label>
          <div className="flex gap-2">
            <Input
              id={ids.key}
              type={shown ? 'text' : 'password'}
              name={`${provider}-key`}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1"
            />
            <Button variant="outline" className="min-h-11" aria-pressed={shown} onClick={() => setShown((s) => !s)}>
              {shown ? 'Hide' : 'Show'}
            </Button>
          </div>
        </li>
        <li className="space-y-1">
          <p className="text-sm font-medium">Step 3</p>
          <Button type="submit" className="min-h-11" disabled={working !== null}>
            {working === 'save' ? 'Testing…' : 'Save & test'}
          </Button>
        </li>
      </ol>
    </form>
  )

  const already = service.source === 'secret'
  const saved = service.source === 'saved'
  // A saved key its service turned down, or one no longer opened, is pasted again: the steps stay open.
  const again = saved && (service.status === 'locked' || service.status === 'rejected')
  const ending = service.hint === null ? '' : ` ending …${service.hint}`
  const models = result?.models ?? null
  const waitsForPaid = saved && !again && service.tier === 'paid' && !allowPaid

  const heading = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={ids.title} className="text-lg font-semibold">
          {title}
        </h2>
        {/* Mockup A: Free and Paid as quiet outlined chips. */}
        <Badge variant="outline">{service.tier === 'free' ? 'Free' : 'Paid'}</Badge>
      </div>
      {/* The model the helper will ask: the owner's choice, else the service's first (plan §3.3). */}
      <p className="text-sm text-muted-foreground">Uses {shortModel(service.model)}</p>
    </div>
  )

  if (outdated) {
    return (
      <section aria-labelledby={ids.title} className={cn('space-y-2', frameClass)}>
        {heading}
        <p className="text-base">The AI helper you installed is an older copy, so it can’t take a key yet. Everything else works.</p>
        <a href={hashOf({ screen: 'help', param: 'updates' })} className={cn(LINE_LINK, 'text-sm')}>
          Open One-time updates
        </a>
      </section>
    )
  }

  return (
    <section aria-labelledby={ids.title} className={cn('space-y-4', frameClass)}>
      {heading}
      {already ? (
        <p className="text-base">
          <span className="font-medium">Already on</span>, with your receipts key{ending}. There is nothing to paste.
        </p>
      ) : waitsForPaid ? (
        <p className="text-base">Saved{ending === '' ? '' : `, key${ending}`}. Not used until you turn on paid services.</p>
      ) : saved ? (
        <p className="text-base">{savedSays(COMPANY[provider], service.status ?? 'ok', ending)}</p>
      ) : (
        <p className="text-base">{card.about}</p>
      )}
      {(already || saved) && !again ? (
        <details className="rounded-lg border px-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium">Paste a different key</summary>
          <div className="pb-3">{steps}</div>
        </details>
      ) : (
        steps
      )}
      <div aria-live="polite" className="space-y-1">
        {result === null ? null : <p className={result.good ? 'text-base font-medium' : 'text-base font-medium text-destructive'}>{result.sentence}</p>}
        {result?.help == null ? null : (
          <a href={hashOf({ screen: 'help', param: result.help })} className={cn(LINE_LINK, 'text-sm')}>
            {result.help === 'updates' ? 'Open One-time updates' : 'Show me how'}
          </a>
        )}
      </div>
      {already || saved ? (
        <div className="flex flex-wrap gap-2">
          {/* Test: one real call, timed, so the owner can see which service is quick (ADR 0015). A key not usable yet has nothing to time. */}
          {again || waitsForPaid ? null : (
            <Button className="min-h-11" disabled={working !== null} onClick={() => void run('speed', () => speedTest(supabase, provider))}>
              {working === 'speed' ? 'Testing…' : 'Test'}
            </Button>
          )}
          <Button variant="outline" className="min-h-11" disabled={working !== null} onClick={() => void run('test', () => testKey(supabase, provider))}>
            {working === 'test' ? 'Checking…' : 'Check which models work'}
          </Button>
          {saved ? (
            <Button variant="outline" className="min-h-11" disabled={working !== null} onClick={forget}>
              {working === 'forget' ? 'Removing…' : 'Remove key'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {models === null || models.length === 0 ? null : (
        <div className="space-y-2">
          <label htmlFor={ids.model} className="block text-sm font-medium">
            Model
          </label>
          <NativeSelect id={ids.model} value={service.model} disabled={working !== null} onChange={(e) => choose(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.listed}>
                {m.listed ? m.id : `${m.id} (not available for this key)`}
              </option>
            ))}
          </NativeSelect>
          <p className="text-sm text-muted-foreground">The first on the list is the app’s everyday choice: quick, and the most free uses a day.</p>
        </div>
      )}
    </section>
  )
}

/** Mockup A's card: flat, 16px corners, 20 to 24px in. */
const CARD = 'rounded-xl border bg-card p-5 sm:p-6'
/** One row of a card that lists several services, parted by the card's rules. */
const ROW = 'py-5 first:pt-0 last:pb-0'

/** What the card says of a saved key, from its last test. */
function savedSays(company: string, status: NonNullable<AiServiceStatus['status']>, ending: string): string {
  return {
    ok: `Your key${ending} is saved.`,
    busy: `Your key${ending} is saved. ${company} was busy when it was last tried.`,
    rejected: `${company} turned down your key${ending}. Paste it again below.`,
    locked: `Your key${ending} can’t be opened after a Supabase key change. Paste it again below.`,
  }[status]
}
