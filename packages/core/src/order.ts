/**
 * The one order the engine puts names in when nothing else decides
 * (architecture-a-02, docs/formula-decisions.md F52).
 *
 * `a.localeCompare(b)` with no locale follows the device's: the same two
 * categories sat in one order on an English phone and the other on a
 * Swedish one, and the check-in's "top" category on a tie followed them.
 * An engine answer may not depend on where it runs, so the locale is named
 * here, once: English, the way the app has always read on the owner's
 * devices ('apple', 'Ärenden', 'Zoo'), and not code-point order, which
 * would move 'Zoo' above 'apple' on every list.
 *
 * Internal to core: not exported from index.ts.
 */
const NAMES = new Intl.Collator('en')

/** Two names in English order, the same on every device. */
export function byName(a: string, b: string): number {
  return NAMES.compare(a, b)
}
