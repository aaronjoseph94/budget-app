import type { AiView } from './client.js'
import { hashOf } from '../nav.js'
import { SENTENCE_LINK } from '../components/ui/link.js'

/**
 * The link after an AI state's sentence, where the app's own words show
 * (the Coach, the check-in, the month in review): AI settings when a key is
 * what is missing (N99), else the state's Help topic, or nothing.
 */
export function LineLink({ view }: { view: AiView }) {
  if (view.state === 'not_set_up') {
    return (
      <a href={hashOf({ screen: 'ai', param: null })} className={SENTENCE_LINK}>
        Open AI settings
      </a>
    )
  }
  if (view.help === null) return null
  return (
    <a href={hashOf({ screen: 'help', param: view.help })} className={SENTENCE_LINK}>
      {view.help === 'updates' ? 'Help: One-time updates' : 'Why?'}
    </a>
  )
}
