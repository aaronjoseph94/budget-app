import { useState } from 'react'
import type { Fact, FactsDigest } from '@budget/core'
import { dayLine, rankCards, type Card as CoachCard, type CardAction, type Tone } from '@budget/savings-coach'
import { navigate } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Card } from '../components/ui/card.js'
import type { CardText, Narration, Words } from './narration.js'
import { CoachText } from './words.js'
import { WhySheet } from './WhySheet.js'

/**
 * The day's line and up to three cards (plan §2.3). Which facts become
 * cards, and in what order, is savings-coach's; which words each part
 * gets, the app's own or the AI's, is narration.ts's; every figure is the
 * engine's; this draws them. The AI's words carry ✨.
 */
const NOTHING_DISMISSED: ReadonlySet<string> = new Set()

/** Today's cards, as savings-coach ranks them: at most three, none the owner dismissed. */
export function todaysCards(facts: readonly Fact[], dismissed: ReadonlySet<string> = NOTHING_DISMISSED): readonly CoachCard[] {
  return rankCards({ facts, dismissed }).cards
}

/** The day's words and the summary they name, or null with no summary to speak of. */
export function todaysLine(facts: readonly Fact[], tone: Tone): { readonly text: string; readonly fact: Fact } | null {
  const line = dayLine({ facts, tone })
  const fact = line === null ? undefined : facts.find((f) => f.key === line.factKey)
  return line === null || fact === undefined ? null : { text: line.text, fact }
}

/** The AI's mark, said as words to a screen reader. */
export function Sparkle({ words }: { words: Words }) {
  if (!words.ai) return null
  return (
    <>
      <span aria-hidden="true">✨ </span>
      <span className="sr-only">Written by AI: </span>
    </>
  )
}

/** Words on screen, their figures filled from the engine as they are drawn. */
export function Said({ words }: { words: Words }) {
  return (
    <>
      <Sparkle words={words} />
      <CoachText text={words.text} facts={words.names} />
    </>
  )
}

export function DayLine({ words, className }: { words: Words | null; className: string }) {
  if (words === null) return null
  return (
    <p className={className}>
      <Said words={words} />
    </p>
  )
}

export function CoachCards(props: {
  digest: FactsDigest | 'failed' | null
  cards: readonly CoachCard[] | null
  narration: Narration | null
  /** Dismiss a card's cause; absent when a dismissal could not be kept (0017 missing). */
  onDismiss: ((card: CoachCard) => void) | null
}) {
  const { digest, cards: all, narration, onDismiss } = props
  if (digest === 'failed') {
    return <p className="text-sm text-muted-foreground">Your insights did not load. Reload to try again; everything else still works.</p>
  }
  if (digest === null || all === null || narration === null) return <p className="text-sm text-muted-foreground">Working out today’s insights…</p>
  // The forecast has a card of its own (ForecastCard); these are the ranked three.
  const cards = all.filter((c) => c.action !== 'forecast')
  return (
    <section aria-label="Insights" className="space-y-3">
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing needs your attention today. The Coach speaks up when a category moves more than it usually does, or a
          budget runs close.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.flatMap((card) => {
            const text = narration.cards.get(card.fact.key)
            return text === undefined
              ? []
              : [
                  <li key={card.fact.key}>
                    <InsightCard card={card} text={text} onDismiss={onDismiss === null ? null : () => onDismiss(card)} />
                  </li>,
                ]
          })}
        </ul>
      )}
    </section>
  )
}

const ACTION: Readonly<Record<CardAction, { readonly label: string; readonly go: () => void }>> = {
  import: { label: 'Import a statement', go: () => navigate('add') },
  review: { label: 'Open Review', go: () => navigate('review') },
  see_month: { label: 'See the Month', go: () => navigate('month') },
  goals: { label: 'See your goals', go: () => navigate('savings') },
  forecast: { label: 'Open the Forecast', go: () => navigate('forecast') },
  shops: { label: 'See your shops', go: () => navigate('reports') },
}

/**
 * The forecast's card on the Coach (plan §2.3, A13): where the month is
 * heading, in the app's words or the AI's, and the way to the Forecast.
 * Never dismissed: it is not an insight but the day's outlook.
 */
export function ForecastCard({ cards, narration }: { cards: readonly CoachCard[] | null; narration: Narration | null }) {
  const card = cards?.find((c) => c.action === 'forecast')
  const text = card === undefined ? undefined : narration?.cards.get(card.fact.key)
  if (card === undefined || text === undefined) return null
  return (
    <section aria-label="Forecast">
      <InsightCard card={card} text={text} onDismiss={null} />
    </section>
  )
}

function InsightCard({ card, text, onDismiss }: { card: CoachCard; text: CardText; onDismiss: (() => void) | null }) {
  const [why, setWhy] = useState(false)
  const action = ACTION[card.action]
  return (
    <Card className="words-in space-y-2 p-4">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">
          <Said words={text.title} />
        </h2>
        {onDismiss === null ? null : (
          <Button variant="ghost" size="icon" className="-mr-2 -mt-2 min-h-11 min-w-11 shrink-0" aria-label="Dismiss this insight" onClick={onDismiss}>
            ✕
          </Button>
        )}
      </div>
      <p className="text-sm [overflow-wrap:anywhere]">
        <CoachText text={text.body.text} facts={text.body.names} />
      </p>
      {text.tryThis === null ? null : (
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          <CoachText text={text.tryThis.text} facts={text.tryThis.names} />
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
      {why ? <WhySheet fact={card.fact} title={text.title} onClose={() => setWhy(false)} /> : null}
    </Card>
  )
}
