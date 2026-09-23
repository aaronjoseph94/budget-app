import { describe, expect, it } from 'vitest'
import { el, escapeXml, finish } from '../src/svg.js'

describe('escapeXml', () => {
  it('escapes the five characters that can end a text node or an attribute', () => {
    expect(escapeXml(`Tom & Jerry's "<b>"`)).toBe('Tom &amp; Jerry&#39;s &quot;&lt;b&gt;&quot;')
  })

  // An escaped ampersand is text again: escaping twice must show "&amp;" to
  // the reader, not "&".
  it('escapes an entity that is already written out', () => {
    expect(escapeXml('R&amp;D')).toBe('R&amp;amp;D')
  })

  // XML refuses these outright, so an exported file holding one would not
  // open at all.
  it('replaces characters no XML document may contain', () => {
    expect(escapeXml('a\u0000b\u001Fc\tfine\n')).toBe('a�b�c\tfine\n')
  })
})

describe('el', () => {
  it('writes a category name with < and & as text, never as a tag', () => {
    const name = 'Fun & <Games>'
    expect(finish(el('text', { x: 4 }, [name]))).toBe('<text x="4">Fun &amp; &lt;Games&gt;</text>')
  })

  it('cannot be closed early by a name that looks like markup', () => {
    const svg = finish(el('svg', {}, [el('title', {}, ['</title><script>alert(1)</script>'])]))
    expect(svg).toBe('<svg><title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title></svg>')
    expect(svg).not.toContain('<script')
  })

  it('escapes attribute values, so a quote cannot open another attribute', () => {
    expect(finish(el('g', { 'aria-label': 'A "b" onload="x"' }))).toBe(
      '<g aria-label="A &quot;b&quot; onload=&quot;x&quot;"/>',
    )
  })

  it('keeps attributes in the order given and nests elements unescaped', () => {
    const svg = finish(el('svg', { viewBox: '0 0 10 10', width: 10 }, [el('rect', { x: 0, y: 1 }), 'a']))
    expect(svg).toBe('<svg viewBox="0 0 10 10" width="10"><rect x="0" y="1"/>a</svg>')
  })

  // Geometry is on an integer grid; a fraction here was computed somewhere
  // it should not have been.
  it('refuses a number that is not whole', () => {
    expect(() => el('rect', { width: 1.5 })).toThrow('rect width must be a whole number of units, received 1.5')
    expect(() => el('rect', { width: Number.NaN })).toThrow(RangeError)
  })

  it('refuses an element or attribute name that is not a name', () => {
    expect(() => el('g onload', {})).toThrow('Not an element name: g onload')
    expect(() => el('g', { 'x="1" y': 2 })).toThrow('Not an attribute name: x="1" y')
  })
})
