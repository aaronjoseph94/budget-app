# 05 — The bug bash after the rework

2026-10-08. After the copy rewrite and the browser suite (`04-e2e.md`)
met on `main-tnlcto`. By script, no AI model: exact checks, so a run
can be repeated and its numbers compared.

## What ran

Every screen at 320, 390, 768 and 1440 px wide, light and dark, in
Chromium and in WebKit (the engine an iPhone draws with): 196 views an
engine, on the suite's app (`apps/web/e2e`, the fake Supabase). Under
768 the browser is a phone: touch, mobile viewport. On each view:

- **Layout:** no sideways scroll, nothing past the right edge, nothing
  under the sidebar, one h1, the tab's title naming the screen.
- **Phone:** every control at least 44 px tall; no field under 16 px
  text, which iOS zooms into.
- **axe-core**, in the scheme drawn: WCAG 2.2 A and AA, best practices.
- **Dark:** the page's own `color-scheme`.
- **Keyboard:** Tab through the page. Every stop visible, ringed, on
  screen, not under the tab bar, not stuck; two controls with one name
  are listed. Each tablist answers the arrows, a switch answers Space, a
  dialog opener's dialog takes focus, closes on Escape and gives focus
  back.
- **Errors** the page raised.

Then 21 keyboard flows an engine at 390 and 1440: the skip link, ⌘K or
Ctrl+K, the sidebar folding, approving in Review, typing a charge on
Add, a goal's sheet, Help's search and its sheet, a debt's Edit sheet,
a budget on a Month row, and Use AI by Space.

The scripts live in the session's scratch folder (`bash2/bash.mjs`,
`flows.mjs`); what they found that a browser alone can show is now in
the suite.

## Found and fixed

| What | Where | Fix | Proof |
| --- | --- | --- | --- |
| The page scrolled sideways at 320: "saved of $30,000.00" could not break beside the ring | Coach, WebKit, light and dark | It wraps between words | `coach-screen.test.tsx`; `screens.e2e.ts` opens every screen at 320, which failed on both targets before (382 wide in 320) |
| Dark mode left the browser's own parts light: scrollbars, checkboxes, a date field's icon, a select's list | Every screen, both engines | `color-scheme: light dark` on the root, once; Lists' one patched field loses its patch | `contrast.test.ts` |
| Four buttons named just "Edit" | Debts | Each is "Edit <debt>" to assistive tech; the word on it stays Edit | `debts-edit.test.tsx` |
| "Type this month's starting balance to see where you'll end." three times, and a fourth way, under a lede saying it already | Forecast, no start typed | Said once, in Safe to spend with its link; End of the month says "Needs this month's starting balance." | `forecast-screen.test.tsx`, `forecast-ahead.test.tsx` |

## Looked wrong, was not

- **Let AI apps connect stays off on Space.** Switching on first checks
  `/auth/v1/settings`, which the fake does not answer. The app says it
  could not check, as it should. WebKit's console line for that refused
  fetch is the same thing.
- **Ctrl+K did nothing in WebKit.** Playwright's WebKit says it is a
  Mac, where the app takes ⌘K and leaves Ctrl+K to text fields
  (`App.tsx`). ⌘K works.
- **"Month", "Add", "Settings" twice on a screen.** The sidebar or tab
  bar and the period switch or top bar: one name, one destination.
- **Tables that scroll in their own box** on a phone (Forecast's next
  three months, Reports): by design, each a named, focusable group.

Nothing else: no axe finding in either scheme, no small target, no
zooming field, no unringed or hidden focus stop, no page error.

## Left

- **N174:** the same bare name on every card's action (Savings, Review,
  Coach, AI keys, the Month's "Show 3 empty"), the pattern Debts had.
- The suite still cannot set dark mode or touch (`04-e2e.md`); this
  bash's scripts did, and a rerun of them is the check until it can.
