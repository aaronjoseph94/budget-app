/**
 * A question typed in the Coach's ask box, carried to Ask (plan §2.3, A24).
 * Kept in memory for the one move from the Coach to #/ask, never in the
 * address (where it would stay in the history) and never in storage.
 */
let handed: string | null = null

export function handOver(question: string): void {
  handed = question
}

/** The question handed over, once: a second look finds none. */
export function takeHandedOver(): string | null {
  const question = handed
  handed = null
  return question
}
