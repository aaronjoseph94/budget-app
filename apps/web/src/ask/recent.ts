/**
 * The last five questions asked, kept on this device only (plan §2.7): a
 * convenience, in the browser's storage, never sent anywhere. When storage
 * is refused (a private window) nothing is kept and Ask works as before.
 */
const KEY = 'budget.ask.recent'
const KEEP = 5

export function recentQuestions(): readonly string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(kept) ? kept.filter((q): q is string => typeof q === 'string').slice(0, KEEP) : []
  } catch {
    return []
  }
}

/** The question first, without an earlier copy of it; the newest five kept. */
export function keepQuestion(question: string): readonly string[] {
  const asked = question.trim()
  const kept = [asked, ...recentQuestions().filter((q) => q !== asked)].slice(0, KEEP)
  try {
    localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Not kept this time; the answer still shows.
  }
  return kept
}

export function forgetQuestions(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was kept to forget.
  }
}
