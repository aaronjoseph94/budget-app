/**
 * Text runs, with the position the page put them at.
 *
 * Position is the whole point. A statement is a TABLE, and a table read as a
 * stream of words is a pile of words: the date column and the amount column
 * become indistinguishable, and `Aug 10` next to `31.45` is only meaningful
 * because of where each sits. So every run keeps its x and y, and the layout
 * pass (layout.ts) rebuilds rows and columns from them.
 *
 * This deliberately does NOT interpret fonts. A simple font's WinAnsiEncoding
 * is what the Latin-1 decode already gives; a CID-keyed font would come out as
 * mojibake here. That is not silently tolerated — mojibake fails the amount and
 * date parsers, which fails reconciliation, which refuses the import. Being
 * unable to read a file is a fine outcome. Misreading one is not.
 */

export interface TextRun {
  readonly x: number
  readonly y: number
  readonly text: string
}

/** Above this, a page is not a statement page and something has gone wrong. */
export const MAX_RUNS_PER_PAGE = 20_000

const latin1 = new TextDecoder('latin1')

/**
 * Every pattern below is linear on any input (security-b-04): a run of
 * digits or of open brackets made the old ones try every split of it, and a
 * 1KB page held the main thread for an hour. A number operand starts only
 * at the first character of a run and is bounded, as is the gap after it,
 * so each attempt costs a constant. An array's body cannot hold a bare `[`,
 * so each `[` scans no further than the next; a `[` inside one of its
 * strings is still read, because strings are matched whole.
 *
 * A string or an array starts only at a bracket no backslash escapes
 * (testing fuzz-01): an escaped one can sit inside a body, so each could
 * start a scan to the end of the page, and `(` then 40,000 `\(` took
 * seconds. Outside a string a backslash means nothing, so no real string
 * or array starts after one.
 */
const OPEN = String.raw`(?<!\\)`
const NUMBER_START = String.raw`(?<![-\d.])`
const NUMBER = String.raw`[-\d.]{1,32}`
const GAP = String.raw`\s{1,16}`
const ARRAY_LITERAL = String.raw`\((?:\\[\s\S]|[^\\()])*\)`

/**
 * The operators that matter, in one pass.
 *
 * Ordered so that the longest, most specific forms match first: an array-form
 * `TJ` must be recognised before the bare number forms inside it are.
 */
const TOKEN = new RegExp(
  [
    String.raw`${OPEN}\((?<lit>(?:\\[\s\S]|[^\\()])*)\)\s*(?<litOp>Tj|TJ|'|")`,
    String.raw`<(?<hex>[0-9A-Fa-f\s]*)>\s*(?:Tj|TJ)`,
    String.raw`${OPEN}\[(?<arr>(?:${ARRAY_LITERAL}|<[0-9A-Fa-f\s]*>|\\[\s\S]|[^\[\]()<>\\])*)\]\s*TJ`,
    String.raw`${NUMBER_START}(?<tm>(?:${NUMBER}${GAP}){5}${NUMBER})${GAP}Tm`,
    String.raw`${NUMBER_START}(?<td>${NUMBER}${GAP}${NUMBER})${GAP}(?<tdOp>Td|TD)`,
    String.raw`(?<tstar>T\*)`,
    String.raw`${NUMBER_START}(?<lead>${NUMBER})${GAP}TL`,
    String.raw`(?<bt>BT)`,
  ].join('|'),
  'g',
)

const ARRAY_PIECE = new RegExp(
  [
    String.raw`${OPEN}\((?<lit>(?:\\[\s\S]|[^\\()])*)\)`,
    String.raw`<(?<hex>[0-9A-Fa-f\s]*)>`,
    String.raw`(?<adv>-?[\d.]+)`,
  ].join('|'),
  'g',
)

/**
 * A gap inside a `TJ` array wide enough to be a space.
 *
 * Array advances are thousandths of an em and are applied BEFORE font size, so
 * this threshold is font-size independent: 0.18em of extra gap is wider than
 * any kerning pair and narrower than any space glyph. Words that the producer
 * emitted as separate runs do not rely on this at all — they are separated by
 * their x positions instead, which is the more reliable signal and the one the
 * layout pass uses.
 */
