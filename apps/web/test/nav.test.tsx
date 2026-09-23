import { afterEach, describe, expect, it } from 'vitest'
import { HOME, hashOf, readAddress, restoreAddress } from '../src/nav.js'

afterEach(() => {
  window.location.hash = ''
})

describe('readAddress', () => {
  it('reads a screen, and a month on the Month screen', () => {
    expect(readAddress('#/month/2026-09')).toEqual({ screen: 'month', month: '2026-09' })
    expect(readAddress('#/month')).toEqual({ screen: 'month', month: null })
    expect(readAddress('#/review')).toEqual({ screen: 'review', month: null })
    expect(readAddress('#/ledger')).toEqual({ screen: 'ledger', month: null })
  })

  it('opens the home screen when there is no address', () => {
    expect(readAddress('')).toEqual({ screen: HOME, month: null })
    expect(readAddress('#/')).toEqual({ screen: HOME, month: null })
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
      expect(readAddress(hash), hash).toEqual({ screen: HOME, month: null })
    }
  })

  it('writes back what it reads', () => {
    for (const hash of ['#/month/2026-09', '#/month', '#/settings']) expect(hashOf(readAddress(hash))).toBe(hash)
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
