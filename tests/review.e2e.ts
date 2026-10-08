import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { expectClean, expectScreen, rpcCalls, watch } from './lib/page.js'

/** Review: a waiting row, given a category, is approved and leaves the queue. */
beforeEach(async ({ browser }) => {
  await watch(browser)
})

test('a waiting row is approved into the category chosen', async ({ app, screen, browser }) => {
  await app.open('/#/review')
  await expectScreen(screen, browser, 'Review')
  const row = screen.getByRole('listitem').filter({ hasText: 'LITWARE COFFEE' })
  await expect(row).toBeVisible()
  await row.getByRole('combobox', 'Category').selectOption('Restaurants')
  await row.getByRole('button', 'Approve').tap()
  await expect(row).toBeHidden()
  await expect(screen.getByRole('listitem').filter({ hasText: 'ADVENTURE WORKS' })).toBeVisible()
  expect(await rpcCalls(browser, 'approve_candidate')).toMatchObject([{ p_candidate: 'p1' }])
  await expectClean(browser)
})
