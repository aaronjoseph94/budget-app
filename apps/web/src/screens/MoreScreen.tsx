import { Suspense, lazy } from 'react'
import { hashOf, isBuilt, type Screen } from '../nav.js'
import { Icon, type IconName } from '../components/ui/icons.js'
import { HelpButton } from '../help/HelpButton.js'

// Getting started's count reads nine answers; fetched only when More opens.
const ProgressLine = lazy(() => import('../start/ProgressLine.js').then((m) => ({ default: m.ProgressLine })))

interface Item {
  readonly screen: Screen
  readonly label: string
  readonly hint: string
  readonly icon: IconName
}

/**
 * What the bars have no room for, in four groups by what the owner wants to
 * do (ADR 0006). A screen not built yet keeps its place here and shows when
 * it lands; a group with nothing built yet is left out.
 */
export const MORE_GROUPS: readonly { readonly title: string; readonly items: readonly Item[] }[] = [
  {
    title: 'Plan',
    items: [
      { screen: 'paycheck', label: 'Paycheck', hint: 'Your budget one pay period at a time', icon: 'wallet' },
      { screen: 'calendar', label: 'Bill calendar', hint: 'What is due each day of the month, and paydays', icon: 'bills' },
      { screen: 'year', label: 'Year', hint: 'Twelve months at a glance, from any month', icon: 'year' },
      { screen: 'savings', label: 'Savings', hint: 'Each fund, what it needs, and what to save a month', icon: 'piggy' },
      { screen: 'debts', label: 'Debts', hint: 'Each loan and card balance, and when it is paid off', icon: 'card' },
      { screen: 'forecast', label: 'Forecast', hint: 'Where this month is heading, and safe to spend', icon: 'trend' },
    ],
  },
  {
    title: 'Understand',
    items: [
      { screen: 'reports', label: 'Reports', hint: 'The month in review, trends and shops', icon: 'report' },
      { screen: 'ask', label: 'Ask', hint: 'A question about your money, in your own words', icon: 'sparkles' },
    ],
  },
  {
    title: 'Set up and help',
    items: [
      { screen: 'start', label: 'Getting started', hint: 'One step at a time', icon: 'check' },
      { screen: 'setup', label: 'Setup', hint: 'Your name, and your lists', icon: 'list' },
      { screen: 'ai', label: 'AI settings', hint: 'Turn on free AI, and choose services', icon: 'sparkles' },
      { screen: 'settings', label: 'Settings', hint: 'Weekly budgets, your goal, signing out', icon: 'settings' },
      { screen: 'help', label: 'Help', hint: 'How each screen works, and what to do next', icon: 'help' },
    ],
  },
  {
    title: 'Records',
    items: [{ screen: 'ledger', label: 'All transactions', hint: 'Every approved charge and payment', icon: 'file' }],
  },
]

export function MoreScreen() {
  const groups = MORE_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => isBuilt(i.screen)) })).filter((g) => g.items.length > 0)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">More</h1>
        <HelpButton screen="more" />
      </div>
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={idOf(group.title)} className="space-y-2">
          <h2 id={idOf(group.title)} className="px-1 text-sm font-medium text-muted-foreground">
            {group.title}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
            {group.items.map((item) => (
              <li key={item.screen}>
                {/* A link to the screen's address, so it can open in a new tab (FE-20). */}
                <a
                  href={hashOf({ screen: item.screen, param: null })}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent"
                >
                  <Icon name={item.icon} className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.label}</span>
                    <span className="block text-sm text-muted-foreground">
                      {item.screen === 'start' ? (
                        <Suspense fallback={item.hint}>
                          <ProgressLine fallback={item.hint} />
                        </Suspense>
                      ) : (
                        item.hint
                      )}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** "Set up and help" as an id: a space would split aria-labelledby into three. */
function idOf(title: string): string {
  return `more-${title.toLowerCase().replaceAll(' ', '-')}`
}
