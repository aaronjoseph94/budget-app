/**
 * Settings' four tabs (ADR 0014 §2), in the order the bar shows them. The
 * tab showing is in the address, `#/settings/lists`, so a refresh and the
 * back gesture land on it; a bare `#/settings` opens the last one chosen
 * on this device, as Reports does. Only ids here are read from an address.
 */
export const SETTINGS_TABS = ['lists', 'budgets', 'ai', 'account'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export const SETTINGS_TAB_NAME: Readonly<Record<SettingsTab, string>> = {
  lists: 'Lists',
  budgets: 'Budgets & goals',
  ai: 'AI',
  account: 'Account',
}

export function isSettingsTab(text: string): text is SettingsTab {
  return SETTINGS_TABS.some((t) => t === text)
}

const TAB_KEY = 'budget.settings.tab'

/** The last tab chosen on this device, or Lists; a storage that throws opens Lists. */
export function rememberedSettingsTab(): SettingsTab {
  try {
    const kept = localStorage.getItem(TAB_KEY)
    return kept !== null && isSettingsTab(kept) ? kept : 'lists'
  } catch {
    return 'lists'
  }
}

export function rememberSettingsTab(tab: SettingsTab): void {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    // Not kept on this device; the address still names the tab.
  }
}
