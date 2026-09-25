import { describe, expect, it } from 'vitest'
import { ModelProse, proseProblem, type ProseProblem } from '../src/prose.js'

/**
 * ADR 0005 §4's text rule, rules 1 to 7: every string a model writes, and
 * every template the app ships, holds words and blanks and nothing that
 * could be read as a figure, a link or markup. Each row is one sentence a
 * model might write, and what the rule makes of it.
 */
const TABLE: readonly (readonly [text: string, problem: ProseProblem | null])[] = [
  // Words and blanks pass.
  ['You’ve spent {{A.change}} than by this day last month.', null],
  ['Nice work on {{B.name}}: {{B.change}} than by this day in {{B.before_month}}.', null],
  ['One thing to try: a lighter week.', null],
  ['Money saved now buys flying time later.', null],
  ['Often a tenth of it goes on coffee.', null],
  ['A few nights of cooking at home pulls it back.', null],
  // Rule 2: a brace outside a well-formed blank.
  ['You spent {{A.Change}} more.', 'stray_brace'],
  ['You spent {A.change} more.', 'stray_brace'],
  ['{{AAA.change}}', 'stray_brace'],
  // Rule 3: any number, in any script, and any currency sign.
  ['You spent $412 on dining.', 'number'],
  ['Since 2026 you have saved.', 'number'],
  ['Up ２ weeks in a row.', 'number'],
  ['Up ٣ weeks in a row.', 'number'],
  ['Up ۴ weeks in a row.', 'number'],
  ['Up ५ weeks in a row.', 'number'],
  ['About ½ of it went on takeout.', 'number'],
  ['Up ² times.', 'number'],
  ['Spent ＄ on it.', 'number'],
  ['Spent € on it.', 'number'],
  ['Spent ₹ on it.', 'number'],
  ['Spent ¢ on it.', 'number'],
  // Rule 3: percent, markup and the characters markdown is made of.
  ['Up by a lot %.', 'markup'],
  ['Up ‰.', 'markup'],
  ['<img src=x onerror=alert()>', 'markup'],
  ['<b>Bold</b> move.', 'markup'],
  ['**Great** week.', 'markup'],
  ['[Open this](javascript:alert)', 'markup'],
  ['Tag #savings.', 'markup'],
  ['Mail me @ home.', 'markup'],
  ['A `code` word.', 'markup'],
  ['Use | and ~ and \\ here.', 'markup'],
  // Rule 4: links, even without markup.
  ['See example.com/deal at http now.', 'link'],
  ['Visit www.example.com today.', 'link'],
  ['Go to javascript://x.', 'link'],
  // Rule 5: number words as whole words, in any case; "one" is allowed.
  ['Forty dollars less.', 'number_word'],
  ['You spent TWICE as much.', 'number_word'],
  ['Hundreds of little things.', 'number_word'],
  ['Cut it in half.', 'number_word'],
  ['A quarter of it.', 'number_word'],
  ['Twenty-one days.', 'number_word'],
  ['Ten percent off.', 'number_word'],
  ['Three weeks running.', 'number_word'],
  // Rule 6: no advice on products or investing.
  ['Put it in an ETF instead.', 'product'],
  ['Try an index fund.', 'product'],
  ['Move it to your TFSA.', 'product'],
  ['Invest in yourself.', 'product'],
  ['Buy some bitcoin.', 'product'],
  // Rule 7: at most two line breaks.
  ['Line.\nMore.\nAgain.\nLast.', 'line_breaks'],
  ['Line.\nAnother line.\nA last line.', null],
  // Nothing at all is not a sentence.
  ['   ', 'empty'],
]

describe('the text rule (ADR 0005 §4)', () => {
  it.each(TABLE)('%s → %s', (text, problem) => {
    expect(proseProblem(text, 240)).toBe(problem)
  })

  it('counts each field against its own length, after NFKC', () => {
    expect(proseProblem('a'.repeat(80), 80)).toBeNull()
    expect(proseProblem('a'.repeat(81), 80)).toBe('too_long')
    // The ligature ﬃ is three letters once normalised.
    expect(proseProblem('ﬃ'.repeat(27), 80)).toBe('too_long')
  })

  it('reads number words only between non-letters, so "money", "often" and "tenth" pass', () => {
    for (const word of ['money', 'often', 'tenth', 'someone', 'honey', 'stone', 'network', 'weight', 'fortune', 'once']) {
      expect(proseProblem(`A word: ${word}.`, 240), word).toBeNull()
    }
  })
})

describe('ModelProse', () => {
  it('gives back the words NFKC-normalised when they pass', () => {
    expect(ModelProse(80).safeParse('Ｎice ﬁnish').data).toBe('Nice finish')
  })

  it('refuses them with the rule they broke', () => {
    const out = ModelProse(80).safeParse('Spent $5.')
    expect(out.success).toBe(false)
    expect(out.error?.issues[0]?.message).toBe('number')
    expect(ModelProse(80).safeParse(5).success).toBe(false)
  })
})
