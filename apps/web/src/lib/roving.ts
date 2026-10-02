/**
 * Where a roving-tab key moves focus among `length` items from `at`, as
 * the ARIA tabs and radio patterns say: the arrows step and wrap, Home and
 * End go to the ends. Null for any other key, which the caller leaves be.
 */
export function arrowIndex(key: string, at: number, length: number): number | null {
  return key === 'ArrowRight' ? (at + 1) % length
    : key === 'ArrowLeft' ? (at + length - 1) % length
    : key === 'Home' ? 0
    : key === 'End' ? length - 1
    : null
}
