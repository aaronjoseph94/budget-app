import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { expectClean, expectScreen, watch } from './lib/page.js'

/** Settings: its tabs by keyboard, the old addresses, and Use AI switched on. */
beforeEach(async ({ browser }) => {
  await watch(browser)
})

test('the tabs move with the arrow keys, Home and End, and the address follows', async ({ app, screen, browser }) => {
  await app.open('/#/settings/lists')
  await expectScreen(screen, browser, 'Settings')
  const tabs = screen.getByRole('tablist', 'Settings')
  const tab = (name: string) => tabs.getByRole('tab', name)
  await expect(tab('Lists')).toBeSelected()
  await tab('Lists').focus()
  await tab('Lists').press('ArrowRight')
  await expect(tab('Budgets & goals')).toBeFocused()
  await expect(tab('Budgets & goals')).toBeSelected()
  await expect(browser).toHaveURL('/#/settings/budgets')
  await tab('Budgets & goals').press('End')
  await expect(tab('Account')).toBeSelected()
  await expect(browser).toHaveURL('/#/settings/account')
  await tab('Account').press('ArrowLeft')
  await expect(tab('AI')).toBeSelected()
  await expect(browser).toHaveURL('/#/settings/ai')
  await tab('AI').press('Home')
  await expect(tab('Lists')).toBeSelected()
  await expect(browser).toHaveURL('/#/settings/lists')
  await expectClean(browser)
})

test('the old Setup and AI addresses open their tabs', async ({ app, screen, browser }) => {
  await app.open('/#/setup')
  await expect(browser).toHaveURL('/#/settings/lists')
  await expectScreen(screen, browser, 'Settings')
  await expect(screen.getByRole('tab', 'Lists')).toBeSelected()
  await app.open('/#/ai')
  await expect(browser).toHaveURL('/#/settings/ai')
  await expect(screen.getByRole('tab', 'AI')).toBeSelected()
})

test('Use AI turns on from off, and the choice is stored', async ({ app, screen, browser }) => {
  await app.open('/?aioff#/settings/ai')
  await expectScreen(screen, browser, 'Settings')
  const useAi = screen.getByRole('switch', 'Use AI')
  await expect(useAi).not.toBeChecked()
  await useAi.tap()
  await expect(useAi).toBeChecked()
  // The one stored row, as the next read of the choices will see it.
  expect(await browser.evaluate(() => (window.__preview?.tables.ai_settings ?? []).map((row) => row.enabled === true))).toEqual([true])
  await expectClean(browser)
})
