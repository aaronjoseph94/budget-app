import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeStatementText } from '../src/statement-text.js'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * A CSV saved by Windows or an older bank system is Windows-1252, not
 * UTF-8. The file was always read as UTF-8, so "CAFÉ MONTRÉAL" arrived as
 * "CAF� MONTR�AL", in the preview and in Review. Invented shops.
 */
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

/** "Date,Description,Amount\n2026-10-01,CAFÉ MONTRÉAL,-4.50\n" in Windows-1252: É is the one byte 0xC9. */
const WINDOWS_1252 = new Uint8Array([
  ...ascii('Date,Description,Amount\n2026-10-01,CAF'),
  0xc9,
  ...ascii(' MONTR'),
  0xc9,
  ...ascii('AL,-4.50\n'),
])

describe('decodeStatementText', () => {
  it('reads UTF-8 as UTF-8, and drops its byte-order mark', () => {
    const utf8 = new TextEncoder().encode('CAFÉ,-4.50')
    expect(decodeStatementText(utf8)).toBe('CAFÉ,-4.50')
    expect(decodeStatementText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe('CAFÉ,-4.50')
  })

  it('reads bytes that are not UTF-8 as Windows-1252', () => {
    expect(decodeStatementText(WINDOWS_1252)).toBe('Date,Description,Amount\n2026-10-01,CAFÉ MONTRÉAL,-4.50\n')
    // 0x80 is the euro sign in Windows-1252, where Latin-1 has a control character.
    expect(decodeStatementText(new Uint8Array([0x80, ...ascii('5.00')]))).toBe('€5.00')
  })

  it('reads UTF-16 by its byte-order mark, either way round', () => {
    const le = new Uint8Array([0xff, 0xfe, ...ascii('Date').flatMap((c) => [c, 0])])
    const be = new Uint8Array([0xfe, 0xff, ...ascii('Date').flatMap((c) => [0, c])])
    expect(decodeStatementText(le)).toBe('Date')
    expect(decodeStatementText(be)).toBe('Date')
  })
})

describe('AddScreen, a Windows-1252 CSV', () => {
  afterEach(cleanup)

  async function choose(bytes: Uint8Array<ArrayBuffer>) {
    renderScreen(<AddScreen />, createFakeSupabase())
    await screen.findByText('Choose a statement')
    const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
    fireEvent.change(input, { target: { files: [new File([bytes], 'statement.csv', { type: 'text/csv' })] } })
  }

  it('shows the shop with its accents', async () => {
    await choose(WINDOWS_1252)
    expect(await screen.findByText('CAFÉ MONTRÉAL')).toBeTruthy()
    expect(screen.queryByText(/�/)).toBeNull()
  })

  it('still says random bytes named .csv are not a text CSV', async () => {
    await choose(new Uint8Array(Array.from({ length: 400 }, (_, i) => (i * 167 + 13) % 256)))
    expect(await screen.findByText('This is not a text CSV')).toBeTruthy()
  })
})
