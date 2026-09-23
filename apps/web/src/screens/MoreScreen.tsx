import { navigate, type Screen } from '../nav.js'
import { Icon, type IconName } from '../components/ui/icons.js'

/**
 * What the phone's bottom bar has no room for (plan §6.1). Savings and Debts
 * join this list as they are built.
 */
const ITEMS: readonly { screen: Screen; label: string; hint: string; icon: IconName }[] = [
  { screen: 'year', label: 'Year', hint: 'Twelve months at a glance, from any month', icon: 'calendar' },
  { screen: 'setup', label: 'Setup', hint: "Your name, and Workbook's lists", icon: 'list' },
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
            <button
              type="button"
              onClick={() => navigate(item.screen)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent"
            >
              <Icon name={item.icon} className="size-5 text-muted-foreground" />
              <span className="flex-1">
                <span className="block font-medium">{item.label}</span>
                <span className="block text-sm text-muted-foreground">{item.hint}</span>
              </span>
              <Icon name="chevronRight" className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
