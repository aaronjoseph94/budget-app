import { useRefresh } from './app-data.js'
import { SENTENCE_LINK } from './components/ui/link.js'

/**
 * The way out of a read that failed, inside the sentence that says so: read
 * everything again, here. The sentences said "Reload to try again", which an
 * installed iPhone app cannot do: it has no reload button, so the only way
 * out was to force-quit it (architecture-c1-01).
 */
export function TryAgain() {
  const refresh = useRefresh()
  if (refresh === null) return <>Try again in a moment</>
  return (
    <button type="button" className={SENTENCE_LINK} onClick={() => void refresh()}>
      Try again
    </button>
  )
}
