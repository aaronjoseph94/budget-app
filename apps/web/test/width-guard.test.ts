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
