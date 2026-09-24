import { Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { readEnv } from './env.js'
import { createSupabase } from './supabase.js'
import { NotConfigured, SignIn, useSession } from './auth.js'
import { AppDataProvider, useAppData } from './app-data.js'
import { hashOf, useAddress, type Screen } from './nav.js'
import { MonthScreen } from './screens/MonthScreen.js'
import { MoreScreen } from './screens/MoreScreen.js'
import { displayNameOf } from './profile.js'
import { Alert } from './components/ui/feedback.js'
import { Button } from './components/ui/button.js'
import { AnnounceProvider } from './components/ui/announce.js'
import { Icon, type IconName } from './components/ui/icons.js'
import { cn } from './lib/cn.js'

// Each screen but the Month (and More, a list of links) is its own chunk,
// fetched the first time it opens. The Month opens first (decision 1), and
// it waited for every other screen's code: 214 KB gzipped, most of it
// unused on the Month (PERF-3). Add carries the statement readers with it.
const AddScreen = lazy(() => import('./screens/AddScreen.js').then((m) => ({ default: m.AddScreen })))
const CalendarScreen = lazy(() => import('./screens/CalendarScreen.js').then((m) => ({ default: m.CalendarScreen })))
const CoachScreen = lazy(() => import('./screens/CoachScreen.js').then((m) => ({ default: m.CoachScreen })))
const DebtsScreen = lazy(() => import('./screens/DebtsScreen.js').then((m) => ({ default: m.DebtsScreen })))
const LedgerScreen = lazy(() => import('./screens/LedgerScreen.js').then((m) => ({ default: m.LedgerScreen })))
const PaycheckScreen = lazy(() => import('./screens/PaycheckScreen.js').then((m) => ({ default: m.PaycheckScreen })))
const ReviewScreen = lazy(() => import('./screens/ReviewScreen.js').then((m) => ({ default: m.ReviewScreen })))
const SavingsScreen = lazy(() => import('./screens/SavingsScreen.js').then((m) => ({ default: m.SavingsScreen })))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen.js').then((m) => ({ default: m.SettingsScreen })))
const SetupScreen = lazy(() => import('./screens/SetupScreen.js').then((m) => ({ default: m.SetupScreen })))
const WeekScreen = lazy(() => import('./screens/WeekScreen.js').then((m) => ({ default: m.WeekScreen })))
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

/** Wide screens have room for Paycheck, the Bill calendar, Year, Savings, Debts and Setup on the bar itself (§6.1). */
const DESKTOP_TABS: readonly Tab[] = [
  { screen: 'month', label: 'Month', icon: 'calendar' },
  { screen: 'week', label: 'Week', icon: 'week' },
  { screen: 'paycheck', label: 'Paycheck', icon: 'wallet' },
  // Not "Bills": that is a list and a Month block; this is the Bill calendar.
  { screen: 'calendar', label: 'Calendar', icon: 'bills' },
  { screen: 'year', label: 'Year', icon: 'year' },
  { screen: 'savings', label: 'Savings', icon: 'piggy' },
  { screen: 'debts', label: 'Debts', icon: 'card' },
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
  const { screen, param } = useAddress()
  const { pendingTotal, loadError, status, refresh } = useAppData()
  // Month, Week, Paycheck and Year widen on a desktop to take the workbook's four
  // columns (§6.3, §6.4), and the Bill Calendar to give its seven room for names.
  const wide = screen === 'month' || screen === 'week' || screen === 'paycheck' || screen === 'year' || screen === 'calendar'
  const width = wide ? 'max-w-3xl lg:max-w-7xl' : 'max-w-3xl'
  const main = useRef<HTMLElement>(null)
  useAnnounceScreen(screen, main)

  return (
    <AnnounceProvider>
      <div className="min-h-full">
        {/* Past the eleven tabs of the desktop bar, in one key (FE-10). Focus
          is moved by hand: following the link would set the address to
          #main, which the app reads as a request for the Month. */}
        <a
          href="#main"
          onClick={(e) => {
            e.preventDefault()
            main.current?.focus()
          }}
          className="sr-only rounded-md bg-primary text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-30 focus:px-4 focus:py-3"
        >
          Skip to content
        </a>
        <header className="safe-top sticky top-0 z-20 hidden border-b bg-background/85 backdrop-blur md:block">
          {/* The bar takes the wide width on every screen: a narrow screen's
            768 held nine tabs' words only by running past its edge. */}
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 lg:max-w-7xl">
            <span className="font-semibold tracking-tight">Budget</span>
            <nav aria-label="Screens" className="flex gap-1">
              {DESKTOP_TABS.map((t) => {
                const active = tabOf(screen, DESKTOP_TABS) === t.screen
                return (
                  <a
                    key={t.screen}
                    href={hashOf({ screen: t.screen, param: null })}
                    aria-current={active ? 'page' : undefined}
                    aria-label={labelOf(t, pendingTotal)}
                    className={cn(
                      'relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium transition-colors',
                      'xl:flex-row xl:gap-2 xl:px-3 xl:text-sm',
                      active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon name={t.icon} className="size-4" />
                    {/* A tablet's 768 once showed the icons alone, 40x28 and
                      unnamed to the eye (FE-1). Each keeps its word now, small
                      and under its icon, as the phone's bar has it, 44px tall;
                      from 1280px there is room to set them beside the icons. */}
                    <span>{t.label}</span>
                    {t.screen === 'review' && pendingTotal > 0 ? (
                      <span className="absolute -right-1 top-0 xl:static">
                        <Count n={pendingTotal} />
                      </span>
                    ) : null}
                  </a>
                )
              })}
            </nav>
          </div>
        </header>

        <main ref={main} id="main" tabIndex={-1} className={cn('pt-screen pb-safe mx-auto w-full px-4 outline-none md:pb-12', width)}>
          {loadError !== null ? (
            <div className="mb-4 space-y-2">
              <Alert tone="error" title="Could not load your data">
                {loadError}
              </Alert>
              <Button variant="outline" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          ) : null}
          {/* No screen until the shared data is read: before then an empty
            list means "not read yet", and screens showed it as "none" (FE-7). */}
          {status === 'loading' ? (
            <p role="status" aria-busy="true" aria-label="Loading your budget" className="py-16 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : null}
          {status !== 'ready' ? null : <Screens screen={screen} param={param} />}
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
                <a
                  key={t.screen}
                  href={hashOf({ screen: t.screen, param: null })}
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
                </a>
              )
            })}
          </div>
        </nav>
      </div>
    </AnnounceProvider>
  )
}

/** The screen the address names, each but the Month fetched on first use. */
function Screens({ screen, param }: { screen: Screen; param: string | null }) {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}>
      {screen === 'month' ? <MonthScreen month={param} /> : null}
      {screen === 'week' ? <WeekScreen monday={param} /> : null}
      {screen === 'paycheck' ? <PaycheckScreen day={param} /> : null}
      {screen === 'calendar' ? <CalendarScreen month={param} /> : null}
      {screen === 'review' ? <ReviewScreen /> : null}
      {screen === 'add' ? <AddScreen /> : null}
      {screen === 'more' ? <MoreScreen /> : null}
      {screen === 'ledger' ? <LedgerScreen /> : null}
      {screen === 'settings' ? <SettingsScreen /> : null}
      {screen === 'setup' ? <SetupScreen /> : null}
      {screen === 'savings' ? <SavingsScreen /> : null}
      {screen === 'debts' ? <DebtsScreen /> : null}
      {screen === 'year' ? <YearScreen start={param} /> : null}
      {screen === 'coach' && param === null ? <CoachScreen /> : null}
      {/* The check-in arrives with A20; its address already reads. */}
      {screen === 'coach' && param !== null ? <NotYet name="The Sunday check-in" /> : null}
      {NOT_YET.has(screen) ? <NotYet name={SCREEN_NAME[screen]} /> : null}
    </Suspense>
  )
}

