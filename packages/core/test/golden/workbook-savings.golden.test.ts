import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { savingsFundPlan, type SavingsFundPlan } from '../../src/savings.js'

/**
 * External check: Workbook's first two savings funds, each figure a cached value
 * from the Savings tab, reached from its typed goal, current amount and
 * dates. Then the one cell the app deliberately does not copy.
 */

interface Fund {
  fund: string
  goalCents: number
  currentCents: number
  startDate: string | null
  goalDate: string | null
}
interface Cell {
  fund: string
  cell: string
  field: keyof SavingsFundPlan
  value: number
}
interface Departure {
  fund: string
  cell: string
  field: keyof SavingsFundPlan
  cachedCents: number
  divergence: string
}

const golden = loadGolden<{ funds: Fund[] }, Cell[], { departures: Departure[] }>('workbook-savings')

function planOf(name: string): SavingsFundPlan {
  const f = golden.input.funds.find((x) => x.fund === name)
  if (f === undefined) throw new Error(`No fund ${name} in the fixture`)
  return savingsFundPlan({
    goalCents: f.goalCents,
    currentCents: f.currentCents,
    startDate: f.startDate === null ? null : isoDate(f.startDate),
    goalDate: f.goalDate === null ? null : isoDate(f.goalDate),
  })
}

describe("savingsFundPlan replays Workbook's Savings tab (workbook-savings)", () => {
  it.each(golden.expected)('$fund: $cell = $value', (c) => {
    expect(planOf(c.fund)[c.field]).toBe(c.value)
  })
})

describe('a fund with no dates departs from Savings!Z15 on purpose (D15)', () => {
  it('has no monthly contribution, where Workbook shows $0', () => {
    const z15 = golden.departures.find((d) => d.cell === 'Savings!Z15')
    expect(z15?.divergence).toBe('D15')
    const plan = planOf('Travel Fund')
    expect(plan.monthlyContributionCents).toBeNull()
    expect(plan.monthsRemaining).toBeNull()
    expect(plan.status).toBe('no-dates')
    expect(plan.monthlyContributionCents).not.toBe(z15?.cachedCents)
  })
})
