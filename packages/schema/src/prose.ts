/**
 * The text rule: what a model may write, and what the app's own words may
 * hold (ADR 0005 §4, rules 1 to 7).
 *
 * A model never writes a figure. It leaves a blank, `{{A.change}}`, and the
 * app fills it from the engine as it draws, so a number in a model's words
 * could only be one it made up. This rule refuses every way a figure,
 * a link or markup could get in: any character that is a number in any
 * script, any currency sign, the characters markup is made of, a link,
 * and number words. "one" is allowed, since "one thing to try" is how a
 * coach talks; "money", "often" and "tenth" pass, because a number word
 * counts only between non-letters.
 *
 * Rules 8 and 9 (a sentence's direction, and naming only what was offered)
 * need to know which facts were sent, so savings-coach's checkReply applies
 * them to each reply. 0017's ai_text_is_clean is the database's narrower
 * backstop behind this one.
 */
import { z } from 'zod'

export type ProseProblem = 'empty' | 'stray_brace' | 'number' | 'markup' | 'link' | 'number_word' | 'product' | 'line_breaks' | 'too_long' | 'invisible'

/** Two braces, one or two capitals, a dot, a slot name, two braces: no digit fits in one. */
const BLANK = /\{\{[A-Z]{1,2}\.[a-z_]{1,24}\}\}/g

/**
 * `\d` is ASCII-only even with the `u` flag, so the property classes are
 * used: every number (fullwidth, Arabic-Indic, Devanagari, fractions,
 * superscripts) and every currency sign.
 */
const NUMBER_OR_CURRENCY = /[\p{N}\p{Sc}]/u
const MARKUP = /[%‰#@<>`*_[\]|\\~]/
const LINK = /http|www\.|:\/\//i

const NUMBER_WORDS = [
  'zero', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundreds?', 'thousands?', 'millions?', 'billions?', 'trillions?',
  'half', 'halves', 'halve', 'halved', 'quarters?', 'thirds?', 'double', 'doubled', 'twice', 'triple', 'tripled',
  'dozens?', 'percent', 'percentage', 'pct',
]
const PRODUCTS = ['crypto', 'bitcoin', 'stocks?', 'etf', 'index fund', 'mutual fund', 'tfsa', 'rrsp', 'gic', 'invest in']

/** A whole word from the list, in any case, between non-letters. */
const wholeWord = (words: readonly string[]) => new RegExp(`(?<!\\p{L})(?:${words.join('|')})(?!\\p{L})`, 'iu')
const NUMBER_WORD = wholeWord(NUMBER_WORDS)
const PRODUCT = wholeWord(PRODUCTS)

const MAX_LINE_BREAKS = 2

/**
 * Characters that draw nothing yet change what is read: format characters
 * (bidi overrides and isolates, zero-width joiners, the soft hyphen, the
 * byte-order mark), private-use and unassigned code points, and controls
 * other than a line end or a tab. NFKC keeps them all. A bidi override
 * around a blank shows the engine's $12.34 as 43.21$, and a zero-width
 * space inside "twenty" or "crypto" slips it past the word rules
 * (security-b-01). Property classes, so no control character is written here.
 */
const INVISIBLE = /[\p{Cf}\p{Co}\p{Cn}]|[^\P{Cc}\n\r\t]/u

/** The first rule the text breaks, or null when it passes. `limit` is the field's length. */
export function proseProblem(raw: string, limit: number): ProseProblem | null {
  // Rule 1: fullwidth letters, ligatures and compatibility forms read as what they are.
  const text = raw.normalize('NFKC')
  if (text.trim() === '') return 'empty'
  // Before the word rules, which an invisible character would split.
  if (INVISIBLE.test(text)) return 'invisible'
  // Rule 2: what is left once the well-formed blanks are out.
  const bare = text.replace(BLANK, '')
  if (/[{}]/.test(bare)) return 'stray_brace'
  // Rules 3 to 6.
  if (NUMBER_OR_CURRENCY.test(bare)) return 'number'
  if (MARKUP.test(bare)) return 'markup'
  if (LINK.test(bare)) return 'link'
  if (NUMBER_WORD.test(bare)) return 'number_word'
  if (PRODUCT.test(bare)) return 'product'
  // Rule 7.
  if ((text.match(/\n/g) ?? []).length > MAX_LINE_BREAKS) return 'line_breaks'
  if (text.length > limit) return 'too_long'
  return null
}

/**
 * A string a model wrote, held to the text rule and a field's length. It
 * parses to the NFKC form, which is what the rule was applied to, so the
 * words drawn are the words checked. A refusal's message is the rule
 * broken, a code safe to count.
 */
export const ModelProse = (limit: number) =>
  z
    .string()
    .transform((s) => s.normalize('NFKC'))
    .superRefine((text, ctx) => {
      const problem = proseProblem(text, limit)
      if (problem !== null) ctx.addIssue({ code: 'custom', message: problem })
    })
