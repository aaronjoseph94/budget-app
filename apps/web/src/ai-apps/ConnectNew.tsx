import { Fragment, useState } from 'react'
import { useAppData } from '../app-data.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { CONNECT_MINUTES, saveAccess, serverAddress } from './access.js'

/** Starts the copy within the tap, which Safari on an iPhone requires; false when the browser refuses it. */
function copy(text: string): Promise<boolean> {
  try {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    )
  } catch {
    return Promise.resolve(false)
  }
}

/**
 * The address to paste, and Connect a new AI app (PLAN §2.9, §2.10). The
 * button copies the address and opens the 15 minutes in which the consent
 * page offers Allow, so a connection someone else started, and sent to the
 * owner as a link, finds no window open.
 */
export function ConnectNew() {
  const { supabase, userId } = useAppData()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const address = serverAddress(supabase)

  const connect = async () => {
    setBusy(true)
    setSaid('')
    const until = new Date(Date.now() + CONNECT_MINUTES * 60_000).toISOString()
    const [copied, opened] = await Promise.all([copy(address), saveAccess(supabase, userId, { connectUntil: until })])
    setBusy(false)
    setSaid(
      opened !== true
        ? 'Couldn’t open a new connection just now, so Claude or ChatGPT would be turned away. Check your connection and try again.'
        : copied
          ? `Copied. Paste it in Claude or ChatGPT within ${CONNECT_MINUTES} minutes.`
          : `Your browser didn’t allow copying. Copy the address above by hand, then paste it in Claude or ChatGPT within ${CONNECT_MINUTES} minutes.`,
    )
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-base font-semibold">The address to paste</p>
      {/* One long word: it may break after a slash, and anywhere only where it cannot fit. */}
      <p className="rounded-md border bg-muted px-3 py-2 font-mono text-sm [overflow-wrap:anywhere]">
        {address.split('/').map((part, i) => (
          <Fragment key={i}>
            {i === 0 ? null : '/'}
            {i < 3 ? null : <wbr />}
            {part}
          </Fragment>
        ))}
      </p>
      <Button size="tall" disabled={busy} onClick={() => void connect()}>
        <Icon name="plus" /> Connect a new AI app
      </Button>
      <p className="text-sm text-muted-foreground">
        Copies the address, and lets a new AI app connect for the next {CONNECT_MINUTES} minutes. Press it each time you add the app in
        Claude or ChatGPT.
      </p>
      <p aria-live="polite" className="text-base font-medium empty:sr-only">
        {said}
      </p>
    </div>
  )
}
