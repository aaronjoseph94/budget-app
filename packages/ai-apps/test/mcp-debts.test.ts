import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'

/**
 * get_debts against a fake database (PLAN §2.13, mcp-read-tools). The
 * owner's today is Wednesday 30 September 2026. Every figure is worked by
 * hand from these two debts, month by month, as amortize() counts them: no
 * interest in a debt's first month, then its APR over twelve, half-up to
 * the cent (D1), the last month charged in full (D24).
 *
 * - Car: $1,000.00 at 0 % from July 2026, $100.00 a month: $700.00 left
 *   after September, paid off in April 2027, no interest.
 * - Card: $500.00 at 12 % (1 % a month) from September 2026, $50.00 a
 *   month: $450.00 after September; October charges $4.50, leaving $404.50;
 *   November $4.05 (4.045, half-up), leaving $358.55; paid off in July 2027
 *   with $23.98 of interest in all.
 */
const READ = {
  today: '2026-09-30',
  debts: [
    { id: 'd1', name: 'Car', starting_balance_cents: 100000, minimum_payment_cents: 10000, apr_basis_points: 0, start_date: '2026-07-01', sort_order: 0 },
    { id: 'd2', name: 'Card‮', starting_balance_cents: '50000', minimum_payment_cents: 5000, apr_basis_points: 1200, start_date: '2026-09-01', sort_order: 1 },
  ],
  debt_extras: [{ id: 'x1', debt_id: 'gone', month: '2026-10-01', amount_cents: 99999 }],
}

const debts = (args: Record<string, unknown>, read: unknown = READ) => callTool(() => reply(read), 'get_debts', args)
const $ = (cents: number, display: string) => ({ cents, display })

describe('get_debts', () => {
  it('gives each debt today, the totals and the three plans', async () => {
    const { result, rpcCalls } = await debts({})
    expect(JSON.parse(String(rpcCalls[0]?.init.body)).p_parts).toEqual(['debts'])
    const out = result.structuredContent as Record<string, unknown>
    expect(out.debts).toEqual([
      { name: 'Car', balance: $(70000, '$700.00'), starting_balance: $(100000, '$1,000.00'), minimum: $(10000, '$100.00'), apr_bp: 0, paid: $(30000, '$300.00'), progress_bp: 3000, paid_off_month: '2027-04' },
      { name: 'Card', balance: $(45000, '$450.00'), starting_balance: $(50000, '$500.00'), minimum: $(5000, '$50.00'), apr_bp: 1200, paid: $(5000, '$50.00'), progress_bp: 1000, paid_off_month: '2027-07' },
    ])
    // 350.00 of 1,500.00 is 23.33 %.
    expect(out.totals).toEqual({ starting_balance: $(150000, '$1,500.00'), balance: $(115000, '$1,150.00'), paid: $(35000, '$350.00'), progress_bp: 2333, monthly_minimums: $(15000, '$150.00') })
    expect([out.debt_free_month, out.total_interest, out.never_paid_off]).toEqual(['2027-07', $(2398, '$23.98'), []])
    const flat = { debt_free_month: '2027-07', total_interest: $(2398, '$23.98'), paid_off_in: [{ name: 'Car', month: '2027-04' }, { name: 'Card', month: '2027-07' }] }
    // Smallest first and highest rate first are both the card; the car's $100.00 goes to it from May, clearing it then.
    const rolled = { debt_free_month: '2027-05', total_interest: $(2301, '$23.01'), paid_off_in: [{ name: 'Car', month: '2027-04' }, { name: 'Card', month: '2027-05' }] }
    expect(out.strategies).toEqual({ flat, snowball: rolled, avalanche: rolled })
    expect(out).not.toHaveProperty('schedule')
  })

  it('gives a debt’s schedule from this month, capped at `months`', async () => {
    const out = (await debts({ debt: 'Card', months: 3 })).result.structuredContent as Record<string, unknown>
    expect(out.schedule).toEqual([
      { month: '2026-09', interest: $(0, '$0.00'), payment: $(5000, '$50.00'), extra: $(0, '$0.00'), balance: $(45000, '$450.00') },
      { month: '2026-10', interest: $(450, '$4.50'), payment: $(5000, '$50.00'), extra: $(0, '$0.00'), balance: $(40450, '$404.50') },
      { month: '2026-11', interest: $(405, '$4.05'), payment: $(5000, '$50.00'), extra: $(0, '$0.00'), balance: $(35855, '$358.55') },
    ])
    // The car started in July: its schedule too starts from September.
    const car = (await debts({ debt: 'Car', months: 1 })).result.structuredContent as Record<string, unknown>
    expect(car.schedule).toEqual([{ month: '2026-09', interest: $(0, '$0.00'), payment: $(10000, '$100.00'), extra: $(0, '$0.00'), balance: $(70000, '$700.00') }])
  })

  it('names a debt whose payment never clears its interest, with no schedule', async () => {
    const stuck = { ...READ, debts: [{ ...READ.debts[1], name: 'Stuck', minimum_payment_cents: 400 }] }
    const out = (await debts({ debt: 'Stuck' }, stuck)).result.structuredContent as Record<string, unknown>
    expect([out.debts, out.totals, out.debt_free_month, out.never_paid_off, out.schedule]).toEqual([[], null, null, ['Stuck'], []])
  })

  it.each([
    ['a debt it does not have', { debt: 'Nope' }, READ, SENTENCES.unknown_debt],
    ['rows it cannot read', {}, { ...READ, debt_extras: 'SECRET' }, SENTENCES.records_unreadable],
    ['a refusal', {}, { refused: 'limit_reached' }, SENTENCES.limit_reached],
  ])('answers %s with one sentence', async (_, args, read, sentence) => {
    const { result } = await debts(args, read)
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
