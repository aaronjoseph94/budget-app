import { useEffect, useMemo, useState } from 'react'
import type { Fact } from '@budget/core'
import { cardSignature, type Tone } from '@budget/savings-coach'
import type { Category } from '../ledger.js'
import { navigate } from '../nav.js'
import { useFunds } from '../funds.js'
import { useAppData } from '../app-data.js'
import { Icon } from '../components/ui/icons.js'
import { readNotes, signatureOf } from '../coach/ai-cache.js'
import { Said, todaysLine } from '../coach/CoachCards.js'
import { useCoachDay } from '../coach/day.js'
import { digestOf, useCoachRead, type DigestRows } from '../coach/facts.js'
import { reuse, type Words } from '../coach/narration.js'
import { useCoachSettings } from '../coach/settings.js'
import { askedHereToday, useNarration } from '../coach/use-narration.js'

/**
 * The Month's coach line (plan §2.2, D27): the Coach's day's line, above
 * the summary, and a tap to the Coach. Built only from what the Month
 * already read, this month and last; the summaries it speaks of need
 * nothing more (F27), so it is the Coach's very line. Loaded after the
 * Month draws, as its own chunk, inside an error boundary: if the digest
 * throws, the line is simply not there. It speaks in the owner's tone.
 *
 * The AI's words (A12): the app's own line shows first. Kept words whose
 * signature matches the Month's own summary replace it, marked ✨. With
 * none, and today's automatic ask unused, the line loads the Coach's
 * year in the background, after the Month has drawn, builds the Coach's
 * very Day and asks once; the Coach then finds the same words kept.
 */
export default function MonthCoachLine({ read, categories }: { read: DigestRows; categories: readonly Category[] }) {
  const tone = useCoachSettings()?.tone ?? null
  // An engine refusal throws here, during render, for the boundary to catch.
  const facts = useMemo(() => digestOf(read, categories).facts, [read, categories])
  const line = useMemo(() => (tone === null ? null : todaysLine(facts, tone)), [facts, tone])
  const kept = useKeptLine(line, tone, read.asOf)
  const [fresh, setFresh] = useState<Words | null>(null)
  if (line === null || tone === null) return null
  const words: Words = kept.state === 'found' ? kept.words : (fresh ?? { text: line.text, names: { A: line.fact }, ai: false })
  return (
    <>
      <button
        type="button"
        onClick={() => navigate('coach')}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
      >
        <span aria-live="polite" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span key={words.ai ? 'ai' : 'own'} className={words.ai ? 'words-in' : undefined}>
            <Said words={words} />
          </span>
          <span className="sr-only"> Open the Coach.</span>
        </span>
        <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {kept.state === 'none' && !kept.askedToday && fresh === null ? <FreshLine fact={line.fact} onWords={setFresh} /> : null}
    </>
  )
}

type Kept = { readonly state: 'looking' } | { readonly state: 'found'; readonly words: Words } | { readonly state: 'none'; readonly askedToday: boolean }

/** Kept AI words for the Month's own line, found by its signature; or whether today's ask is still unused. */
function useKeptLine(line: { readonly text: string; readonly fact: Fact } | null, tone: Tone | null, asOf: string): Kept {
  const { supabase } = useAppData()
  const [kept, setKept] = useState<Kept>({ state: 'looking' })
  useEffect(() => {
    if (line === null || tone === null) return
    let live = true
    void (async () => {
      const { fact } = line
      const sig = await signatureOf(cardSignature({ fact, template: `line:${fact.kind}:${fact.meaning}`, tone }))
      const read = await readNotes(supabase)
      if (!live) return
      const notes = read.ok ? read.notes : []
      // The line speaks of a month or a week, never a shop.
      const day = { tone, line, cards: [], goals: [], quotes: [], shareShopNames: true }
      const found = reuse(day, { factsSig: '', parts: new Map([[fact.key, sig]]) }, notes).narration.line
      if (found?.ai === true) setKept({ state: 'found', words: found })
      else setKept({ state: 'none', askedToday: askedHereToday(asOf) || notes.some((n) => n.scope === `day:${asOf}`) })
    })()
    return () => void (live = false)
  }, [supabase, line, tone, asOf])
  return kept
}

/**
 * The Coach's Day, built in the background, asked for once: its line's
 * words, drawn with the Month's own summary fact, which is the same fact.
 */
function FreshLine({ fact, onWords }: { fact: Fact; onWords: (words: Words) => void }) {
  const read = useCoachRead()
  const funds = useFunds()
  const { day, asOf } = useCoachDay(read, funds)
  const { narration, status } = useNarration(day, asOf, true)
  const said = narration?.line ?? null
  useEffect(() => {
    if (status !== 'ai' || said === null || !said.ai || day?.line?.fact.key !== fact.key) return
    onWords({ ...said, names: Object.fromEntries(Object.keys(said.names).map((letter) => [letter, fact])) })
  }, [status, said, day, fact, onWords])
  return null
}
