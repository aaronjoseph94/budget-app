import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { expectClean, expectScreen, watch } from './lib/page.js'

/** The Month: the Week · Month · Year switch by keyboard, and a budget typed on a row. */
beforeEach(async ({ browser }) => {
  await watch(browser)
})

test('the period switch moves with the arrow keys, Home and End, and Enter opens the view', async ({ app, screen, browser }) => {
  await app.open('/#/month/2026-09')
  await expectScreen(screen, browser, 'Month')
  const views = screen.getByRole('navigation', 'Views')
  const link = (name: string) => views.getByRole('link', name)
  await expect(link('Month')).toHaveAttribute('aria-current', 'page')
  await link('Month').focus()
  await link('Month').press('ArrowRight')
  await expect(link('Year')).toBeFocused()
  await link('Year').press('ArrowLeft')
  await expect(link('Month')).toBeFocused()
  await link('Month').press('Home')
  await expect(link('Week')).toBeFocused()
  await link('Week').press('End')
  await expect(link('Year')).toBeFocused()
  await link('Year').press('Enter')
  await expect(browser).toHaveURL('/#/year')
  await expectScreen(screen, browser, 'Year')
  await expect(link('Year')).toHaveAttribute('aria-current', 'page')
  await expectClean(browser)
})

test('a budget typed on a row is saved from this month on', async ({ app, screen, browser }) => {
  await app.open('/#/month/2026-09')
  await expectScreen(screen, browser, 'Month')
  await screen.getByRole('button', 'Budget for Groceries, $600.00').tap()
  const field = screen.getByRole('textbox', 'Budget for Groceries in September')
  await field.fill('650')
  await field.press('Enter')
  await expect(screen.getByRole('button', 'Budget for Groceries, $650.00')).toBeVisible()
  await expect(screen.getByRole('main')).toContainText('Groceries: $650.00 from September on.')
  await expectClean(browser)
})
