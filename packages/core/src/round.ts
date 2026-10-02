/**
 * Rounding shared inside core. Not re-exported from the index: what is
 * rounded, and where, is each engine's to say.
 */

/** part ÷ whole for a part of 0 or more, half-up. */
export function halfUp(part: bigint, whole: bigint): number {
  return Number((part * 2n + whole) / (2n * whole))
}
