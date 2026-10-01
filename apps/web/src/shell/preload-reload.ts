/** The session key that says the page has already reloaded for a missing chunk. */
const KEY = 'budget:preload-reloaded'

/**
 * A screen's chunk that will not load is most often one an older page asked
 * for after a new deploy replaced it (FE-1). One reload fetches the new page
 * and its chunks. A flag in session storage keeps that to once, so a chunk
 * that is gone for another reason cannot reload the page in a loop; the
 * screen's own "did not load" note is left to say so. With storage blocked
 * there is no flag to keep, so nothing reloads by itself.
 */
export function reloadOnceOnPreloadError(storage: Storage | null, reload: () => void): boolean {
  if (storage === null) return false
  try {
    if (storage.getItem(KEY) !== null) return false
    storage.setItem(KEY, '1')
  } catch {
    return false
  }
  reload()
  return true
}
