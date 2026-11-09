import { beforeEach, test } from '@e2e-dev/web'
import type { Browser } from '@e2e-dev/web'
import type { Screen } from 'e2e'
import { expect } from 'e2e'
import { expectClean, expectScreen, watch } from './lib/page.js'

/**
 * What a phone showed the second bug bash: long names, large amounts and
 * narrow fields at 320 px, the narrowest screen the app is built for.
 * Each test draws the fault's own case and measures the page.
 */
beforeEach(async ({ browser }) => {
  await watch(browser)
  await browser.setViewport({ width: 320, height: 640 })
})

/** Thirty letters with no space to break at. */
const LONG30 = 'Physiotherapychiropractormassa'

/** Another screen, without the page load that would reset the fake server. */
async function go(browser: Browser, hash: string): Promise<void> {
  await browser.evaluate((to: string) => {
    window.location.hash = to
    return null
  }, hash)
}

async function rename(screen: Screen, browser: Browser, from: string, to: string): Promise<void> {
  await go(browser, '#/settings/lists')
  await expectScreen(screen, browser, 'Settings')
  const field = screen.getByRole('textbox', `Rename ${from}`)
  await field.fill(to)
  await field.press('Enter')
  await expect(screen.getByRole('textbox', `Rename ${to}`)).toBeVisible()
}

test('a 30-letter category name wraps, and Budgeted, Actual and Left stay in view', async ({ app, screen, browser }) => {
  await app.open('/#/month/2026-09')
  await expectScreen(screen, browser, 'Month')
  await rename(screen, browser, 'Groceries', LONG30)
  for (const [hash, name] of [['#/month/2026-09', 'Month'], ['#/week/2026-09-21', 'Week'], ['#/paycheck/2026-09-11', 'Paycheck']] as const) {
    await go(browser, hash)
    await expectScreen(screen, browser, name)
    await expect(screen.getByRole('rowheader', LONG30)).toBeVisible()
    const cut = await browser.evaluate((long: string) => {
      const row = [...document.querySelectorAll('main th[scope=row]')].find((th) => th.textContent.includes(long))
      const box = row?.closest('.overflow-x-auto')
      if (box === null || box === undefined) return ['no table']
      const edge = box.getBoundingClientRect().right
      return [...box.querySelectorAll('thead th')].filter((th) => th.getBoundingClientRect().right > edge + 1).map((th) => th.textContent)
    }, LONG30)
    expect(cut, `${name}: columns past the card's edge`).toEqual([])
    await expectClean(browser)
  }
})
