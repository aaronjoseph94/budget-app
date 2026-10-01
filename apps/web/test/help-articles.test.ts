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
    // The line at the top counts what is in, so the article names no count to go stale (M1).
    expect(updates?.summary).toMatch(/The line at the top says how many are in; the rest take about 35 minutes, once, easiest on a computer/)
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

  // ADR 0011: More is a phone's; a computer has the sidebar, and AI
  // settings, with no item of its own, opens from Settings (N136).
  it('never sends a computer to More, nor to the old bar at the top', () => {
    for (const a of ARTICLES) {
      const text = [a.summary, a.done, a.stuck, ...a.steps].join(' ')
      expect(text, a.id).not.toMatch(/bar at the top/)
      expect(text, a.id).not.toMatch(/open \*\*More\*\*, then/i)
    }
    for (const id of ['free-ai', 'more-ai', 'ai-sees', 'ai-rests'] as const) {
      expect(articleFor(id)?.steps[0], id).toMatch(/^Open \*\*AI settings\*\* \(from \*\*Settings\*\*, or \*\*More\*\* on a phone\)/)
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

  // Security review mcp-3-01: the emergency steps end each sign-in, and Disconnect
  // comes before the OAuth Server goes off, which would leave nothing to disconnect.
  it('puts Disconnect first in an emergency, ends every sign-in, and turns the OAuth Server off last', () => {
    const stuck = articleFor('ai-apps')?.stuck ?? ''
    const emergency = stuck.slice(stuck.indexOf('In an emergency'))
    const at = (words: string) => emergency.indexOf(words)
    expect(at('In an emergency')).toBe(0)
    for (const words of ['**Disconnect**', '**Let AI apps connect**', 'delete from auth.sessions;', '**OAuth Server**']) expect(at(words), words).toBeGreaterThan(0)
    expect(at('**Disconnect**')).toBeLessThan(at('**Let AI apps connect**'))
    expect(at('**Let AI apps connect**')).toBeLessThan(at('delete from auth.sessions;'))
    expect(at('delete from auth.sessions;')).toBeLessThan(at('**OAuth Server**'))
    expect(stuck).not.toMatch(/stops every AI app at once/)
  })

  // Security review mcp-2-03: what the switch does not do, and what a sign-in can.
  it('never says an AI app can do nothing while switched off, and says its sign-in reaches the account', () => {
    const terms = articleFor('ai-apps')?.terms ?? []
    const meaning = (term: string) => terms.find((t) => t.term === term)?.meaning ?? ''
    expect(meaning('It cannot')).not.toMatch(/do anything while/)
    // Disconnect ending the session is HANDOFF check 21, not yet run: "should", and the emergency steps make sure.
    expect(meaning('Its sign-in')).toMatch(/your Supabase account itself.*until its sign-in ends, which \*\*Disconnect\*\* should do/)
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

/**
 * Every word the app draws, from its own source: each bold name in Help
 * must be one of them, so an article never names a button that is not
 * there, or one renamed since it was written.
 */
const SOURCES: Record<string, string> = import.meta.glob(['../src/**/*.{ts,tsx}', '!../src/help/articles.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const APP_WORDS = Object.values(SOURCES).join('\n')

/** Names on someone else's screen, which the app cannot draw: Supabase's, Claude's, ChatGPT's and Safari's. */
const OUTSIDE = new Set([
  'New query',
  'Customize',
  'Connectors',
  'Add custom connector',
  'Sign in now',
  'Register automatically',
  'Use Claude’s published identity',
  'Security and login',
  'Developer mode',
  'DCR',
  'Edit Actions',
  'Add to Home Screen',
  '⋯',
])

/** A name with the owner's own words in it, checked by the app's part: a what-if names the owner's category. */
const APP_PART: Readonly<Record<string, string>> = { 'Dining out −25%': '−25%' }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A count in a name ("Approve these 12", "Today: N of 40") or "…" stands for whatever the app fills in there. */
const shownAs = (name: string) =>
  new RegExp(
    `(?<![\\p{L}])${name
      .split(/(\d+|\bN\b|…)/u)
      .map((part, i) => (i % 2 === 1 ? '(?:\\d+|\\$?\\{[^}]*\\}|…)' : escape(part)))
      .join('')}(?![\\p{L}])`,
    'u',
  )

const boldNames = (a: (typeof ARTICLES)[number]) =>
  [a.summary, a.done, a.stuck, ...a.steps, ...(a.terms ?? []).map((t) => t.meaning)].flatMap((text) =>
    boldParts(text)
      .filter((p) => p.bold)
      .map((p) => p.text),
  )

describe('Help’s bold names', () => {
  it('are each a name the app draws, or a name on Supabase’s, Claude’s, ChatGPT’s or Safari’s own screen', () => {
    const used = new Set<string>()
    for (const a of ARTICLES) {
      for (const name of boldNames(a)) {
        used.add(name)
        if (OUTSIDE.has(name)) continue
        expect(shownAs(APP_PART[name] ?? name).test(APP_WORDS), `${a.id}: **${name}** is drawn nowhere in the app`).toBe(true)
      }
    }
    // The list of outside names holds only names an article still uses.
    for (const name of [...OUTSIDE, ...Object.keys(APP_PART)]) expect(used, name).toContain(name)
  })

  it('finds a name the app does not draw, reading the app without Help’s own words', () => {
    expect(APP_WORDS).toContain('Open AI settings')
    expect(APP_WORDS).not.toContain('export const ARTICLES')
    expect(shownAs('Paid').test('<span>Day paid</span>')).toBe(false)
    expect(shownAs('Approve these 12').test('Approve these {n}')).toBe(true)
    expect(shownAs('Show 3 empty').test('`Show ${empty} empty`')).toBe(true)
  })
})
