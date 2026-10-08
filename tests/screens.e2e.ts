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
