import { afterEach, describe, expect, it } from 'vitest'
import { HOME, hashOf, readAddress, restoreAddress } from '../src/nav.js'
import { HELP_TOPICS } from '../src/help/topics.js'
import { SETTINGS_TABS } from '../src/settings/tab.js'

afterEach(() => {
  window.location.hash = ''
})

describe('readAddress', () => {
  it('reads a screen, and a month on the Month screen', () => {
    expect(readAddress('#/month/2026-09')).toEqual({ screen: 'month', param: '2026-09' })
    expect(readAddress('#/month')).toEqual({ screen: 'month', param: null })
    expect(readAddress('#/review')).toEqual({ screen: 'review', param: null })
    expect(readAddress('#/ledger')).toEqual({ screen: 'ledger', param: null })
  })

  it('reads the Year and its start month', () => {
    expect(readAddress('#/year/2026-01')).toEqual({ screen: 'year', param: '2026-01' })
    expect(readAddress('#/year')).toEqual({ screen: 'year', param: null })
    expect(readAddress('#/year/2026-13')).toEqual({ screen: HOME, param: null })
  })

  it('reads the month on the Bill Calendar, and only a month', () => {
    expect(readAddress('#/calendar/2026-09')).toEqual({ screen: 'calendar', param: '2026-09' })
    expect(readAddress('#/calendar')).toEqual({ screen: 'calendar', param: null })
    for (const hash of ['#/calendar/2026-13', '#/calendar/2026-09-11', '#/calendar/2026-9']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('reads Savings and Debts, which have no period', () => {
    expect(readAddress('#/savings')).toEqual({ screen: 'savings', param: null })
    expect(readAddress('#/savings/2026-09')).toEqual({ screen: HOME, param: null })
    expect(readAddress('#/debts')).toEqual({ screen: 'debts', param: null })
    expect(readAddress('#/debts/2026-09')).toEqual({ screen: HOME, param: null })
  })

  it('reads a day of a pay period on Paycheck, and only a real one', () => {
    expect(readAddress('#/paycheck/2026-09-11')).toEqual({ screen: 'paycheck', param: '2026-09-11' })
    expect(readAddress('#/paycheck')).toEqual({ screen: 'paycheck', param: null })
    for (const hash of ['#/paycheck/2026-02-30', '#/paycheck/2026-09', '#/paycheck/2026-9-11', '#/month/2026-09-11']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('reads the Coach, and its check-in as the one thing under it (ADR 0006)', () => {
    expect(readAddress('#/coach')).toEqual({ screen: 'coach', param: null })
    expect(readAddress('#/coach/checkin')).toEqual({ screen: 'coach', param: 'checkin' })
    for (const hash of ['#/coach/check-in', '#/coach/2026-09', '#/coach/checkin/2026-09-21', '#/checkin']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('reads the new screens that take nothing after their name', () => {
    for (const screen of ['forecast', 'ask', 'help', 'start', 'ai'] as const) {
      expect(readAddress(`#/${screen}`)).toEqual({ screen, param: null })
      expect(readAddress(`#/${screen}/2026-09`), screen).toEqual({ screen: HOME, param: null })
    }
  })

  it('reads Ask with the Help topic it was opened from, and only a committed one', () => {
    expect(readAddress('#/ask/forecast')).toEqual({ screen: 'ask', param: 'forecast' })
    for (const hash of ['#/ask/nowhere', '#/ask/Forecast', '#/ask/forecast/more']) expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
  })

  it('reads a report by its month, and only a month', () => {
    expect(readAddress('#/reports/2026-08')).toEqual({ screen: 'reports', param: '2026-08' })
    expect(readAddress('#/reports')).toEqual({ screen: 'reports', param: null })
    for (const hash of ['#/reports/2026-13', '#/reports/2026-08-01', '#/reports/overview']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('reads a help topic only when it is one of the committed ones', () => {
    for (const topic of HELP_TOPICS) expect(readAddress(`#/help/${topic}`)).toEqual({ screen: 'help', param: topic })
    for (const hash of ['#/help/nowhere', '#/help/Updates', '#/help/updates/more', '#/help/2026-09']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('reads a Settings tab, and only one of the four (ADR 0014 §2)', () => {
    for (const tab of SETTINGS_TABS) expect(readAddress(`#/settings/${tab}`)).toEqual({ screen: 'settings', param: tab })
    for (const hash of ['#/settings/Lists', '#/settings/setup', '#/settings/lists/more']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('reads a week by its Monday, and still opens this week at #/week (N46)', () => {
    expect(readAddress('#/week')).toEqual({ screen: 'week', param: null })
    expect(readAddress('#/week/2026-09-21')).toEqual({ screen: 'week', param: '2026-09-21' })
    // A Tuesday, a day that does not exist, a month, and a third segment.
    for (const hash of ['#/week/2026-09-22', '#/week/2026-02-30', '#/week/2026-09', '#/week/2026-09-21/2026-09-28']) {
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('opens the home screen when there is no address', () => {
    expect(readAddress('')).toEqual({ screen: HOME, param: null })
    expect(readAddress('#/')).toEqual({ screen: HOME, param: null })
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
      expect(readAddress(hash), hash).toEqual({ screen: HOME, param: null })
    }
  })

  it('writes back what it reads', () => {
    for (const hash of [
      '#/month/2026-09', '#/month', '#/settings', '#/year/2025-04', '#/paycheck/2026-09-11', '#/calendar/2026-02',
      '#/coach', '#/coach/checkin', '#/forecast', '#/reports/2026-08', '#/ask', '#/ask/forecast', '#/help', '#/help/updates', '#/start', '#/ai', '#/week/2026-09-21', '#/settings/ai',
    ]) expect(hashOf(readAddress(hash))).toBe(hash)
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
