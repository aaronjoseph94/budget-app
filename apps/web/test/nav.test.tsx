import { afterEach, describe, expect, it } from 'vitest'
import { HOME, hashOf, readAddress, restoreAddress } from '../src/nav.js'

afterEach(() => {
  window.location.hash = ''
})

describe('readAddress', () => {
  it('reads a screen, and a month on the Month screen', () => {
    expect(readAddress('#/month/2026-09')).toEqual({ screen: 'month', period: '2026-09' })
    expect(readAddress('#/month')).toEqual({ screen: 'month', period: null })
    expect(readAddress('#/review')).toEqual({ screen: 'review', period: null })
    expect(readAddress('#/ledger')).toEqual({ screen: 'ledger', period: null })
  })

  it('reads the Year and its start month', () => {
    expect(readAddress('#/year/2026-01')).toEqual({ screen: 'year', period: '2026-01' })
    expect(readAddress('#/year')).toEqual({ screen: 'year', period: null })
    expect(readAddress('#/year/2026-13')).toEqual({ screen: HOME, period: null })
  })

  it('reads the month on the Bill Calendar, and only a month', () => {
    expect(readAddress('#/calendar/2026-09')).toEqual({ screen: 'calendar', period: '2026-09' })
    expect(readAddress('#/calendar')).toEqual({ screen: 'calendar', period: null })
    for (const hash of ['#/calendar/2026-13', '#/calendar/2026-09-11', '#/calendar/2026-9']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, period: null })
    }
  })

  it('reads Savings and Debts, which have no period', () => {
    expect(readAddress('#/savings')).toEqual({ screen: 'savings', period: null })
    expect(readAddress('#/savings/2026-09')).toEqual({ screen: HOME, period: null })
    expect(readAddress('#/debts')).toEqual({ screen: 'debts', period: null })
    expect(readAddress('#/debts/2026-09')).toEqual({ screen: HOME, period: null })
  })

  it('reads a day of a pay period on Paycheck, and only a real one', () => {
    expect(readAddress('#/paycheck/2026-09-11')).toEqual({ screen: 'paycheck', period: '2026-09-11' })
    expect(readAddress('#/paycheck')).toEqual({ screen: 'paycheck', period: null })
    for (const hash of ['#/paycheck/2026-02-30', '#/paycheck/2026-09', '#/paycheck/2026-9-11', '#/month/2026-09-11']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, period: null })
    }
  })

  it('opens the home screen when there is no address', () => {
    expect(readAddress('')).toEqual({ screen: HOME, period: null })
    expect(readAddress('#/')).toEqual({ screen: HOME, period: null })
  })

  it('opens the home screen rather than guess at an address it cannot read in full', () => {
    for (const hash of [
      '#/month/2026-13',
      '#/month/2026-00',
      '#/month/2026-9',
      '#/month/26-09',
      '#/month/2026-09-01',
      '#/month/2026-09/extra',
      '#/month/',
      '#/week/2026-09',
      '#/nowhere',
      '#/Month',
    ]) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, period: null })
    }
  })

  it('writes back what it reads', () => {
    for (const hash of ['#/month/2026-09', '#/month', '#/settings', '#/year/2025-04', '#/paycheck/2026-09-11', '#/calendar/2026-02']) expect(hashOf(readAddress(hash))).toBe(hash)
  })
})

function memoryStorage(kept: string | null, broken = false) {
  const store = new Map<string, string>(kept === null ? [] : [['budget.address', kept]])
  return {
    store,
    getItem: (key: string) => {
      if (broken) throw new Error('storage refused')
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (broken) throw new Error('storage refused')
      store.set(key, value)
    },
  }
}

describe('restoreAddress', () => {
  it('reopens at the last month shown when the app starts at its bare address', () => {
    window.history.replaceState(null, '', '#')
    restoreAddress(memoryStorage('#/month/2026-03'))
    expect(window.location.hash).toBe('#/month/2026-03')
  })

  it('leaves an address that was asked for alone, and remembers each one after', () => {
    window.location.hash = '/review'
    const storage = memoryStorage('#/month/2026-03')
    restoreAddress(storage)
    expect(window.location.hash).toBe('#/review')
    expect(storage.store.get('budget.address')).toBe('#/review')

    window.location.hash = '/month/2026-05'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(storage.store.get('budget.address')).toBe('#/month/2026-05')
  })

  it('keeps nothing it cannot read, and opens as a first visit when storage is refused', () => {
    window.history.replaceState(null, '', '#')
    restoreAddress(memoryStorage('#/month/2026-13'))
    expect(window.location.hash).toBe(`#/${HOME}`)

    window.history.replaceState(null, '', '#')
    restoreAddress(memoryStorage('#/month/2026-03', true))
    expect(window.location.hash).toBe('')
    restoreAddress(null)
    expect(window.location.hash).toBe('')
  })
})
