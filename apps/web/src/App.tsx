import { Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { readEnv } from './env.js'
import { createSupabase } from './supabase.js'
import { NotConfigured, SignIn, useSession } from './auth.js'
import { AppDataProvider, useAppData } from './app-data.js'
import { HOME, hashOf, isBuilt, navigate, useAddress, type Screen } from './nav.js'
import { HELP_TOPICS } from './help/topics.js'
import { MonthScreen } from './screens/MonthScreen.js'
import { MoreScreen } from './screens/MoreScreen.js'
import { displayNameOf, setupMarksOf } from './profile.js'
import { Alert } from './components/ui/feedback.js'
import { Button } from './components/ui/button.js'
import { AnnounceProvider } from './components/ui/announce.js'
import { Icon, type IconName } from './components/ui/icons.js'
import { cn } from './lib/cn.js'
import { todayIso } from './format.js'
import { checkinDue } from './coach/checkin-seen.js'
import { OfflineBanner } from './offline.js'

// Each screen but the Month (and More, a list of links) is its own chunk,
// fetched the first time it opens. The Month opens first (decision 1), and
// it waited for every other screen's code: 214 KB gzipped, most of it
// unused on the Month (PERF-3). Add carries the statement readers with it.
const AiSettingsScreen = lazy(() => import('./screens/AiSettingsScreen.js').then((m) => ({ default: m.AiSettingsScreen })))
const AskScreen = lazy(() => import('./screens/AskScreen.js').then((m) => ({ default: m.AskScreen })))
const AddScreen = lazy(() => import('./screens/AddScreen.js').then((m) => ({ default: m.AddScreen })))
const CalendarScreen = lazy(() => import('./screens/CalendarScreen.js').then((m) => ({ default: m.CalendarScreen })))
const CoachScreen = lazy(() => import('./screens/CoachScreen.js').then((m) => ({ default: m.CoachScreen })))
const CheckinScreen = lazy(() => import('./screens/CheckinScreen.js').then((m) => ({ default: m.CheckinScreen })))
const DebtsScreen = lazy(() => import('./screens/DebtsScreen.js').then((m) => ({ default: m.DebtsScreen })))
const GettingStartedScreen = lazy(() => import('./screens/GettingStartedScreen.js').then((m) => ({ default: m.GettingStartedScreen })))
const ForecastScreen = lazy(() => import('./screens/ForecastScreen.js').then((m) => ({ default: m.ForecastScreen })))
const HelpScreen = lazy(() => import('./screens/HelpScreen.js').then((m) => ({ default: m.HelpScreen })))
const LedgerScreen = lazy(() => import('./screens/LedgerScreen.js').then((m) => ({ default: m.LedgerScreen })))
const PaycheckScreen = lazy(() => import('./screens/PaycheckScreen.js').then((m) => ({ default: m.PaycheckScreen })))
const ReportsScreen = lazy(() => import('./screens/ReportsScreen.js').then((m) => ({ default: m.ReportsScreen })))
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
      setupMarks={setupMarksOf(session.session.user.user_metadata)}
    >
      <FirstRun />
      <Shell />
    </AppDataProvider>
  )
}

/**
 * The first sign-in opens Getting started (plan §8.1): a new account, read
 * with no category at all, opened at the Month with no address of its
 * own, and the guide never opened. Asked once, when the shared data is
 * first read; the guide marks itself opened, so later sign-ins open the
 * Month as before.
 */
export function FirstRun() {
  const { status, categories, setupMarks } = useAppData()
  const { screen, param } = useAddress()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current || status !== 'ready') return
    asked.current = true
    if (categories.length === 0 && !setupMarks.opened && screen === HOME && param === null) navigate('start')
  }, [status, categories.length, setupMarks.opened, screen, param])
  return null
}

/**
 * Phones: Month first, Add in the centre within thumb reach. The Coach has
 * the Week's old place; the Week is in the Month's switch (ADR 0006).
 */
const PHONE_TABS: readonly Tab[] = [
  { screen: 'month', label: 'Month', icon: 'calendar' },
  { screen: 'coach', label: 'Coach', icon: 'sparkles' },
  { screen: 'add', label: 'Add', icon: 'plus' },
  { screen: 'review', label: 'Review', icon: 'inbox' },
  { screen: 'more', label: 'More', icon: 'menu' },
]

/**
 * Wide screens: the Coach, Forecast and Reports beside the views. Paycheck
 * and Year are in the switch; the Bill calendar and Setup in More (ADR 0006).
 * A screen not built yet keeps its place here and shows when it lands.
 */
const DESKTOP_TABS: readonly Tab[] = (
  [
    { screen: 'month', label: 'Month', icon: 'calendar' },
    { screen: 'week', label: 'Week', icon: 'week' },
    { screen: 'coach', label: 'Coach', icon: 'sparkles' },
    { screen: 'forecast', label: 'Forecast', icon: 'trend' },
    { screen: 'reports', label: 'Reports', icon: 'report' },
    { screen: 'savings', label: 'Savings', icon: 'piggy' },
    { screen: 'debts', label: 'Debts', icon: 'card' },
    { screen: 'review', label: 'Review', icon: 'inbox' },
    { screen: 'add', label: 'Add', icon: 'plus' },
    { screen: 'more', label: 'More', icon: 'menu' },
  ] as const
).filter((t) => isBuilt(t.screen))

