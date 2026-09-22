import { useMemo, useState } from 'react'
import { readEnv } from './env.js'
import { createSupabase } from './supabase.js'
import { NotConfigured, SignIn, useSession } from './auth.js'
import { ImportScreen } from './ImportScreen.js'
import { ReviewQueue } from './ReviewQueue.js'
import { ensureAccount, saveImport } from './ledger.js'
import { Button } from './ui.js'

const DEFAULT_ACCOUNT = 'Main Card'

export function App() {
  const env = useMemo(() => readEnv(), [])
  if (!env.ok) return <NotConfigured missing={env.missing} />
  return <Configured env={env.env} />
}

function Configured({ env }: { env: Parameters<typeof createSupabase>[0] }) {
  const supabase = useMemo(() => createSupabase(env), [env])
  const session = useSession(supabase)

  if (session.status === 'loading') {
    return <p className="py-16 text-center text-sm text-ink-soft">Loading…</p>
  }
  if (session.status === 'signed-out') return <SignIn supabase={supabase} />

  return <SignedIn supabase={supabase} userId={session.session.user.id} email={session.session.user.email ?? ''} />
}

type Tab = 'import' | 'review'

/**
 * What an import came to, and whether it worked.
 *
 * A boolean rather than a bare string because the two were previously the
 * same value in the same slot, so a failure rendered in the success colour —
 * a red-flag message in green, under a button still offering to save.
 */
export interface SaveOutcome {
  readonly ok: boolean
  readonly message: string
}

function SignedIn({
  supabase,
  userId,
  email,
}: {
  supabase: ReturnType<typeof createSupabase>
  userId: string
  email: string
}) {
  const [tab, setTab] = useState<Tab>('import')
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const onSave: Parameters<typeof ImportScreen>[0]['onSave'] = async (result) => {
    setSaving(true)
    setOutcome(null)
    try {
      const account = await ensureAccount(supabase, userId, DEFAULT_ACCOUNT)
      const counts = await saveImport(supabase, {
        userId,
        accountId: account.id,
        accepted: result.accepted,
        rejected: result.rejected,
        parsed: result.parsed,
        source: result.source,
      })
      // Says what happened to every row, including the ones it did nothing
      // with — a summary that only counts successes hides the rest.
      setOutcome({
        ok: true,
        message:
          `${counts.inserted} sent to review` +
          (counts.deduped > 0 ? `, ${counts.deduped} you already had` : '') +
          (counts.rejected > 0 ? `, ${counts.rejected} could not be read` : '') +
          '.',
      })
      setRefreshKey((k) => k + 1)
      // Deliberately NOT switching tabs here.
      //
      // It used to, and the summary above is rendered by the import screen —
      // so every import computed its counts and then unmounted the only thing
      // that displayed them. The user never once saw what happened to their
      // rows. Landing on the queue is not worth losing the only account of
      // the import; the queue is one tap away and now says how many are in it.
    } catch (cause) {
      setOutcome({
        ok: false,
        message: cause instanceof Error ? cause.message : 'Nothing was saved.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-4xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg border border-line p-1">
          {(['import', 'review'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t ? 'bg-accent text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {t === 'import' ? 'Import' : 'Review & ledger'}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="truncate text-xs text-ink-soft">{email}</span>
          <Button variant="quiet" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      {tab === 'import' ? (
        <ImportScreen onSave={onSave} saving={saving} outcome={outcome} />
      ) : (
        <ReviewQueue supabase={supabase} userId={userId} refreshKey={refreshKey} />
      )}
    </div>
  )
}
