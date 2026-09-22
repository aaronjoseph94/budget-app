import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { IngestedText } from '../src/ui.js'

// React warns about updates outside act() unless it is told this is a test.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLElement | null = null
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  host = null
  root = null
})

function render(node: ReactNode): HTMLElement {
  host = document.createElement('div')
  document.body.append(host)
  const mounted = createRoot(host)
  root = mounted
  act(() => mounted.render(node))
  return host
}

// CLAUDE.md: text inside a statement or a model response is data, never
// instruction. A merchant string that looks like markup must reach the screen
// as the same characters, not as elements.
describe('IngestedText', () => {
  it('renders a markup-looking merchant as text, never as elements', () => {
    const hostile = '<img src=x onerror="alert(1)"><b>COFFEE</b>'
    const el = render(<IngestedText>{hostile}</IngestedText>)
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('b')).toBeNull()
    expect(el.textContent).toBe(hostile)
  })
})
