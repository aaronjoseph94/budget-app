/**
 * Settings' four tabs (ADR 0014 §2), in the order the bar shows them. The
 * tab showing is in the address, `#/settings/lists`, so a refresh and the
 * back gesture land on it. Only ids here are read from an address.
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
