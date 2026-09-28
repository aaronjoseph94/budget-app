import { describe, expect, it } from 'vitest'
import { SWITCH } from '../src/components/ui/form.js'

/**
 * Every on/off choice is drawn as a switch (N82, A26): a checkbox given
 * `role="switch"` takes SWITCH's track and knob, so none reads as the
 * browser's "tick to agree" box.
 */
const sources = import.meta.glob<string>('../src/**/*.tsx', { query: '?raw', import: 'default', eager: true })

describe('a switch', () => {
  it('is a track and a knob that moves and fills when on, not the browser box', () => {
    const classes = SWITCH.split(/\s+/)
    for (const c of ['appearance-none', 'rounded-full', 'bg-left', 'checked:bg-right', 'checked:bg-primary', 'focus-visible:ring-ring']) {
      expect(classes, c).toContain(c)
    }
  })

  it('is drawn with SWITCH wherever a checkbox is one', () => {
    let switches = 0
    const offenders: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/<input\b[^>]*>/g)) {
        if (!m[0].includes('role="switch"')) continue
        switches += 1
        if (!m[0].includes('className={SWITCH}')) offenders.push(path)
      }
    }
    expect(switches).toBeGreaterThanOrEqual(2)
    expect(offenders).toEqual([])
  })
})
