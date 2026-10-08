import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { expectClean, expectScreen, rpcCalls, watch } from './lib/page.js'

/**
 * Add: a charge typed by hand, and a CSV statement read on the device and
 * sent to Review. The fake server keeps no rows from either; the test
 * reads the call that reached it.
 */
beforeEach(async ({ browser }) => {
  await watch(browser)
})

test('a charge typed by hand reaches the server as spending', async ({ app, screen, browser }) => {
  await app.open('/#/add')
  await expectScreen(screen, browser, 'Add')
  await screen.getByRole('tab', 'Type it').tap()
  await screen.getByLabel('Amount').fill('4.50')
  await screen.getByLabel('What was it?').fill('Coffee cart')
  await screen.getByLabel('Category').selectOption('Restaurants')
  await screen.getByRole('button', 'Add').tap()
  await expect(screen.getByRole('main')).toContainText('Added $4.50 — Coffee cart.')
  expect(await rpcCalls(browser, 'add_typed_transaction')).toMatchObject([{ p_amount_cents: -450, p_merchant_raw: 'Coffee cart' }])
  await expectClean(browser)
})

test('a CSV statement is read here and sent to the review queue', async ({ app, screen, browser }) => {
  await app.open('/#/add')
  await expectScreen(screen, browser, 'Add')
  // A reduced, synthetic export from the parsers' own fixtures: the one
  // place a statement file may live in the repository (CLAUDE.md).
  await screen.getByLabel('Choose a statement', { exact: false }).setInputFiles('packages/statement-parsers/test/fixtures/messy-statement.csv')
  await screen.getByRole('button', /^Send \d+ to the review queue$/).tap()
  await expect(screen.getByRole('main')).toContainText('waiting for review.')
  expect(await rpcCalls(browser, 'save_import')).toHaveLength(1)
  await expectClean(browser)
})
