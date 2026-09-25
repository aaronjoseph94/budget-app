import { hashOf } from '../nav.js'

/** A report that did not load, in one line: a missing one-time update points to Help (plan §3.10). */
export function Failed({ missingUpdate }: { missingUpdate: boolean }) {
  return missingUpdate ? (
    <p className="text-sm">
      Reports need a one-time update.{' '}
      <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
        See One-time updates
      </a>
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">This report did not load. Reload to try again; everything else still works.</p>
  )
}
