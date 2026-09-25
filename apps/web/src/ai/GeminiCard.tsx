import { useId, useState, type FormEvent } from 'react'
import type { AiServiceStatus } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { Input, NativeSelect } from '../components/ui/form.js'
import { hashOf } from '../nav.js'
import { chooseGeminiModel, forgetGeminiKey, saveGeminiKey, testGeminiKey, type KeyResult } from './keys.js'

/** Where Google gives out free Gemini keys: a fixed address, opened in a new tab. */
export const GET_A_KEY = 'https://aistudio.google.com/apikey'

/**
 * Free Google Gemini, in three steps (plan §8.3): get a free key, paste it,
 * Save & test. A key is read from the field only when it is sent, and the
 * field is emptied at once: it is never held in the screen's state, and
 * nothing shows more of it than its last four characters.
 *
 * `onChanged` asks AI settings to read the helper's status again, quietly,
 * so the sentence at the top follows what happened here.
 */
export function GeminiCard({
  gemini,
  outdated,
  onChanged,
}: {
  readonly gemini: AiServiceStatus
  /** The deployed helper is older than this app, so it cannot take a key yet (N78). */
  readonly outdated: boolean
  readonly onChanged: () => void
}) {
  const { supabase, userId } = useAppData()
  const [shown, setShown] = useState(false)
  const [working, setWorking] = useState<null | 'save' | 'test' | 'forget' | 'model'>(null)
  const [result, setResult] = useState<KeyResult | null>(null)
  const ids = { steps: useId(), key: useId(), model: useId() }

  const run = async (step: NonNullable<typeof working>, act: () => Promise<KeyResult | null>) => {
    setWorking(step)
    const next = await act()
    setWorking(null)
    if (next !== null) setResult(next)
    onChanged()
  }

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('gemini-key')
    if (!(input instanceof HTMLInputElement)) return
    const pasted = input.value
    input.value = ''
    setShown(false)
    void run('save', () => saveGeminiKey(supabase, pasted))
  }

  const forget = () =>
    void run('forget', async () => {
      const gone = await forgetGeminiKey(supabase)
      return gone === true ? { sentence: 'Key removed.', good: true, help: null, models: null } : gone
    })

  const choose = (model: string) =>
    void run('model', async () =>
      (await chooseGeminiModel(supabase, userId, model))
        ? null
        : { sentence: 'Couldn’t save that choice just now. Try again.', good: false, help: null, models: result?.models ?? null },
    )

  // The three steps: open while there is no key, folded under "Paste a different key" once there is one.
  const steps = (
    <form onSubmit={save} aria-labelledby={ids.steps}>
      <h3 id={ids.steps} className="sr-only">
        Turn on free Gemini
      </h3>
      <ol className="space-y-4">
        <li className="space-y-1">
          <p className="text-sm font-medium">Step 1</p>
          <a
            href={GET_A_KEY}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border bg-card px-4 text-base font-medium shadow-sm hover:bg-accent"
          >
            Get a free key ↗
          </a>
          <p className="text-sm text-muted-foreground">Google AI Studio opens in a new tab. Press Create API key, then copy it.</p>
        </li>
        <li className="space-y-2">
          <label htmlFor={ids.key} className="block text-sm font-medium">
            Step 2: paste it here
          </label>
          <div className="flex gap-2">
            <Input
              id={ids.key}
              type={shown ? 'text' : 'password'}
              name="gemini-key"
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

  const already = gemini.source === 'secret'
  const saved = gemini.source === 'saved'
  // A saved key Google turned down, or one no longer opened, is pasted again: the steps stay open.
  const again = saved && (gemini.status === 'locked' || gemini.status === 'rejected')
  const ending = gemini.hint === null ? '' : ` ending …${gemini.hint}`
  const models = result?.models ?? null

  if (outdated) {
    return (
      <section aria-labelledby="ai-gemini" className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        <h2 id="ai-gemini" className="text-lg font-semibold">
          Free Google Gemini
        </h2>
        <p className="text-base">The AI helper you installed is an older copy, so it can’t take a key yet. Everything else works.</p>
        <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
          Open One-time updates
        </a>
      </section>
    )
  }

  return (
    <section aria-labelledby="ai-gemini" className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ai-gemini" className="text-lg font-semibold">
          Free Google Gemini
        </h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Recommended</span>
      </div>
      {already ? (
        <p className="text-base">
          <span className="font-medium">Already on</span>, with your receipts key{ending}. There is nothing to paste.
        </p>
      ) : saved ? (
        <p className="text-base">{SAVED_SAYS[gemini.status ?? 'ok'](ending)}</p>
      ) : (
        <p className="text-base">Free, and about 2 minutes. A key is a password Google gives you for the app to use.</p>
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
          <a href={hashOf({ screen: 'help', param: result.help })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
            {result.help === 'updates' ? 'Open One-time updates' : 'Show me how'}
          </a>
        )}
      </div>
      {already || saved ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" disabled={working !== null} onClick={() => void run('test', () => testGeminiKey(supabase))}>
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
          <NativeSelect id={ids.model} value={gemini.model} disabled={working !== null} onChange={(e) => choose(e.target.value)}>
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

/** What the card says of a saved key, from its last test. */
const SAVED_SAYS: Readonly<Record<NonNullable<AiServiceStatus['status']>, (ending: string) => string>> = {
  ok: (ending) => `Your key${ending} is saved.`,
  busy: (ending) => `Your key${ending} is saved. Google was busy when it was last tried.`,
  rejected: (ending) => `Google turned down your key${ending}. Paste it again below.`,
  locked: (ending) => `Your key${ending} can’t be opened after a Supabase key change. Paste it again below.`,
}
