import { hashOf } from '../nav.js'
import { SENTENCE_LINK } from '../components/ui/link.js'

/** A report that did not load, in one line: a missing one-time update points to Help (plan §3.10). */
export function Failed({ missingUpdate }: { missingUpdate: boolean }) {
  return missingUpdate ? (
    <p className="text-sm">
      Reports need a one-time update.{' '}
      <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
        See One-time updates
      </a>
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">This report did not load. Reload to try again; everything else still works.</p>
  )
}
