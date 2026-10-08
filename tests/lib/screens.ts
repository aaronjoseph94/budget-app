/**
 * Every screen, at an explicit address, with the name its tab's title
 * carries (shell/places.ts). A period is named in the address, so no
 * test here depends on today; Paycheck takes a day of the seeded pay
 * schedule. `h1` is given only where the address itself fixes it.
 */
export const SCREENS: readonly { readonly path: string; readonly name: string; readonly h1?: string }[] = [
  { path: '/#/month/2026-09', name: 'Month', h1: 'September 2026' },
  { path: '/#/week/2026-09-21', name: 'Week' },
  { path: '/#/year/2026-01', name: 'Year' },
  { path: '/#/paycheck/2026-09-11', name: 'Paycheck' },
  { path: '/#/calendar/2026-09', name: 'Bill calendar', h1: 'September 2026' },
  { path: '/#/review', name: 'Review' },
  { path: '/#/add', name: 'Add' },
  { path: '/#/more', name: 'More' },
  { path: '/#/ledger', name: 'All transactions' },
  { path: '/#/settings/lists', name: 'Settings' },
  { path: '/#/settings/budgets', name: 'Settings' },
  { path: '/#/settings/ai', name: 'Settings' },
  { path: '/#/settings/account', name: 'Settings' },
  { path: '/#/savings', name: 'Savings' },
  { path: '/#/debts', name: 'Debts' },
  { path: '/#/coach', name: 'Coach' },
  { path: '/#/coach/checkin', name: 'Coach' },
  { path: '/#/forecast', name: 'Forecast' },
  { path: '/#/reports/2026-09', name: 'Reports' },
  { path: '/#/ask', name: 'Ask' },
  { path: '/#/help', name: 'Help' },
  { path: '/#/start', name: 'Getting started' },
]
