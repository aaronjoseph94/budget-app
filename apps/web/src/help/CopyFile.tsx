import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button.js'
import { HELPER_FILE, READ_RECEIPT_FILE } from './updates.js'

/** What Copy calls each Edge Function; a migration is called by its file name. */
const NAMED: Readonly<Record<string, string>> = { [HELPER_FILE]: 'the AI helper', [READ_RECEIPT_FILE]: 'read-receipt' }

/** The updates the site carries under /setup/ (ADR 0007): 0015 on, the AI helper and read-receipt. */
export function isCopyable(file: string): boolean {
  return file in NAMED || Number(/^(\d{4})_[a-z0-9_]+\.sql$/.exec(file)?.[1] ?? 0) >= 15
}

/**
 * What the file's first line must be before it is offered. A static host
 * answers a path it does not have with the app's own page, which must
 * never be pasted into Supabase; each committed update opens with its own
 * name, and each function with its own.
 */
function looksRight(file: string, text: string): boolean {
  const first = text.slice(0, text.indexOf('\n'))
  if (file === HELPER_FILE) return first.startsWith('// ai — the AI helper')
  if (file === READ_RECEIPT_FILE) return first.startsWith('// read-receipt — a photo of a receipt in')
  return first === `-- ${file}`
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
    // A column with gaps, not space-y: an empty live line is taken out of
    // the flow (sr-only), so it leaves no gap under Copy, and stays in the
    // accessibility tree so "Copied" is still said when it arrives (N77).
    <div className="flex flex-col items-start gap-2">
      <Button disabled={got.kind !== 'ready'} onClick={() => void (got.kind === 'ready' ? copy(got.text) : undefined)}>
        {got.kind === 'ready' ? `Copy ${NAMED[file] ?? file}` : 'Getting the file…'}
      </Button>
      <p aria-live="polite" className="empty:sr-only">
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
