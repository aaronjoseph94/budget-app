import { useState } from 'react'
import type { Fact, FactsDigest } from '@budget/core'
import { cardWords, dayLine, rankCards, type Card as CoachCard, type CardAction } from '@budget/savings-coach'
import { navigate } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Card } from '../components/ui/card.js'
import { CoachText } from './words.js'
import { WhySheet } from './WhySheet.js'

/**
 * The day's line and up to three cards (plan §2.3), in the app's own words
 * until the AI's arrive (A12). Which facts become cards, and in what order,
 * is savings-coach's; every figure is the engine's; this draws them.
 * Nothing is dismissed yet: ✕ arrives with the table that keeps a
 * dismissal on every device (0017, A17).
 */
const NOTHING_DISMISSED: ReadonlySet<string> = new Set()
const TONE = 'cheerleader'

/** The day's words and the summary they name, or null with no summary to speak of. */
export function todaysLine(facts: readonly Fact[]): { readonly text: string; readonly fact: Fact } | null {
  const line = dayLine({ facts, tone: TONE })
  const fact = line === null ? undefined : facts.find((f) => f.key === line.factKey)
  return line === null || fact === undefined ? null : { text: line.text, fact }
}

export function DayLine({ facts, className }: { facts: readonly Fact[]; className: string }) {
  const line = todaysLine(facts)
  if (line === null) return null
  return (
    <p className={className}>
      <CoachText text={line.text} facts={{ A: line.fact }} />
    </p>
  )
}

export function CoachCards({ digest }: { digest: FactsDigest | 'failed' | null }) {
  if (digest === null) return <p className="text-sm text-muted-foreground">Working out today’s insights…</p>
  if (digest === 'failed') {
    return <p className="text-sm text-muted-foreground">Your insights did not load. Reload to try again; everything else still works.</p>
  }
  const { cards } = rankCards({ facts: digest.facts, dismissed: NOTHING_DISMISSED })
  return (
    <section aria-label="Insights" className="space-y-3">
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing needs your attention today. The Coach speaks up when a category moves more than it usually does, or a
          budget runs close.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <li key={card.fact.key}>
              <InsightCard card={card} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const ACTION: Readonly<Record<CardAction, { readonly label: string; readonly go: () => void }>> = {
  import: { label: 'Import a statement', go: () => navigate('add') },
  review: { label: 'Open Review', go: () => navigate('review') },
  see_month: { label: 'See the Month', go: () => navigate('month') },
}

function InsightCard({ card }: { card: CoachCard }) {
  const [why, setWhy] = useState(false)
  const facts = { A: card.fact }
  const words = cardWords(card.template, TONE)
  const action = ACTION[card.action]
  return (
    <Card className="space-y-2 p-4">
      <h2 className="font-semibold [overflow-wrap:anywhere]">
        <CoachText text={words.title} facts={facts} />
      </h2>
      <p className="text-sm">
        <CoachText text={words.body} facts={facts} />
      </p>
      {words.tryThis === null ? null : (
        <p className="text-sm text-muted-foreground">
          <CoachText text={words.tryThis} facts={facts} />
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={action.go}>
          {action.label}
        </Button>
        <Button size="sm" variant="link" aria-haspopup="dialog" onClick={() => setWhy(true)}>
          Why am I seeing this?
        </Button>
      </div>
      {why ? <WhySheet fact={card.fact} title={words.title} onClose={() => setWhy(false)} /> : null}
    </Card>
  )
}
