/**
 * Which Reports tab opens: the last one chosen, on this device only. A
 * convenience, so a storage that throws opens the Overview. The Coach's
 * shop cards choose Shops before opening Reports (plan A17).
 */
export type ReportTab = 'overview' | 'trends' | 'shops'

const TAB_KEY = 'budget.reports.tab'

export function rememberedTab(): ReportTab {
  try {
    const kept = localStorage.getItem(TAB_KEY)
    return kept === 'trends' || kept === 'shops' ? kept : 'overview'
  } catch {
    return 'overview'
  }
}

export function rememberTab(tab: ReportTab): void {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    // Not kept on this device; the tab still changes.
  }
}
