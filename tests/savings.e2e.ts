import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { expectClean, expectScreen, watch } from './lib/page.js'

/** Savings: a goal added from its sheet gets a card of its own. */
beforeEach(async ({ browser }) => {
  await watch(browser)
})

test('a goal is added with its fund', async ({ app, screen, browser }) => {
  await app.open('/#/savings')
  await expectScreen(screen, browser, 'Savings')
  await screen.getByRole('button', 'Add a goal').tap()
  const sheet = screen.getByRole('dialog', 'Add a goal')
  await sheet.getByLabel('Name').fill('Bike')
  await sheet.getByLabel('Target ($)').fill('1200')
  await sheet.getByRole('button', 'Add goal').tap()
  await expect(sheet).toBeHidden()
  await expect(screen.getByRole('region', 'Bike')).toBeVisible()
  await expect(screen.getByRole('main')).toContainText('Bike is added, with its fund on your Savings list.')
  await expectClean(browser)
})