const SPACE_ADVANCE = -180

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  '(': '(',
  ')': ')',
  '\\': '\\',
}

/** A PDF literal string, with its escapes resolved. */
export function decodeLiteral(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '\\') {
      out += raw[i]
      continue
    }
    const next = raw[i + 1]
    if (next === undefined) break
    if (next in ESCAPES) {
      out += ESCAPES[next]
      i += 1
      continue
    }
    if (next >= '0' && next <= '7') {
      let digits = ''
      while (digits.length < 3) {
        const d = raw[i + 1 + digits.length]
        if (d === undefined || d < '0' || d > '7') break
        digits += d
      }
      out += String.fromCharCode(Number.parseInt(digits, 8) & 0xff)
      i += digits.length
      continue
    }
    // A backslash before a newline is a line continuation: both disappear.
    if (next === '\n') {
      i += 1
      continue
    }
    if (next === '\r') {
      i += raw[i + 2] === '\n' ? 2 : 1
      continue
    }
    out += next
    i += 1
  }
  return out
}

function decodeHex(raw: string): string {
  const clean = raw.replace(/\s+/g, '')
  const padded = clean.length % 2 === 0 ? clean : `${clean}0`
  let out = ''
  for (let i = 0; i < padded.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(padded.slice(i, i + 2), 16))
  }
  return out
}

/** Every text-showing operation on one page, with where it was drawn. */
export function extractRuns(stream: Uint8Array): readonly TextRun[] {
  const content = latin1.decode(stream)
  const runs: TextRun[] = []
  let x = 0
  let y = 0
  let leading = 12

  TOKEN.lastIndex = 0
  for (let m = TOKEN.exec(content); m !== null; m = TOKEN.exec(content)) {
    if (runs.length >= MAX_RUNS_PER_PAGE) break
    const g = m.groups
    if (g === undefined) continue

    if (g['bt'] !== undefined) {
      x = 0
      y = 0
    } else if (g['lead'] !== undefined) {
      leading = Number(g['lead'])
    } else if (g['tm'] !== undefined) {
      const p = g['tm'].split(/\s+/).map(Number)
      x = p[4] ?? x
      y = p[5] ?? y
    } else if (g['td'] !== undefined) {
      const [dx, dy] = g['td'].split(/\s+/).map(Number)
      // The pattern takes two operands; a move missing one is no move.
      if (dx === undefined || dy === undefined) continue
      x += dx
      y += dy
      if (g['tdOp'] === 'TD') leading = -dy
    } else if (g['tstar'] !== undefined) {
      y -= leading
    } else if (g['lit'] !== undefined) {
      // `'` and `"` show text on the NEXT line, so the move happens first.
      if (g['litOp'] === "'" || g['litOp'] === '"') y -= leading
      push(runs, x, y, decodeLiteral(g['lit']))
    } else if (g['hex'] !== undefined) {
      push(runs, x, y, decodeHex(g['hex']))
    } else if (g['arr'] !== undefined) {
      push(runs, x, y, joinArray(g['arr']))
    }
  }
  return runs
}

function joinArray(raw: string): string {
  let out = ''
  ARRAY_PIECE.lastIndex = 0
  for (let p = ARRAY_PIECE.exec(raw); p !== null; p = ARRAY_PIECE.exec(raw)) {
    const g = p.groups
    if (g === undefined) continue
    if (g['lit'] !== undefined) out += decodeLiteral(g['lit'])
    else if (g['hex'] !== undefined) out += decodeHex(g['hex'])
    else if (g['adv'] !== undefined && Number(g['adv']) <= SPACE_ADVANCE) out += ' '
  }
  return out
}

function push(runs: TextRun[], x: number, y: number, text: string): void {
  if (text.trim().length === 0) return
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  runs.push({ x, y, text })
}
