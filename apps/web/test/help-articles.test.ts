import { describe, expect, it } from 'vitest'
import { ARTICLES, articleFor, boldParts } from '../src/help/articles.js'
import { HELP_TOPICS } from '../src/help/topics.js'

/** The words plan §8 keeps out of Help; a button's own name, in bold, may still say it. */
const ENGINEERING = /\b(migrations?|edge functions?|postgres|sql|rls|jwt|endpoints?|api|schema|database)\b/i

const plainText = (text: string) =>
  boldParts(text)
    .filter((p) => !p.bold)
    .map((p) => p.text)
    .join('')

describe('Help articles', () => {
  it('each has the full pattern: a line on what it is, steps, "You\'re done when…" and "Stuck?"', () => {
    expect(ARTICLES.length).toBeGreaterThan(0)
    for (const a of ARTICLES) {
      expect(a.title.trim(), a.id).not.toBe('')
      expect(a.summary.trim(), a.id).not.toBe('')
      expect(a.done.trim(), a.id).not.toBe('')
      expect(a.stuck.trim(), a.id).not.toBe('')
      expect(a.steps.length, a.id).toBeGreaterThan(0)
      expect(a.steps.length, `${a.id}: a short list, not a manual`).toBeLessThanOrEqual(8)
      // At least one button named exactly, so the owner knows what to press.
      expect(a.steps.some((s) => boldParts(s).some((p) => p.bold)), a.id).toBe(true)
    }
  })

  it('gives each step one action: one sentence, with its bold names closed', () => {
    for (const a of ARTICLES) {
      for (const step of a.steps) {
        expect(step.split('**').length % 2, `${a.id}: ${step}`).toBe(1)
        expect(step, a.id).toMatch(/[.…]$/)
        expect(/[.!?]\s+\S/.test(plainText(step)), `${a.id}: more than one sentence in "${step}"`).toBe(false)
      }
    }
  })

  it('names each article by a committed topic, once', () => {
    const ids = ARTICLES.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(HELP_TOPICS).toContain(id)
    // Listed in Help's order, so the index reads as the plan lists it.
    expect(ids).toEqual(HELP_TOPICS.filter((t) => ids.includes(t)))
  })

  it('links only to articles that are written, never to itself', () => {
    for (const a of ARTICLES) {
      expect(new Set(a.related).size, a.id).toBe(a.related.length)
      expect(a.related, a.id).not.toContain(a.id)
      for (const r of a.related) expect(articleFor(r), `${a.id} → ${r}`).toBeDefined()
    }
  })

  it('uses no engineering words outside a button’s own name', () => {
    for (const a of ARTICLES) {
      const words = [a.title, a.summary, a.done, a.stuck, ...a.steps, ...(a.terms ?? []).flatMap((t) => [t.term, t.meaning])]
      for (const text of words) expect(ENGINEERING.test(plainText(text)), `${a.id}: "${text}"`).toBe(false)
    }
  })

  it('finds no article for a topic not written yet', () => {
    expect(articleFor('start')?.title).toBe('Start here')
    expect(articleFor('nowhere')).toBeUndefined()
  })
})

describe('boldParts', () => {
  it('splits out each button name, and keeps the rest as it was', () => {
    expect(boldParts('Press **Approve**, then **Next**.')).toEqual([
      { text: 'Press ', bold: false },
      { text: 'Approve', bold: true },
      { text: ', then ', bold: false },
      { text: 'Next', bold: true },
      { text: '.', bold: false },
    ])
  })

  it('keeps markup as the characters it is', () => {
    const hostile = '<img src=x onerror="alert(1)"> **<b>Save</b>**'
    expect(boldParts(hostile)).toEqual([
      { text: '<img src=x onerror="alert(1)"> ', bold: false },
      { text: '<b>Save</b>', bold: true },
    ])
  })

  it('shows an unpaired ** as it is, rather than bolding the rest', () => {
    expect(boldParts('Press **Approve.')).toEqual([{ text: 'Press **Approve.', bold: false }])
  })
})
