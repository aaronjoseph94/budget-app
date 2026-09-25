import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button.js'
import { HELPER_FILE } from './updates.js'

/** The updates the site carries under /setup/ (ADR 0007): 0015 on, and the AI helper. */
export function isCopyable(file: string): boolean {
  return file === HELPER_FILE || Number(/^(\d{4})_[a-z0-9_]+\.sql$/.exec(file)?.[1] ?? 0) >= 15
}

/**
 * What the file's first line must be before it is offered. A static host
 * answers a path it does not have with the app's own page, which must
 * never be pasted into Supabase; each committed update opens with its own
 * name, and the helper with its own.
 */
function looksRight(file: string, text: string): boolean {
  const first = text.slice(0, text.indexOf('\n'))
  return file === HELPER_FILE ? first.startsWith('// ai — the AI helper') : first === `-- ${file}`
}

type Got = { readonly kind: 'getting' } | { readonly kind: 'ready'; readonly text: string } | { readonly kind: 'failed' }
type Said = 'none' | 'copied' | 'select'

/**
 * Copy beside the next update (plan §8.2). The file is fetched when the
 * step shows, so the tap itself only writes to the clipboard, which Safari
 * on an iPhone allows only during the tap. If the clipboard is refused, the
 * text is shown in a box to select by hand; if the file cannot be fetched,
 * the GitHub link beside this stays the way round.
 */
export function CopyFile({ file }: { file: string }) {
  const [got, setGot] = useState<Got>({ kind: 'getting' })
  const [said, setSaid] = useState<Said>('none')

  useEffect(() => {
    let live = true
    setGot({ kind: 'getting' })
    setSaid('none')
    fetch(`/setup/${file}`, { cache: 'no-cache' })
      .then(async (res) => (res.ok ? res.text() : null))
      .catch(() => null)
      .then((text) => {
        if (live) setGot(text !== null && looksRight(file, text) ? { kind: 'ready', text } : { kind: 'failed' })
      })
    return () => void (live = false)
  }, [file])

  if (got.kind === 'failed') return <p>Couldn’t get the file here. Open it on GitHub below instead.</p>
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSaid('copied')
    } catch {
      setSaid('select')
    }
  }
  return (
    <div className="space-y-2">
      <Button disabled={got.kind !== 'ready'} onClick={() => void (got.kind === 'ready' ? copy(got.text) : undefined)}>
        {got.kind === 'ready' ? `Copy ${file === HELPER_FILE ? 'the AI helper' : file}` : 'Getting the file…'}
      </Button>
      <p aria-live="polite">
        {said === 'copied' ? 'Copied. Now paste it into Supabase.' : said === 'select' ? 'Your browser didn’t allow copying. Select all of the text below and copy it.' : ''}
      </p>
      {said === 'select' && got.kind === 'ready' ? (
        <textarea
          readOnly
          aria-label={`The text of ${file}`}
          value={got.text}
          onFocus={(e) => e.currentTarget.select()}
          className="h-40 w-full rounded-md border bg-card p-2 font-mono text-base"
        />
      ) : null}
    </div>
  )
}