/** Each screen's name, as its tab or More names it. */
const SCREEN_NAME: Record<Screen, string> = {
  month: 'Month',
  week: 'Week',
  review: 'Review',
  add: 'Add',
  more: 'More',
  ledger: 'All transactions',
  settings: 'Settings',
  setup: 'Setup',
  year: 'Year',
  paycheck: 'Paycheck',
  calendar: 'Bill calendar',
  savings: 'Savings',
  debts: 'Debts',
  coach: 'Coach',
  forecast: 'Forecast',
  reports: 'Reports',
  ask: 'Ask',
  help: 'Help',
  start: 'Getting started',
  ai: 'AI settings',
}

/**
 * Screens whose address already reads (ADR 0006) but whose slice has not
 * landed. Each slice takes its screen out of this set as it adds it, and the
 * bars and More leave these out, so only a typed or kept address reaches one.
 */
const NOT_YET: ReadonlySet<Screen> = new Set(['forecast', 'reports', 'ask', 'help', 'start', 'ai'])

/** One line, and the way back, for an address that is ahead of the app. */
function NotYet({ name }: { name: string }) {
  return (
    <div className="space-y-3 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      <p className="text-muted-foreground">{name} is on its way. Everything else works as before.</p>
      <a href={hashOf({ screen: 'month', param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
        Open the Month
      </a>
    </div>
  )
}

/**
 * A screen changed only its hash, so the page kept the title "Budget" and
 * focus stayed on the tab pressed: a screen reader said nothing had
 * happened (FE-13). The title now names the screen, and choosing another
 * screen moves focus to it, where a screen reader starts reading. Opening
 * the app, and stepping a month on the same screen, leave focus alone.
 */
function useAnnounceScreen(screen: Screen, main: { readonly current: HTMLElement | null }): void {
  const shown = useRef<Screen | null>(null)
  useEffect(() => {
    document.title = `${SCREEN_NAME[screen]} · Budget`
    if (shown.current !== null && shown.current !== screen) {
      // The tabs are links now (FE-20), so the scroll navigate() gave them
      // happens here, for however the screen was reached.
      window.scrollTo({ top: 0 })
      main.current?.focus({ preventScroll: true })
    }
    shown.current = screen
  }, [screen, main])
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
