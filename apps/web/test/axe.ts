import axe from 'axe-core'

/**
 * Runs axe-core over what a screen test has drawn and fails with each
 * problem's rule and where it is (N61.1, ADR 0009).
 *
 * The whole document is checked, not the test's container: help, the
 * charges sheet and every editor are drawn into a portal beside it, and a
 * sheet is exactly where a missing label hides.
 *
 * Only the WCAG A and AA rules run. axe's best-practice rules judge a whole
 * page (one `main`, one `h1`, all content in a landmark), and a test draws
 * one screen without the shell around it; heading order has its own test.
 * Colour contrast is off because jsdom lays out nothing and computes no
 * colours, so axe could only say "can't tell"; contrast.test.ts checks
 * every colour token in index.css, light and dark, instead.
 */
export async function expectNoAxeViolations(root: Element = document.body): Promise<void> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  })
  const found = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${v.help} at ${n.target.join(' ')}`),
  )
  if (found.length > 0) throw new Error(`axe found ${found.length} problem(s):\n${found.join('\n')}`)
}
