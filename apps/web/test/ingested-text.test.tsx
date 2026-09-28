import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { within } from '@testing-library/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { IngestedText } from '../src/ui.js'
import { expectNoAxeViolations } from './axe.js'

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
  it('renders a markup-looking merchant as text, never as elements', async () => {
    const hostile = '<img src=x onerror="alert(1)"><b>COFFEE</b>'
    const el = render(<IngestedText>{hostile}</IngestedText>)
    // By role and by text, as a reader would find it: no image was created,
    // and the whole string sits in one element as characters.
    expect(within(el).queryByRole('img')).toBeNull()
    expect(within(el).getByText(hostile).tagName).toBe('SPAN')
    expect(el.querySelector('b')).toBeNull()
    await expectNoAxeViolations()
  })
})
