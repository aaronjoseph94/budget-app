import { beforeAll } from 'vitest'
import { lazyParts } from '../src/lib/lazy-part.js'

/**
 * Every DOM test file: fetch each lazy part its imports declared before
 * the first test draws.
 *
 * A lazy part draws its fallback first, and React then holds the part back
 * for 300 ms after a fallback shows. With the module still to load, that
 * took most of findBy's one second, and with two suites at once on four
 * cores a screen reached through the shell missed it at random. Fetched
 * here, the part draws at once and findBy waits only on the app's own
 * reads. A part's module can declare more parts (Settings' progress line),
 * so this repeats until nothing new is left.
 */

// React.lazy keeps its loader as `_payload`, started by `_init`, which
// throws the pending import until it has settled.
interface LazyInternals {
  readonly _payload: unknown
  readonly _init: (payload: unknown) => unknown
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'

async function fetchPart(part: unknown): Promise<void> {
  const { _init: init, _payload: payload } = part as LazyInternals
  if (typeof init !== 'function') throw new Error("React.lazy's shape changed: test/setup-dom.ts can no longer fetch the parts ahead")
  try {
    init(payload)
  } catch (pending) {
    if (!isThenable(pending)) throw pending
    await pending
  }
}

beforeAll(async () => {
  const fetched = new Set<unknown>()
  for (let next = lazyParts(); next.length > 0; next = lazyParts().filter((p) => !fetched.has(p))) {
    for (const part of next) fetched.add(part)
    await Promise.all(next.map(fetchPart))
  }
})
