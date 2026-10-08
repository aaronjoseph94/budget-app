import { describe, expect, it } from 'vitest'
// Whole, as written: vitest.config.ts lets this one stylesheet through.
import css from '../src/index.css?raw'

/**
 * A row that scrolls inside its own box fades at its right edge while there
 * is more to see (plan §9, A26), tied to its own scroll, so a row that fits
 * does not fade. jsdom runs no scroll timeline, so the rule and its users
 * are what is checked; the preview harness showed it.
 */
const sources = import.meta.glob<string>('../src/**/*.tsx', { query: '?raw', import: 'default', eager: true })
const source = (end: string) => Object.entries(sources).find(([path]) => path.endsWith(end))![1]

describe('the edge fade', () => {
  it('fades by the row’s own scroll, only where the browser can tie it to one', () => {
    expect(css).toMatch(/@supports \(animation-timeline: scroll\(\)\) \{\s*\.edge-fade \{[^}]*mask-image:[^}]*animation-timeline: scroll\(x self\);/)
  })

  it('is on the Week · Month · Year switch and on Reports’ tabs', () => {
    expect(source('/screens/PeriodSwitch.tsx')).toMatch(/className="edge-fade [^"]*overflow-x-auto/)
    // Reports' tabs scroll in the box around their segmented control, as the switch's do (Mockup A step 8).
    expect(source('/screens/ReportsScreen.tsx')).toMatch(/className="edge-fade [^"]*overflow-x-auto[^"]*">\s*<div role="tablist"/)
  })
})
