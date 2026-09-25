import { describe, expect, it } from 'vitest'
import { proseProblem } from '@budget/schema'
import { TONES, checkReportReply, mergeReview, renderSegments, reportBrief, reportFacts, reportWords, type ReportFacts } from '../src/index.js'
import { AUGUST, PARTLY, RISE_ONLY, SEPTEMBER, nameOf } from './report-fixture.js'

/** The review in the app's own words, and a model's checked against what it was offered (ADR 0005 §4). */

const ALL: readonly ReportFacts[] = [AUGUST, SEPTEMBER, PARTLY, RISE_ONLY].map((report) => reportFacts({ report, nameOf }))
const slotsOf = (facts: ReportFacts) => Object.fromEntries(Object.entries(facts.facts).map(([l, f]) => [l, ['name', ...Object.keys(f.figures)]]))

describe('reportWords', () => {
  it('passes the text rule, and names only figures its facts have, in every tone and every kind of month', () => {
    for (const facts of ALL) {
      for (const tone of TONES) {
        const words = reportWords({ facts, tone })
        const texts: [string, number][] = [[words.headline, 160], [words.tryThis, 200], ...words.points.map((p): [string, number] => [p.text, 200])]
        for (const [text, limit] of texts) {
          expect(proseProblem(text, limit), text).toBeNull()
          expect(renderSegments({ text, slots: slotsOf(facts) }).ok, text).toBe(true)
        }
      }
    }
  })

  it('heads a month with the biggest change each way, a win first', () => {
    const words = reportWords({ facts: ALL[0]!, tone: 'cheerleader' })
    expect(words.headline).toBe('A win on {{E.name}}: {{E.change}} than usual. Keep an eye on {{D.name}}: {{D.change}} than usual.')
    expect(words.points).toEqual([
      { fact: 'A', text: 'Spent {{A.now}}. That is {{A.change}} than {{A.last_month}}. Your usual month: {{A.usual}}.' },
      { fact: 'B', text: 'Saved {{B.now}}, {{B.rate}} of what came in. That is {{B.change}} than {{B.last_month}}. Your usual month: {{B.usual}}.' },
      { fact: 'D', text: '{{D.name}}: {{D.now}}, {{D.change}} than your usual month of {{D.usual}}.' },
    ])
    expect(words.tryThis).toBe('Next month, try a weekly limit for {{D.name}} close to its usual, and check it each Sunday.')
  })

  it('heads a month with no biggest change by what was spent', () => {
    expect(reportWords({ facts: ALL[2]!, tone: 'straight' }).headline).toBe('Spent {{A.now}}. Saved {{B.now}}.')
    expect(reportWords({ facts: ALL[2]!, tone: 'straight' }).tryThis).toBe('Next month: move your savings on payday, before you spend.')
    expect(reportWords({ facts: ALL[3]!, tone: 'straight' }).headline).toBe('Biggest change: {{D.name}}, {{D.change}} than usual.')
  })
})

describe('checkReportReply', () => {
  const facts = ALL[0]!
  const { brief } = reportBrief({ facts, tone: 'cheerleader' })
  const reply = {
    headline: 'Nice work on {{E.name}} this month.',
    points: [{ fact: 'A', text: 'You spent {{A.change}} than {{A.last_month}}.' }],
    tryThis: 'Next month, plan a few dinners at home and keep {{D.name}} steady.',
  }

  it('keeps words that name only what each part was offered', () => {
    expect(checkReportReply({ reply, brief })).toEqual({ reply, dropped: [] })
  })

  it('drops a point about a fact not offered as one, twice, or naming another fact, alone', () => {
    const checked = checkReportReply({
      reply: { ...reply, points: [{ fact: 'E', text: 'Groceries fell.' }, reply.points[0]!, reply.points[0]!, { fact: 'B', text: 'Saved {{A.now}}.' }] },
      brief,
    })
    expect(checked.reply.points).toEqual(reply.points)
    expect(checked.dropped).toEqual([
      { part: 'point', reason: 'not_offered' },
      { part: 'point', reason: 'twice' },
      { part: 'point', reason: 'unknown_fact' },
    ])
  })

  it('drops a sentence that says a rise beside a fall, and a thing to try naming another fact', () => {
    const checked = checkReportReply({
      reply: { headline: '{{E.name}} rose to {{E.change}} than usual.', points: [], tryThis: 'Watch {{E.name}} next month.' },
      brief,
    })
    expect(checked.reply).toEqual({ headline: null, points: [], tryThis: null })
    expect(checked.dropped).toEqual([
      { part: 'headline', reason: 'direction' },
      { part: 'tryThis', reason: 'unknown_fact' },
    ])
  })
})

describe('mergeReview', () => {
  it('takes the AI’s words part by part, and the app’s own for every part it has not', () => {
    const own = reportWords({ facts: ALL[0]!, tone: 'cheerleader' })
    const review = mergeReview({ own, ai: { headline: null, points: [{ fact: 'B', text: 'Saved {{B.now}}.' }], tryThis: 'Cook at home.' } })
    expect(review.headline).toEqual({ text: own.headline, ai: false })
    expect(review.points.map((p) => [p.fact, p.ai])).toEqual([['A', false], ['B', true], ['D', false]])
    expect(review.tryThis).toEqual({ text: 'Cook at home.', ai: true })
    expect(mergeReview({ own, ai: null }).points.every((p) => !p.ai)).toBe(true)
  })
})
