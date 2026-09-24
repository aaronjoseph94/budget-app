import { describe, expect, it } from 'vitest'
import { renderSegments } from '../src/index.js'

const slots = { A: ['change', 'now'], B: ['count'] }

describe('renderSegments', () => {
  it('splits a sentence into text and blanks, in order', () => {
    expect(renderSegments({ text: "You've spent {{A.change}} than by this day last month.", slots })).toEqual({
      ok: true,
      segments: [
        { kind: 'text', text: "You've spent " },
        { kind: 'blank', letter: 'A', slot: 'change' },
        { kind: 'text', text: ' than by this day last month.' },
      ],
    })
  })

  it('keeps blanks side by side and at either end, with no empty text between', () => {
    expect(renderSegments({ text: '{{A.now}}{{B.count}}', slots })).toEqual({
      ok: true,
      segments: [
        { kind: 'blank', letter: 'A', slot: 'now' },
        { kind: 'blank', letter: 'B', slot: 'count' },
      ],
    })
  })

  it('gives markup back as the characters it is, never as markup', () => {
    const text = '<img src=x onerror=alert(1)> and <b>bold</b>'
    expect(renderSegments({ text, slots })).toEqual({ ok: true, segments: [{ kind: 'text', text }] })
  })

  it('refuses a blank naming a fact the sentence was not offered', () => {
    expect(renderSegments({ text: 'Up by {{Q.change}}.', slots })).toEqual({ ok: false, reason: 'unknown_fact' })
    // Nothing offered, nothing named.
    expect(renderSegments({ text: '{{A.change}}', slots: {} })).toEqual({ ok: false, reason: 'unknown_fact' })
  })

  it('refuses a slot the fact does not have', () => {
    expect(renderSegments({ text: 'By {{A.budget}}.', slots })).toEqual({ ok: false, reason: 'unknown_slot' })
  })

  it('refuses a brace outside a well-formed blank', () => {
    for (const text of ['{{A.Change}}', '{{a.change}}', '{{A.change}', '{A.change}}', '{{ABC.change}}', 'a } b', '{{A.ch4nge}}']) {
      expect(renderSegments({ text, slots }), text).toEqual({ ok: false, reason: 'stray_brace' })
    }
  })

  it('gives a sentence with no blank back whole, and nothing for nothing', () => {
    expect(renderSegments({ text: 'Keep going.', slots })).toEqual({ ok: true, segments: [{ kind: 'text', text: 'Keep going.' }] })
    expect(renderSegments({ text: '', slots })).toEqual({ ok: true, segments: [] })
  })
})
