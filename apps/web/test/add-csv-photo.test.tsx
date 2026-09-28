import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * A CSV statement and a receipt photo on Add, through the real readers and
 * the fake server. Both write the owner's money records, and neither had a
 * test that went further than opening its tab (CR-6).
 */

const CSV = [
  'Date,Description,Amount',
  '09/02/2026,CORNER MARKET,-42.10',
  '09/03/2026,LITWARE BOOKS,-19.99',
  'sometime,UNDATED SHOP,-5.00',
].join('\n')

function pick(label: string, file: File) {
  const input = screen.getByText(label).closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [file] } })
}

describe('AddScreen, a CSV statement', () => {
  afterEach(cleanup)

  it('sends what it read to Review with a count that balances, and records the row it could not read', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 3, deduped: 0, inserted: 2, rejected: 1, auto_approved: 0 }]
    renderScreen(<AddScreen />, fake)
    await screen.findByText('Choose a statement')
    pick('Choose a statement', new File([CSV], 'statement.csv', { type: 'text/csv' }))

    expect(await screen.findByText('1 rows would not be imported')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 to the review queue' }))

    expect(await screen.findByText('2 waiting for review, 1 could not be read.')).toBeTruthy()
    const [call] = fake.rpcCalls
    const rows = call?.args.p_rows as readonly unknown[]
    const unreadable = call?.args.p_unreadable as readonly unknown[]
    // parsed == accepted + rejected, as every import must balance (CLAUDE.md).
    expect([call?.name, call?.args.p_source, call?.args.p_parsed, rows.length, unreadable.length]).toEqual(['save_import', 'card_csv', 3, 2, 1])
    await expectNoAxeViolations()
  })

  it('points a photo dropped on Statement to the Photo tab, and reads nothing', async () => {
    const fake = createFakeSupabase()
    renderScreen(<AddScreen />, fake)
    await screen.findByText('Choose a statement')
    pick('Choose a statement', new File(['not really'], 'receipt.jpg', { type: 'image/jpeg' }))

    expect(await screen.findByText('That is a photo. Use the Photo tab above to read a receipt.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }))
    expect(await screen.findByText('Choose a statement')).toBeTruthy()
    expect(fake.rpcCalls).toEqual([])
  })
})

describe('AddScreen, a receipt photo', () => {
  // jsdom has no object URLs; the preview only needs one to exist.
  const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  beforeEach(() => {
    URL.createObjectURL = () => 'blob:receipt'
    URL.revokeObjectURL = () => undefined
  })
  afterEach(() => {
    cleanup()
    URL.createObjectURL = real.create
    URL.revokeObjectURL = real.revoke
  })

  it('says why a photo could not be read, and lets the receipt be typed and sent to Review instead', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 1, deduped: 0, inserted: 1, rejected: 0, auto_approved: 0 }]
    renderScreen(<AddScreen />, fake)
    fireEvent.click(await screen.findByRole('tab', { name: /Photo/ }))
    // jsdom cannot decode an image, as a phone cannot decode a broken file.
    pick('Take or choose a receipt photo', new File(['not an image'], 'receipt.jpg', { type: 'image/jpeg' }))

    expect(await screen.findByText('That file could not be opened as a photo.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'FARMERS MARKET' } })
    fireEvent.change(screen.getByLabelText('Total spent'), { target: { value: '12.50' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to review' }))

    expect(await screen.findByText('Sent to Review. Pick a category there and it counts.')).toBeTruthy()
    expect(fake.rpcCalls.map((c) => [c.name, c.args.p_source, c.args.p_parsed])).toEqual([['save_import', 'receipt_photo', 1]])
    expect((fake.rpcCalls[0]?.args.p_rows as { amount_cents: number }[])[0]?.amount_cents).toBe(-1250)
  })
})

describe('AddScreen, a receipt photo not read (FE-8)', () => {
  const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  beforeEach(() => {
    URL.createObjectURL = () => 'blob:receipt'
    URL.revokeObjectURL = () => undefined
  })
  afterEach(() => {
    cleanup()
    URL.createObjectURL = real.create
    URL.revokeObjectURL = real.revoke
  })

  it('keeps Send to review pressable, and says what is still needed when it is pressed too soon', async () => {
    const fake = createFakeSupabase()
    renderScreen(<AddScreen />, fake)
    fireEvent.click(await screen.findByRole('tab', { name: /Photo/ }))
    pick('Take or choose a receipt photo', new File(['not an image'], 'receipt.jpg', { type: 'image/jpeg' }))
    await screen.findByText('That file could not be opened as a photo.')
    expect(screen.getByText('Every field is needed.')).toBeTruthy()

    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send to review' })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    const missing = await screen.findByText('Still needed: where it was, the total spent and a date no later than today.')
    expect(missing.getAttribute('role')).toBe('alert')
    expect(document.activeElement).toBe(missing)

    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'FARMERS MARKET' } })
    fireEvent.change(screen.getByLabelText('Total spent'), { target: { value: '12.50' } })
    fireEvent.click(send)
    expect(await screen.findByText('Still needed: a date no later than today.')).toBeTruthy()
    expect(fake.rpcCalls).toEqual([])
  })
})

describe('AddScreen, a file the phone cannot read (CR-7)', () => {
  afterEach(cleanup)

  it('says so and offers another, rather than sitting on Reading…', async () => {
    renderScreen(<AddScreen />, createFakeSupabase())
    await screen.findByText('Choose a statement')
    // A file in iCloud that is not on the phone rejects when it is read.
    const file = new File([''], 'statement.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('NotReadableError')) })
    pick('Choose a statement', file)

    expect(await screen.findByText('This file could not be read. Nothing was imported.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }))
    expect(await screen.findByText('Choose a statement')).toBeTruthy()
  })

  it('says to wait when the account has not loaded yet, rather than doing nothing', async () => {
    const fake = createFakeSupabase()
    fake.server.hold = (table) => (table === 'accounts' ? new Promise<void>(() => undefined) : null)
    renderScreen(<AddScreen />, fake)
    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/^What was it/), { target: { value: 'Coffee' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: '__new__' } })
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Treats' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Still loading your account. Try again in a moment; nothing was saved.')).toBeTruthy()
    expect(fake.rpcCalls).toEqual([])
  })
})
