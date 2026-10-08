import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { axeOn, expectScreen, watch } from './lib/page.js'
import { SCREENS } from './lib/screens.js'

/**
 * axe-core over every screen as a browser draws it, shell and colours
 * included: what the jsdom check (apps/web/test/axe.ts) cannot judge,
 * colour contrast and the page's landmarks among it.
 */
beforeEach(async ({ browser }) => {
  await watch(browser, { axe: true })
})

for (const s of SCREENS) {
  test(`${s.path} is clean for axe`, async ({ app, screen, browser }) => {
    await app.open(s.path)
    await expectScreen(screen, browser, s.name)
    expect(await axeOn(browser)).toEqual([])
  })
}
