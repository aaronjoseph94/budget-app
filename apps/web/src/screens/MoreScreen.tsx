import { hashOf, type Screen } from '../nav.js'
import { Icon, type IconName } from '../components/ui/icons.js'

/** What the phone's bottom bar has no room for (plan §6.1). */
const ITEMS: readonly { screen: Screen; label: string; hint: string; icon: IconName }[] = [
  { screen: 'paycheck', label: 'Paycheck', hint: 'Your budget one pay period at a time', icon: 'wallet' },
  { screen: 'calendar', label: 'Bill calendar', hint: 'What is due each day of the month, and paydays', icon: 'bills' },
  { screen: 'year', label: 'Year', hint: 'Twelve months at a glance, from any month', icon: 'year' },
  { screen: 'savings', label: 'Savings', hint: 'Each fund, what it needs, and what to save a month', icon: 'piggy' },
  { screen: 'debts', label: 'Debts', hint: 'Each loan and card balance, and when it is paid off', icon: 'card' },
  { screen: 'setup', label: 'Setup', hint: 'Your name, and your lists', icon: 'list' },
  { screen: 'ledger', label: 'All transactions', hint: 'Every approved charge and payment', icon: 'file' },
  { screen: 'settings', label: 'Settings', hint: 'Weekly budgets, your goal, signing out', icon: 'settings' },
]

export function MoreScreen() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">More</h1>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
        {ITEMS.map((item) => (
          <li key={item.screen}>
            {/* A link to the screen's address, so it can open in a new tab (FE-20). */}
            <a
              href={hashOf({ screen: item.screen, period: null })}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent"
            >
              <Icon name={item.icon} className="size-5 text-muted-foreground" />
              <span className="flex-1">
                <span className="block font-medium">{item.label}</span>
                <span className="block text-sm text-muted-foreground">{item.hint}</span>
              </span>
              <Icon name="chevronRight" className="size-4 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
