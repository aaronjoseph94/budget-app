import { describe, expect, it } from 'vitest'
import { fit, frame, lengthOf, textUnits } from '../src/frame.js'
import { el } from '../src/svg.js'

const chart = { id: 'spend', title: 'Fun & <Games> by week', description: 'Where "it" went.' }

describe('frame', () => {
  it('is an image named by its title and described by its description, both escaped', () => {
    const svg = frame(chart, 1_575, [el('g', {})])
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 1575" width="300" height="158" role="img"' +
        ' aria-labelledby="spend-title spend-desc" class="workbook-chart"' +
        ' font-family="ui-sans-serif, system-ui, sans-serif" font-size="120">' +
        '<title id="spend-title">Fun &amp; &lt;Games&gt; by week</title>' +
        '<desc id="spend-desc">Where &quot;it&quot; went.</desc><g/></svg>',
    )
  })

  // The id names the title and description for a screen reader, so a space
  // in it would point at two ids that do not exist.
  it('refuses an id that could not name the title', () => {
    expect(() => frame({ ...chart, id: 'a b' }, 100, [])).toThrow(RangeError)
    expect(() => frame({ ...chart, id: '1a' }, 100, [])).toThrow(RangeError)
  })
})

describe('fit and textUnits', () => {
  it('shortens a name that will not fit with an ellipsis, counting emoji as one', () => {
    expect(fit('Groceries', 700)).toBe('Groceries')
    expect(fit('Movie Theater', 700)).toBe('Movie The…')
    expect(fit('🎬🎬🎬', 140)).toBe('🎬…')
    expect(fit('Anything', 69)).toBe('…')
    expect(textUnits('$1.00')).toBe(350)
  })
})

describe('lengthOf', () => {
  it('turns basis points into whole units, half-up, never past the whole', () => {
    expect([lengthOf(0, 3_000), lengthOf(1, 5_000), lengthOf(3_333, 3_000), lengthOf(12_000, 3_000)]).toEqual([
      0, 1, 1_000, 3_000,
    ])
  })

  it('refuses a fraction of a basis point, or one below zero', () => {
    expect(() => lengthOf(12.5, 3_000)).toThrow(RangeError)
    expect(() => lengthOf(-1, 3_000)).toThrow(RangeError)
  })
})
