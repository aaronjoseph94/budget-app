import { describe, expect, it } from 'vitest'
import { readStatementFile } from '../src/pdf-import.js'

describe('a statement file over the size limit (security-b-03)', () => {
  it('is refused by its size, before any of it is read into memory', async () => {
    let read = false
    const file = {
      size: 24 * 1024 * 1024 + 1,
      arrayBuffer: () => {
        read = true
        return Promise.resolve(new ArrayBuffer(0))
      },
    }
    expect(await readStatementFile(file)).toEqual({
      ok: false,
      title: 'This PDF is too large',
      detail: 'A statement is usually well under 10 MB.',
    })
    expect(read).toBe(false)
  })

  it('reads a file within it', async () => {
    const file = { size: 8, arrayBuffer: () => Promise.resolve(new TextEncoder().encode('not a pdf').buffer) }
    expect(await readStatementFile(file)).toEqual({ ok: false, title: 'That file is not a PDF', detail: 'Choose the statement PDF your bank provides.' })
  })
})
