import { describe, expect, it } from 'vitest'

/**
 * Nothing on a phone may be wider than the phone (plan §9, A26). The
 * narrowest screen the app is built for is 320 px, so a width or minimum
 * width the class itself fixes above that pushes the page sideways there,
 * whatever the rest of the layout does. A class behind a breakpoint
 * (`md:w-96`) only applies where there is room, and a `max-w-*` is a
 * ceiling, not a floor, so neither is held to it.
 *
 * The harness sweep in the scratchpad measures the drawn page; this is the
 * part of it that can run in CI without a browser.
 */
const NARROWEST = 320

/** Tailwind v4's container sizes, which `w-sm` and `min-w-md` read. */
const CONTAINERS: Record<string, number> = {
  '3xs': 256, '2xs': 288, xs: 320, sm: 384, md: 448, lg: 512, xl: 576,
  '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024, '6xl': 1152, '7xl': 1280,
}

const BREAKPOINT = /^(sm|md|lg|xl|2xl|min-\[[^\]]+\]|@[a-z0-9]+):$/

/** The px a width value fixes, or null when it follows its container. */
function fixedPx(value: string): number | null {
  const bracket = /^\[(\d+(?:\.\d+)?)(px|rem|em)\]$/.exec(value)
  if (bracket !== null) return Number(bracket[1]) * (bracket[2] === 'px' ? 1 : 16)
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 4
  return CONTAINERS[value] ?? null
}

/** Every class in `text` that fixes a width wider than the narrowest phone. */
function tooWide(text: string): string[] {
  const found: string[] = []
  for (const token of text.split(/[\s"'`{}()]+/)) {
    const parts = token.split(/:(?![^[]*\])/)
    const utility = parts.pop() ?? ''
    if (parts.some((variant) => BREAKPOINT.test(`${variant}:`))) continue
    const m = /^!?(w|min-w|size|basis)-(.+)$/.exec(utility)
    if (m === null) continue
    const px = fixedPx(m[2]!)
    if (px !== null && px > NARROWEST) found.push(token)
  }
  return found
}

const sources = import.meta.glob<string>('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

describe('the width guard', () => {
  it('finds a fixed width over 320 px, in any unit the app could write', () => {
    expect(tooWide('flex w-[21rem] gap-2')).toEqual(['w-[21rem]'])
    expect(tooWide('min-w-[400px] basis-96 size-84 w-sm')).toEqual(['min-w-[400px]', 'basis-96', 'size-84', 'w-sm'])
    expect(tooWide('hover:min-w-md')).toEqual(['hover:min-w-md'])
  })

  it('lets through what fits, what follows its box, and what waits for room', () => {
    expect(tooWide('w-80 w-xs min-w-[18rem] w-[320px] w-full min-w-max w-[calc(100%-2rem)]')).toEqual([])
    expect(tooWide('max-w-2xl md:w-96 lg:min-w-[40rem] min-[400px]:w-sm')).toEqual([])
  })

  it('reads every source file in the app', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50)
  })

  it('finds none in the app’s source', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) => tooWide(text).map((c) => `${path}: ${c}`))
    expect(offenders).toEqual([])
  })
})

/**
 * A grid given columns only behind a breakpoint has, on a phone, one
 * implicit column as wide as its widest unbreakable content, not as wide
 * as the screen: with text at 200% the Week's blocks ran 12 px past it and
 * the Year's glance cards 126 (N58). `grid-cols-1` is one column that
 * shrinks to the screen. Read one quoted class list at a time, so a
 * column count chosen in code (the Year's charts) is the sweep's to see.
 */
function phoneGridsWithoutColumns(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(/(["'`])([^"'`]*)\1/g)) {
    const tokens = m[2]!.split(/\s+/)
    if (!tokens.includes('grid')) continue
    const cols = tokens.filter((t) => /(^|:)grid-cols-/.test(t))
    if (cols.length > 0 && cols.every((t) => t.includes(':'))) found.push(m[2]!)
  }
  return found
}

describe('grids on a phone', () => {
  it('finds a grid whose columns wait for a breakpoint', () => {
    expect(phoneGridsWithoutColumns('<ul className="grid gap-4 sm:grid-cols-2">')).toEqual(['grid gap-4 sm:grid-cols-2'])
    expect(phoneGridsWithoutColumns('<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">')).toEqual([])
    expect(phoneGridsWithoutColumns('<p className="grid gap-2">')).toEqual([])
  })

  it('gives every such grid a column that fits the screen', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) => phoneGridsWithoutColumns(text).map((c) => `${path}: ${c}`))
    expect(offenders).toEqual([])
  })
})


/**
 * A screen's title and its ? share a row. With the phone's text at 200%
 * "All transactions" and its ? were 61 px wider than a 390 px screen
 * (N58), so the row wraps and the ? drops under the title instead.
 */
