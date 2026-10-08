import { AiSettingsScreen } from '../screens/AiSettingsScreen.js'

/**
 * Settings' AI tab: what AI settings drew as a screen of its own, as it
 * stands (ADR 0014 §2). Its file belongs to the other tree until the two
 * merge, so it still draws its own title row and its "← Settings" link;
 * under Settings' own title those two are hidden by their place in its
 * tree rather than edited out: its first link, and the row holding its
 * h1. Once it stops drawing them, nothing here matches and this is a
 * pass-through to delete.
 */
export function AiTab() {
  return (
    <div className="[&>div>a:first-child]:hidden [&>div>div:has(>h1)]:hidden">
      <AiSettingsScreen />
    </div>
  )
}
