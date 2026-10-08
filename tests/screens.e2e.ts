import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { expectClean, expectScreen, watch } from './lib/page.js'
import { SCREENS } from './lib/screens.js'

/**
 * Every screen opens: its tab names it, its own h1 stands, nothing on it
 * still loads, the page raised no error, and at a phone's width nothing
 * is drawn past the edge or scrolls the page sideways.
 */
beforeEach(async ({ browser }) => {
  await watch(browser)
})

for (const s of SCREENS) {
  test(`${s.path} opens as ${s.name}`, async ({ app, screen, browser }) => {
    await app.open(s.path)
    const h1 = await expectScreen(screen, browser, s.name)
    if (s.h1 !== undefined) expect(h1).toBe(s.h1)
    await expectClean(browser)
  })
}

/**
 * 320 CSS pixels, the width WCAG's reflow rule names (1.4.10) and the
 * smallest iPhone's: every screen still fits without scrolling sideways.
 * WebKit's wider fallback font found the Coach's goal card past the edge
 * here when 390 fitted (docs/design/rework/05-bug-bash.md).
 */
for (const s of SCREENS) {
  test(`${s.path} fits 320 wide`, async ({ app, screen, browser }) => {
    await browser.setViewport({ width: 320, height: 640 })
    await app.open(s.path)
    await expectScreen(screen, browser, s.name)
    await expectClean(browser)
  })
}