describe('a title and its help button', () => {
  it('share a row that wraps', () => {
    const offenders: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        if (!line.includes('<HelpButton') || /^\s*(\*|\/\/)/.test(line)) return
        const row = lines.slice(Math.max(0, i - 4), i).reverse().find((l) => l.includes('className="flex'))
        if (row !== undefined && !row.includes('flex-wrap')) offenders.push(`${path}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

/**
 * The page's side gutter is 16 px, and 12 below 360 px (plan §9), which
 * gave the Month's tables the room they lacked at 320 (N66). A band that
 * bleeds to the screen's edges takes back exactly the gutter, so each
 * `-mx-4` has its narrow twin, or it would run 4 px past the screen.
 */
describe('the gutter below 360 px', () => {
  const app = Object.entries(sources).find(([path]) => path.endsWith('/App.tsx'))![1]

  it('is 12 px on the page', () => {
    expect(app).toMatch(/pt-screen pb-safe mx-auto w-full px-4 [^']*max-\[359px\]:px-3/)
  })

  it('is taken back exactly by every band that bleeds to the edge', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) =>
      [...text.matchAll(/(["'`])([^"'`]*)\1/g)]
        .map((m) => m[2]!.split(/\s+/))
        .filter((tokens) => tokens.includes('-mx-4') && !tokens.includes('max-[359px]:-mx-3'))
        .map((tokens) => `${path}: ${tokens.join(' ')}`),
    )
    expect(offenders).toEqual([])
  })
})

/**
 * A link that follows a sentence's words (`…update.{' '}<a …>`) takes its
 * 44 px from padding, SENTENCE_LINK: a 44 px box stretched its line and
 * split the sentence with a gap (N76, N86), and a bare underlined link was
 * 16 px tall to a finger.
 */
describe('a link inside a sentence', () => {
  it('is SENTENCE_LINK', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) =>
      [...text.matchAll(/\{' '\}\s*\n\s*<a [^>]*className="[^"]*"/g)].map((m) => `${path}: ${m[0].split('\n').pop()!.trim()}`),
    )
    expect(offenders).toEqual([])
  })

  it('is pressed over 44 px through padding: 14 above and below the letters', () => {
    const link = Object.entries(sources).find(([path]) => path.endsWith('/components/ui/link.ts'))![1]
    expect(link).toMatch(/SENTENCE_LINK = '[^']*\bpy-3\.5\b[^']*'/)
    expect(link).not.toMatch(/SENTENCE_LINK = '[^']*inline-flex/)
  })
})

/**
 * A date or month field shares a row only from 360 px up: at 320 half a
 * row cut Chromium's empty "mm/dd/yyyy" at its edge (N109), and iOS draws
 * its dates wider still. Below 360 px such a pair stacks.
 */
describe('a date beside another field', () => {
  it('stacks below 360 px', () => {
    const offenders: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        if (!/type="(date|month)"/.test(line)) return
        const grid = lines.slice(Math.max(0, i - 12), i).reverse().find((l) => /className="grid /.test(l) || /<\/div>/.test(l))
        if (grid !== undefined && /grid-cols-2/.test(grid) && !/grid-cols-1 [^"]*min-\[360px\]:grid-cols-2/.test(grid)) offenders.push(`${path}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

/**
 * A chart's labels grow with its width, so on a desktop a full-width chart
 * drew them at twice the page's text (N88, N97). Each chart is given a
 * `max-w-*`, or sits in a box that sizes it; those boxes are named here.
 */
describe('a chart', () => {
  // Each sits in a box of its own: the sparkline in w-24, the debt ring in
  // its caller's className, the Year's lines in a box sized for them.
  const SIZED_BY_A_BOX = ['reports/Trends.tsx: sparkline', 'screens/DebtsScreen.tsx', 'screens/YearCharts.tsx']

  it('is held to a readable width on a wide screen', () => {
    const offenders: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/<SvgChart\b[\s\S]*?\/>/g)) {
        if (/className=(\{cn\(|"[^"]*)max-w-|className=\{cn\([^)]*max-w-/.test(m[0])) continue
        const where = `${path.replace('../src/', '')}${m[0].includes('sparkline(') ? ': sparkline' : ''}`
        if (!SIZED_BY_A_BOX.includes(where)) offenders.push(where)
      }
    }
    expect(offenders).toEqual([])
  })
})

/**
 * A button drawn as underlined words on a line of its own is 44 px to a
 * finger through LINE_BUTTON, as Button is (FE-1): bare, it is the height
 * of its text, 16 to 20 px. The Year's were found in the sweep, and
 * sign-in's "Email me a link instead", which the sweep never opens.
 */
function textButtonsUnder44(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(/<button\b[\s\S]{0,80}?className=(\{cn\([^)]*\)\}|"[^"]*")/g)) {
    const classes = m[1]!
    if (!classes.split(/[\s'"(),{}]+/).includes('underline')) continue
    if (!classes.includes('LINE_BUTTON') && !/\bmin-h-11\b/.test(classes)) found.push(classes)
  }
  return found
}

describe('a button drawn as a link', () => {
  it('finds underlined words with no 44 px floor', () => {
    expect(textButtonsUnder44('<button type="button" className="text-sm underline" onClick')).toEqual(['"text-sm underline"'])
    expect(textButtonsUnder44("<button type=\"button\" className={cn('text-sm underline', LINE_BUTTON)} onClick")).toEqual([])
    expect(textButtonsUnder44('<button type="button" className="min-h-11 hover:underline" onClick')).toEqual([])
  })

  it('is 44 px to a finger everywhere in the app', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) => textButtonsUnder44(text).map((c) => `${path}: ${c}`))
    expect(offenders).toEqual([])
  })
})
