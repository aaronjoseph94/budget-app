import { Suspense, lazy, useMemo } from 'react'
import { readEnv } from './env.js'
import { createSupabase } from './supabase.js'
import { NotConfigured, SignIn, useSession } from './auth.js'
import { AppDataProvider, useAppData } from './app-data.js'
import { navigate, useAddress, type Screen } from './nav.js'
import { CalendarScreen } from './screens/CalendarScreen.js'
import { MonthScreen } from './screens/MonthScreen.js'
import { MoreScreen } from './screens/MoreScreen.js'
import { PaycheckScreen } from './screens/PaycheckScreen.js'
import { WeekScreen } from './screens/WeekScreen.js'
import { ReviewScreen } from './screens/ReviewScreen.js'
import { AddScreen } from './screens/AddScreen.js'
import { LedgerScreen } from './screens/LedgerScreen.js'
import { SettingsScreen } from './screens/SettingsScreen.js'
import { SetupScreen } from './screens/SetupScreen.js'
import { displayNameOf } from './profile.js'
import { Alert } from './components/ui/feedback.js'
import { Icon, type IconName } from './components/ui/icons.js'
import { cn } from './lib/cn.js'

// Its own chunk, fetched the first time the Year opens: Month opens first
// (decision 1) and should not wait for twelve months' tables and charts.
const YearScreen = lazy(() => import('./screens/YearScreen.js').then((m) => ({ default: m.YearScreen })))

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
    <AppDataProvider
      supabase={supabase}
      userId={session.session.user.id}
      email={session.session.user.email ?? ''}
      displayName={displayNameOf(session.session.user.user_metadata)}
    >
      <Shell />
    </AppDataProvider>
  )
}

/** Phones: Month first, Add in the centre within thumb reach (plan §6.1). */
const PHONE_TABS: readonly Tab[] = [
  { screen: 'month', label: 'Month', icon: 'calendar' },
  { screen: 'week', label: 'Week', icon: 'week' },
  { screen: 'add', label: 'Add', icon: 'plus' },
  { screen: 'review', label: 'Review', icon: 'inbox' },
  { screen: 'more', label: 'More', icon: 'menu' },
]

/** Wide screens have room for Paycheck, the Bill calendar, Year and Setup on the bar itself (§6.1). */
const DESKTOP_TABS: readonly Tab[] = [
  { screen: 'month', label: 'Month', icon: 'calendar' },
  { screen: 'week', label: 'Week', icon: 'week' },
  { screen: 'paycheck', label: 'Paycheck', icon: 'wallet' },
  { screen: 'calendar', label: 'Bills', icon: 'bills' },
  { screen: 'year', label: 'Year', icon: 'calendar' },
  { screen: 'review', label: 'Review', icon: 'inbox' },
  { screen: 'add', label: 'Add', icon: 'plus' },
  { screen: 'setup', label: 'Setup', icon: 'list' },
  { screen: 'more', label: 'More', icon: 'menu' },
]

interface Tab {
  readonly screen: Screen
  readonly label: string
  readonly icon: IconName
}

/** The screens reached through More light the More tab while they show. */
function tabOf(screen: Screen, tabs: readonly Tab[]): Screen {
  return tabs.some((t) => t.screen === screen) ? screen : 'more'
}

export function Shell() {
  const { screen, period } = useAddress()
  const { pendingTotal, loadError } = useAppData()
  // Month, Week, Paycheck and Year widen on a desktop to take Workbook's four
  // columns (§6.3, §6.4), and the Bill Calendar to give its seven room for names.
  const wide = screen === 'month' || screen === 'week' || screen === 'paycheck' || screen === 'year' || screen === 'calendar'
  const width = wide ? 'max-w-3xl lg:max-w-7xl' : 'max-w-3xl'

  return (
    <div className="min-h-full">
      <header className="safe-top sticky top-0 z-20 hidden border-b bg-background/85 backdrop-blur md:block">
        <div className={cn('mx-auto flex h-14 items-center justify-between px-4', width)}>
          <span className="font-semibold tracking-tight">Budget</span>
          <nav aria-label="Screens" className="flex gap-1">
            {DESKTOP_TABS.map((t) => {
              const active = tabOf(screen, DESKTOP_TABS) === t.screen
              return (
                <button
                  key={t.screen}
                  type="button"
                  onClick={() => navigate(t.screen)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={labelOf(t, pendingTotal)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon name={t.icon} className="size-4" />
                  {/* Nine tabs with their words need about 930px; a tablet's
                    768 has room for the icons, and each keeps its name as
                    its label, so the words come back from 1024px. */}
                  <span className="hidden lg:inline">{t.label}</span>
                  {t.screen === 'review' && pendingTotal > 0 ? <Count n={pendingTotal} /> : null}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className={cn('pt-screen pb-safe mx-auto w-full px-4 md:pb-12', width)}>
        {loadError !== null ? (
          <div className="mb-4">
            <Alert tone="error" title="Could not load your data">
              {loadError}
            </Alert>
          </div>
        ) : null}
        {screen === 'month' ? <MonthScreen month={period} /> : null}
        {screen === 'week' ? <WeekScreen /> : null}
        {screen === 'paycheck' ? <PaycheckScreen day={period} /> : null}
        {screen === 'calendar' ? <CalendarScreen month={period} /> : null}
        {screen === 'review' ? <ReviewScreen /> : null}
        {screen === 'add' ? <AddScreen /> : null}
        {screen === 'more' ? <MoreScreen /> : null}
        {screen === 'ledger' ? <LedgerScreen /> : null}
        {screen === 'settings' ? <SettingsScreen /> : null}
        {screen === 'setup' ? <SetupScreen /> : null}
        {screen === 'year' ? (
          <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}>
            <YearScreen start={period} />
          </Suspense>
        ) : null}
      </main>

      {/* Phones: a bottom tab bar within thumb reach, clear of the home indicator. */}
      <nav
        aria-label="Screens"
        className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {PHONE_TABS.map((t) => {
            const active = tabOf(screen, PHONE_TABS) === t.screen
            return (
              <button
                key={t.screen}
                type="button"
                onClick={() => navigate(t.screen)}
                aria-current={active ? 'page' : undefined}
                aria-label={labelOf(t, pendingTotal)}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {/* Every icon sits in the same 32px box, so the labels line up. */}
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full',
                    t.screen === 'add' &&
                      (active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'),
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

/** "Review, 3 waiting" to a screen reader, rather than the badge read as "Review3". */
function labelOf(t: Tab, pendingTotal: number): string {
  return t.screen === 'review' && pendingTotal > 0 ? `${t.label}, ${pendingTotal} waiting` : t.label
}

function Count({ n }: { n: number }) {
  return (
    <span className="tnum rounded-full bg-spend px-1.5 text-[10px] font-semibold leading-4 text-spend-foreground">
      {n > 99 ? '99+' : n}
    </span>
  )
}
