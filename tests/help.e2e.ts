import { beforeEach, test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { HELP_TOPICS } from '../apps/web/src/help/topics.js'
import { expectClean, expectScreen, watch } from './lib/page.js'

/**
 * Help: the index lists every committed article, and each opens with its
 * own title. The list is the app's own, so a rewrite that folds articles
 * changes this suite's count and names with it.
 */
beforeEach(async ({ browser }) => {
  await watch(browser)
})

test('the index lists every article', async ({ app, screen, browser }) => {
  await app.open('/#/help')
  await expectScreen(screen, browser, 'Help')
  await expect(screen.getByRole('main').getByRole('listitem')).toHaveCount(HELP_TOPICS.length)
  await expectClean(browser)
})

for (const topic of HELP_TOPICS) {
  test(`the ${topic} article opens`, async ({ app, screen, browser }) => {
    await app.open(`/#/help/${topic}`)
    const title = await expectScreen(screen, browser, 'Help')
    expect(title, 'the article’s own title, not the index’s').not.toBe('Help')
    await expect(screen.getByRole('article')).toBeVisible()
    await expectClean(browser)
  })
}
