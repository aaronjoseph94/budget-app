/**
 * Reports → Shops' charges worth a second look (plan §2.6, A17; F39): one
 * far above its category's usual, a first large charge at a new shop, the
 * same charge twice, and a typed charge a statement also holds. Each is
 * pointed out, never hidden: the list shows every one, whatever the Coach's
 * cards show, and nothing is left out of a total. Every figure is core's.
 */
import type { ChargePair, UnusualCharges } from '@budget/core'
import { formatCents, formatDayMonth } from '../format.js'
import { hashOf } from '../nav.js'
import { Section } from '../forecast/parts.js'

interface Flag {
  readonly key: string
  readonly title: string
  readonly shop: string
  readonly detail: string
  readonly help: string | null
}

/** A pair's shop, as core names it (F39). */
function pairShop(pair: ChargePair): string {
  return pair.shop === '' ? 'A charge' : pair.shop
}

function flagsOf(unusual: UnusualCharges, nameOf: (id: string) => string): Flag[] {
  return [
    ...unusual.doubles.map((p) => ({
      key: `double:${p.first.id}:${p.second.id}`,
      title: 'Possible repeat charge',
      shop: pairShop(p),
      detail: `${formatCents(p.amountCents)} on ${formatDayMonth(p.first.postedOn)}, and the same again on ${formatDayMonth(p.second.postedOn)}.`,
      help: 'If one was a mistake, ask the shop for a refund.',
    })),
    ...unusual.countedTwice.map((p) => {
      // Either may come first by date; each date goes with the row it belongs to.
      const [added, imported] = p.first.by === 'hand' ? [p.first, p.second] : [p.second, p.first]
      return {
        key: `twice:${p.first.id}:${p.second.id}`,
        title: 'Maybe counted twice',
        shop: pairShop(p),
        detail: `${formatCents(p.amountCents)} you added on ${formatDayMonth(added.postedOn)}, and ${formatCents(p.amountCents)} from your statement on ${formatDayMonth(imported.postedOn)}.`,
        help: 'If they are one purchase, remove the one you added in All transactions.',
      }
    }),
    ...unusual.large.map((c) => ({
      key: `large:${c.id}`,
      title: 'Bigger than usual',
      shop: c.shop,
      detail: `${formatCents(c.amountCents)} on ${formatDayMonth(c.postedOn)}. A usual charge in ${nameOf(c.categoryId)} is about ${formatCents(c.usualCents)}.`,
      help: null,
    })),
    ...unusual.newShop.map((c) => ({
      key: `new:${c.id}`,
      title: 'First charge from a new shop',
      shop: c.shop,
      detail: `${formatCents(c.amountCents)} on ${formatDayMonth(c.postedOn)}.`,
      help: null,
    })),
  ]
}

export function SecondLookCard({ unusual, nameOf }: { unusual: UnusualCharges; nameOf: (id: string) => string }) {
  const flags = flagsOf(unusual, nameOf)
  return (
    <Section title="Worth a second look" large>
      <p className="text-muted-foreground">Pointed out for you to check. Nothing is hidden, and every charge still counts in your totals.</p>
      {flags.length === 0 ? (
        <p>Nothing unusual in these days.</p>
      ) : (
        <ul className="divide-y">
          {flags.map((f) => (
            <li key={f.key} className="space-y-1 py-3">
              <p className="font-medium [overflow-wrap:anywhere]">
                {f.title}: {f.shop}
              </p>
              <p className="tnum">{f.detail}</p>
              {f.help === null ? null : <p className="text-muted-foreground">{f.help}</p>}
            </li>
          ))}
        </ul>
      )}
      {unusual.countedTwice.length === 0 ? null : (
        <a href={hashOf({ screen: 'ledger', param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
          Open All transactions
        </a>
      )}
    </Section>
  )
}
