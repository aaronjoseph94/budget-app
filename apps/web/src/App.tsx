import { useMemo } from 'react'
import { readEnv } from './env.js'
import { createSupabase } from './supabase.js'
import { NotConfigured, SignIn, useSession } from './auth.js'
import { AppDataProvider, useAppData } from './app-data.js'
import { navigate, useScreen, type Screen } from './nav.js'
import { WeekScreen } from './screens/WeekScreen.js'
import { ReviewScreen } from './screens/ReviewScreen.js'
import { AddScreen } from './screens/AddScreen.js'
import { LedgerScreen } from './screens/LedgerScreen.js'
import { SettingsScreen } from './screens/SettingsScreen.js'
import { Alert } from './components/ui/feedback.js'
import { Icon, type IconName } from './components/ui/icons.js'
import { cn } from './lib/cn.js'

export function App() {
  const env = useMemo(() => readEnv(), [])
  if (!env.ok) return <NotConfigured missing={env.missing} />
  return <Configured env={env.env} />
}

function Configured({ env }: { env: Parameters<typeof createSupabase>[0] }) {
  const supabase = useMemo(() => createSupabase(env), [env])
  const session = useSession(supabase)

  if (session.status === 'loading') {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
  }
  if (session.status === 'signed-out') return <SignIn supabase={supabase} />

  return (
    <AppDataProvider supabase={supabase} userId={session.session.user.id} email={session.session.user.email ?? ''}>
      <Shell />
    </AppDataProvider>
  )
}

const TABS: readonly { screen: Screen; label: string; icon: IconName }[] = [
  { screen: 'week', label: 'Week', icon: 'home' },
  { screen: 'review', label: 'Review', icon: 'inbox' },
  { screen: 'add', label: 'Add', icon: 'plus' },
  { screen: 'ledger', label: 'Ledger', icon: 'list' },
  { screen: 'settings', label: 'Settings', icon: 'settings' },
]

function Shell() {
  const screen = useScreen()
  const { pendingTotal, loadError } = useAppData()

  return (
    <div className="min-h-full">
      {/* Wide screens: the same five destinations across the top. */}
      <header className="safe-top sticky top-0 z-20 hidden border-b bg-background/85 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight">Budget</span>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.screen}
                type="button"
                onClick={() => navigate(t.screen)}
                aria-current={screen === t.screen ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  screen === t.screen ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon name={t.icon} className="size-4" />
                {t.label}
                {t.screen === 'review' && pendingTotal > 0 ? <Count n={pendingTotal} /> : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="safe-top pb-safe mx-auto w-full max-w-3xl px-4 pt-6 md:pb-12">
        {loadError !== null ? (
          <div className="mb-4">
            <Alert tone="error" title="Could not load your data">
              {loadError}
            </Alert>
          </div>
        ) : null}
        {screen === 'week' ? <WeekScreen /> : null}
        {screen === 'review' ? <ReviewScreen /> : null}
        {screen === 'add' ? <AddScreen /> : null}
        {screen === 'ledger' ? <LedgerScreen /> : null}
        {screen === 'settings' ? <SettingsScreen /> : null}
      </main>

      {/* Phones: a bottom tab bar within thumb reach, clear of the home indicator. */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => {
            const active = screen === t.screen
            return (
              <button
                key={t.screen}
                type="button"
                onClick={() => navigate(t.screen)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {/* Every icon sits in the same 32px box, so the labels line up. */}
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full',
                    t.screen === 'add' && (active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'),
                  )}
                >
                  <Icon name={t.icon} className={t.screen === 'add' ? 'size-5' : 'size-6'} />
                </span>
                {t.label}
                {t.screen === 'review' && pendingTotal > 0 ? (
                  <span className="absolute right-[22%] top-1">
                    <Count n={pendingTotal} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function Count({ n }: { n: number }) {
  return (
    <span className="tnum rounded-full bg-spend px-1.5 text-[10px] font-semibold leading-4 text-spend-foreground">
      {n > 99 ? '99+' : n}
    </span>
  )
}
