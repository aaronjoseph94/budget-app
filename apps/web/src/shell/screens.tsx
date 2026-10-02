import type { ReactNode } from 'react'
import { lazyPart } from '../lib/lazy-part.js'
import type { Screen } from '../nav.js'
import { HELP_TOPICS } from '../help/topics.js'
import { MonthScreen } from '../screens/MonthScreen.js'
import { MoreScreen } from '../screens/MoreScreen.js'

// Each screen but the Month (and More, a list of links) is its own chunk,
// fetched the first time it opens. The Month opens first (decision 1), and
// it waited for every other screen's code: 214 KB gzipped, most of it
// unused on the Month (PERF-3). Add carries the statement readers with it.
const AiSettingsScreen = lazyPart(() => import('../screens/AiSettingsScreen.js').then((m) => ({ default: m.AiSettingsScreen })))
const AskScreen = lazyPart(() => import('../screens/AskScreen.js').then((m) => ({ default: m.AskScreen })))
const AddScreen = lazyPart(() => import('../screens/AddScreen.js').then((m) => ({ default: m.AddScreen })))
const CalendarScreen = lazyPart(() => import('../screens/CalendarScreen.js').then((m) => ({ default: m.CalendarScreen })))
const CoachScreen = lazyPart(() => import('../screens/CoachScreen.js').then((m) => ({ default: m.CoachScreen })))
const CheckinScreen = lazyPart(() => import('../screens/CheckinScreen.js').then((m) => ({ default: m.CheckinScreen })))
const DebtsScreen = lazyPart(() => import('../screens/DebtsScreen.js').then((m) => ({ default: m.DebtsScreen })))
const GettingStartedScreen = lazyPart(() => import('../screens/GettingStartedScreen.js').then((m) => ({ default: m.GettingStartedScreen })))
const ForecastScreen = lazyPart(() => import('../screens/ForecastScreen.js').then((m) => ({ default: m.ForecastScreen })))
const HelpScreen = lazyPart(() => import('../screens/HelpScreen.js').then((m) => ({ default: m.HelpScreen })))
const LedgerScreen = lazyPart(() => import('../screens/LedgerScreen.js').then((m) => ({ default: m.LedgerScreen })))
const PaycheckScreen = lazyPart(() => import('../screens/PaycheckScreen.js').then((m) => ({ default: m.PaycheckScreen })))
const ReportsScreen = lazyPart(() => import('../screens/ReportsScreen.js').then((m) => ({ default: m.ReportsScreen })))
const ReviewScreen = lazyPart(() => import('../screens/ReviewScreen.js').then((m) => ({ default: m.ReviewScreen })))
const SavingsScreen = lazyPart(() => import('../screens/SavingsScreen.js').then((m) => ({ default: m.SavingsScreen })))
const SettingsScreen = lazyPart(() => import('../screens/SettingsScreen.js').then((m) => ({ default: m.SettingsScreen })))
const SetupScreen = lazyPart(() => import('../screens/SetupScreen.js').then((m) => ({ default: m.SetupScreen })))
const WeekScreen = lazyPart(() => import('../screens/WeekScreen.js').then((m) => ({ default: m.WeekScreen })))
const YearScreen = lazyPart(() => import('../screens/YearScreen.js').then((m) => ({ default: m.YearScreen })))

export interface View {
  /** Whether the screen widens on a desktop, for this param. */
  readonly wide: (param: string | null) => boolean
  readonly render: (param: string | null) => ReactNode
}

const always = () => true
const never = () => false

/**
 * What each screen draws and how wide it stands, one entry per screen.
 * The mapped type makes a screen added to nav.ts's SCREENS without an
 * entry here a type error; it used to compile and draw an empty page
 * (architecture-b-11). Month, Week, Paycheck and Year widen on a desktop
 * to take the workbook's four columns (§6.3, §6.4), the Bill Calendar to
 * give its seven room for names, the Coach for its insights and goal side
 * by side (Mockup A step 7), the Forecast and Reports for their sections
 * two across (step 8), Savings and Debts for their cards three across
 * (step 9), Setup, Settings and AI settings for their cards in columns
 * (step 11), a Help article for the list beside it and Getting started for
 * its steps beside the step (step 12).
 */
export const VIEWS: { readonly [S in Screen]: View } = {
  month: { wide: always, render: (param) => <MonthScreen month={param} /> },
  week: { wide: always, render: (param) => <WeekScreen monday={param} /> },
  paycheck: { wide: always, render: (param) => <PaycheckScreen day={param} /> },
  calendar: { wide: always, render: (param) => <CalendarScreen month={param} /> },
  review: { wide: never, render: () => <ReviewScreen /> },
  add: { wide: never, render: () => <AddScreen /> },
  more: { wide: never, render: () => <MoreScreen /> },
  ledger: { wide: never, render: () => <LedgerScreen /> },
  settings: { wide: always, render: () => <SettingsScreen /> },
  setup: { wide: always, render: () => <SetupScreen /> },
  savings: { wide: always, render: () => <SavingsScreen /> },
  debts: { wide: always, render: () => <DebtsScreen /> },
  year: { wide: always, render: (param) => <YearScreen start={param} /> },
  help: { wide: (param) => param !== null, render: (param) => <HelpScreen topic={param} /> },
  ai: { wide: always, render: () => <AiSettingsScreen /> },
  start: { wide: always, render: () => <GettingStartedScreen /> },
  forecast: { wide: always, render: () => <ForecastScreen /> },
  reports: { wide: always, render: (param) => <ReportsScreen month={param} /> },
  // nav.ts reads Ask's param only as a committed Help topic.
  ask: { wide: never, render: (param) => <AskScreen topic={HELP_TOPICS.find((t) => t === param) ?? null} /> },
  // nav.ts reads no param on the Coach but `checkin`.
  coach: { wide: (param) => param === null, render: (param) => (param === 'checkin' ? <CheckinScreen /> : <CoachScreen />) },
}
