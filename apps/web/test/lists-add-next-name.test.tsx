import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ListsTab } from '../src/settings/ListsTab.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Settings → Lists, "Add to <list>": the field stays live while
 * the add is saved and the app's data is read again (two round trips), and
 * is emptied when both are back, whatever it holds by then. Typing the next
 * name straight after Enter, as someone filling a list does, loses what was
 * typed: the first name is added, the second vanishes from the field.
 */

const category = (id: string, name: string, kind: Category['kind'], sortOrder: number): Category => ({
  id, name, kind, sort_order: sortOrder, weekly_budget_cents: null,
})

afterEach(() => cleanup())

describe('adding to a list, then typing the next name before the save is back', () => {
  it('keeps the name typed while the first add was being saved', async () => {
    const fake = createFakeSupabase({ categories: [category('c1', 'Phone', 'bill', 0)] })
    renderScreen(<ListsTab />, fake)
    const card = within(await screen.findByRole('region', { name: 'Bills' }))
    const field = card.getByRole<HTMLInputElement>('textbox', { name: 'New Bills category' })

    // The add's answer is held, as on a slow connection.
    let release: () => void = () => undefined
    fake.server.hold = (target) => (target === 'POST categories' ? new Promise<void>((resolve) => (release = resolve)) : null)

    fireEvent.change(field, { target: { value: 'Rent' } })
    fireEvent.submit(field.closest('form')!)
    await waitFor(() => expect(fake.tables.categories.map((c) => c.name)).toContain('Rent'))

    // The field is not disabled while it saves, and the owner types the next name.
    expect(field.disabled).toBe(false)
    fireEvent.change(field, { target: { value: 'Hydro' } })
    expect(field.value).toBe('Hydro')

    // The first add comes back, and the lists are read again.
    fake.server.hold = null
    release()
    await card.findByRole('textbox', { name: 'Rename Rent' })
    await new Promise((resolve) => setTimeout(resolve, 200))

    // What was typed since is still there to be added.
    expect(card.getByRole<HTMLInputElement>('textbox', { name: 'New Bills category' }).value).toBe('Hydro')
  })
})