interface Tab {
  readonly screen: Screen
  readonly label: string
  readonly icon: IconName
}

/** The views reached from the Month's switch. */
const SWITCHED: ReadonlySet<Screen> = new Set(['week', 'paycheck', 'year'])

/**
 * The tab lit while a screen shows: its own; the Month for a view reached
 * through the Month's switch; More for everything reached through More.
 */
function tabOf(screen: Screen, tabs: readonly Tab[]): Screen {
  if (tabs.some((t) => t.screen === screen)) return screen
  return SWITCHED.has(screen) ? 'month' : 'more'
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
  // Read again on every move: opening the check-in marks it seen. Not on
  // the Coach itself, whose own card says the check-in is ready.
  const dot = useMemo(() => screen !== 'coach' && checkinDue(todayIso()), [screen, param])

  return (
    <AnnounceProvider>
      <div className="min-h-full">
        {/* Past the desktop bar's tabs, in one key (FE-10). Focus
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
        <header className="safe-top sticky top-0 z-20 hidden border-b bg-background/85 backdrop-blur md:block print:hidden">
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
                    aria-label={labelOf(t, pendingTotal, dot)}
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
                    {t.screen === 'coach' && dot ? <Dot className="absolute right-1 top-1 xl:static" /> : null}
                  </a>
                )
              })}
            </nav>
          </div>
        </header>

        {/* A 16 px gutter, 12 below 360 px (plan §9): at 320 the Month's
          tables were 18 px wider than their cards (N66). Every band that
          bleeds to the edge takes back the same (-mx-4, and -mx-3 there). */}
        <main ref={main} id="main" tabIndex={-1} className={cn('pt-screen pb-safe mx-auto w-full px-4 outline-none max-[359px]:px-3 md:pb-12', width)}>
          <OfflineBanner />
          {loadError !== null ? (
            <div className="mb-4 space-y-2">
              <Alert tone="error" title="Could not load your data">
                {loadError}
              </Alert>
              <div className="flex flex-wrap items-center gap-x-4">
                <Button variant="outline" onClick={() => void refresh()}>
                  Try again
                </Button>
                {screen === 'help' ? null : (
                  <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
                    Check the one-time updates
                  </a>
                )}
              </div>
            </div>
          ) : null}
          {/* No screen until the shared data is read: before then an empty
            list means "not read yet", and screens showed it as "none" (FE-7). */}
          {status === 'loading' ? (
            <p role="status" aria-busy="true" aria-label="Loading your budget" className="py-16 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : null}
          {/* Help needs none of it, and is where a missing one-time update is
            found, so it still opens when the first read failed. */}
          {status === 'ready' || (status === 'failed' && screen === 'help') ? <Screens screen={screen} param={param} /> : null}
        </main>

        {/* Phones: a bottom tab bar within thumb reach, clear of the home indicator. */}
        <nav
          aria-label="Screens"
          className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur md:hidden print:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-5">
            {PHONE_TABS.map((t) => {
              const active = tabOf(screen, PHONE_TABS) === t.screen
              return (
                <a
                  key={t.screen}
                  href={hashOf({ screen: t.screen, param: null })}
                  aria-current={active ? 'page' : undefined}
                  aria-label={labelOf(t, pendingTotal, dot)}
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
                  {t.screen === 'coach' && dot ? <Dot className="absolute right-[30%] top-2" /> : null}
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
      {screen === 'help' ? <HelpScreen topic={param} /> : null}
      {screen === 'ai' ? <AiSettingsScreen /> : null}
      {screen === 'start' ? <GettingStartedScreen /> : null}
      {screen === 'forecast' ? <ForecastScreen /> : null}
      {screen === 'reports' ? <ReportsScreen month={param} /> : null}
      {/* nav.ts reads Ask's param only as a committed Help topic. */}
      {screen === 'ask' ? <AskScreen topic={HELP_TOPICS.find((t) => t === param) ?? null} /> : null}
      {screen === 'coach' && param === null ? <CoachScreen /> : null}
      {/* nav.ts reads no other param on the Coach. */}
      {screen === 'coach' && param === 'checkin' ? <CheckinScreen /> : null}
      {isBuilt(screen) ? null : <NotYet name={SCREEN_NAME[screen]} />}
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

/** "Review, 3 waiting" to a screen reader, rather than the badge read as "Review3"; the Coach's dot as words. */
function labelOf(t: Tab, pendingTotal: number, dot: boolean): string {
  if (t.screen === 'coach' && dot) return `${t.label}, check-in ready`
  return t.screen === 'review' && pendingTotal > 0 ? `${t.label}, ${pendingTotal} waiting` : t.label
}

/** The Coach's dot: the Sunday check-in is ready (plan §2.1). Said in the tab's label, so hidden here. */
function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('size-2 rounded-full bg-primary', className)} />
}

function Count({ n }: { n: number }) {
  return (
    <span className="tnum rounded-full bg-spend px-1.5 text-[10px] font-semibold leading-4 text-spend-foreground">
      {n > 99 ? '99+' : n}
    </span>
  )
}
