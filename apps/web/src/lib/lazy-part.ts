import { lazy } from 'react'

const PARTS: unknown[] = []

/**
 * React's lazy, for a part of the app fetched the first time it is drawn
 * (PERF-3), with the part noted as its module loads. The app never reads
 * the list.
 *
 * The tests read it (test/setup-dom.ts): a lazy part draws its fallback
 * first, and React holds the part back for 300 ms after a fallback shows.
 * Under a busy processor that wait, and the fetch, ate most of a test's
 * one second to find the screen. Fetched before a test draws, the part
 * draws at once, as on a phone that already has it.
 */
export const lazyPart: typeof lazy = (load) => {
  const part = lazy(load)
  PARTS.push(part)
  return part
}

/** Every lazy part whose module has loaded so far. */
export function lazyParts(): readonly unknown[] {
  return PARTS
}
