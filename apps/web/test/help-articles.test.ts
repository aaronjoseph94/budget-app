import { describe, expect, it } from 'vitest'
import { ARTICLES, articleFor, boldParts } from '../src/help/articles.js'
import { HELP_TOPICS } from '../src/help/topics.js'
import { SCREEN_HELP } from '../src/help/screen-help.js'
import { SCREENS } from '../src/nav.js'
import { CONNECT_MINUTES } from '../src/ai-apps/access.js'

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

  // HANDOFF's three steps, as One-time updates says them (plan §10.2, A28).
  it('walks One-time updates to the end: the updates, the AI helper, the AI apps steps, then free AI', () => {
    const updates = articleFor('updates')
    expect(updates?.summary).toMatch(/six updates, the AI helper, two settings and the AI apps server: about 35 minutes, once, easiest on a computer/)
    expect(updates?.steps.some((s) => s.includes('the signing key, sign-in for AI apps and the AI apps server'))).toBe(true)
    expect(updates?.steps.some((s) => s.includes('**Deploy a new function**') && s.includes('name it ai'))).toBe(true)
    expect(updates?.steps.at(-1)).toMatch(/\*\*AI settings\*\* and turn on free AI/)
  })

  it('has a written article for the ? on every screen', () => {
    for (const screen of SCREENS) {
      if (screen === 'help') continue
      expect(articleFor(SCREEN_HELP[screen]), screen).toBeDefined()
    }
  })

  // G1: goals are many, one of them the main goal, and each is added on Savings.
  it('speaks of your goals, never of the one flight fund, and says how to add one', () => {
    for (const a of ARTICLES) {
      const text = [a.title, a.summary, a.done, a.stuck, ...a.steps, ...(a.terms ?? []).flatMap((t) => [t.term, t.meaning])].join(' ')
      expect(text, a.id).not.toMatch(/flight (card|fund|goal)/i)
    }
    expect(articleFor('goals')?.steps).toContain('Press **Add a goal**.')
    expect(articleFor('savings')?.related).toContain('goals')
  })

  // A18: Habits is written, and what it needs before each part shows.
  it('says how to open Habits, what a streak needs, and where the Coach’s cheers lead', () => {
    const reports = articleFor('reports')
    expect(reports?.steps.some((step) => step.startsWith('Press **Habits**'))).toBe(true)
    expect(reports?.stuck).toMatch(/set weekly budgets on the \*\*Week\*\* to start one/)
    expect(reports?.stuck).not.toMatch(/on their way/)
    expect(articleFor('coach')?.stuck).toMatch(/\*\*See your habits\*\*/)
  })

  // A08: the owner is told where the goal's date and the quotes come from.
  it('says the Coach’s date is from what really moved in, and its quotes never from AI', () => {
    const coach = articleFor('coach')
    expect(coach?.stuck).toMatch(/what you really moved into the goal’s fund/)
    expect(coach?.stuck).toMatch(/never written by AI/)
    expect(articleFor('savings')?.steps.join(' ')).toMatch(/one thing to trim/)
  })

  // A20: the check-in says when it is ready, what it asks about, and that nothing is saved without a tap.
  it('says how to open the check-in, what it asks about, and that the limit waits for a tap', () => {
    const checkin = articleFor('checkin')
    expect(checkin?.steps[0]).toMatch(/\*\*Your Sunday check-in is ready\*\*/)
    expect(checkin?.stuck).toMatch(/\$20\.00 or more/)
    expect(checkin?.stuck).toMatch(/nothing is saved until you press the button/)
    expect(articleFor('coach')?.related).toContain('checkin')
  })

  // ADR 0011: More is a phone's; a computer has the sidebar. AI settings is
  // in no sidebar group yet (N136), so its steps still go through More.
  it('never sends a computer to More for a screen the sidebar holds, nor to the old bar at the top', () => {
    for (const a of ARTICLES) {
      const text = [a.summary, a.done, a.stuck, ...a.steps].join(' ')
      expect(text, a.id).not.toMatch(/bar at the top/)
      for (const m of text.matchAll(/open \*\*More\*\*, then \*\*([^*]+)\*\*/gi)) expect(m[1], a.id).toBe('AI settings')
    }
    expect(articleFor('reports')?.steps[0]).toBe('Open **Reports** (on a phone, under **More**).')
  })

  // MCP plan M12a: a connection starts from Connect a new AI app, inside its window.
  it('connects Claude and ChatGPT from Connect a new AI app, and says what an AI app may do and who sees it', () => {
    for (const id of ['connect-claude', 'connect-chatgpt'] as const) {
      const steps = articleFor(id)?.steps ?? []
      expect(steps[1], id).toMatch(new RegExp(`^Press \\*\\*Connect a new AI app\\*\\*.* within ${CONNECT_MINUTES} minutes\\.$`))
      expect(steps.some((s) => s.includes('**Allow**')), id).toBe(true)
      expect(articleFor(id)?.related, id).toContain('ai-apps')
    }
    const claude = articleFor('connect-claude')?.steps.join(' ')
    expect(claude).toMatch(/\*\*Register automatically\*\*, not \*\*Use Claude’s published identity\*\*/)
    expect(claude).toContain('**claude.ai**')
    expect(articleFor('connect-chatgpt')?.steps.join(' ')).toMatch(/\*\*Developer mode\*\*.*\*\*chatgpt\.com\*\*/)
    const apps = articleFor('ai-apps')
    const said = [apps?.stuck, ...(apps?.terms ?? []).map((t) => t.meaning)].join(' ')
    for (const words of [/Anthropic for Claude, OpenAI for ChatGPT/, /300 look-ups and 30 additions a day/, /cannot approve, reject, change or delete anything/]) expect(said).toMatch(words)
    expect(apps?.related).toEqual(['connect-claude', 'connect-chatgpt', 'ai-sees', 'review', 'updates'])
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
