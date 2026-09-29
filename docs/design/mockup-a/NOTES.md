# Mockup A — build notes

Decisions made while building the README's steps, each the engineer's
under the owner's 2026-09-29 instruction (ADR 0010). Larger ones are ADRs.

## 2026-09-29 — Step 1, tokens

- **Token names kept, values changed** (ADR 0010), so screens no step has
  reached yet follow the new palette. New names: `canvas`,
  `canvas-muted`, `primary-soft`, `primary-tint`, `track`,
  `destructive-foreground`, the `bills`, `subscriptions` and `debts` sets,
  a `-tile` for every list, `variable-large`, and the `waiting` set.
- **Radii** map onto the classes screens already use: `rounded-xl` 16
  (cards), `rounded-lg` 12 (tiles), `rounded-md` 10 (buttons, fields).
- **The page is white on a phone.** Mockup A's muted grey reads 4.40:1 on
  its canvas, so the canvas is only the frame around the panel, from
  768px; on a phone the screen is the panel.
- **`owed` is grey** until the Month and Year move bills, subscriptions and
  debts to their own hues (steps 3 and 5).
- **Serif italic titles stay for now.** Setup, Savings, Debts and the Year
  set their titles in `font-serif italic`, the workbook's look but not
  one of the two retired font files. Each goes with its screen's step
  (11, 9, 9, 5).
- **Card shadows stay for now.** Mockup A has none; `Card` keeps shadcn's
  `shadow-sm` until the steps restyle the screens that use it.

## 2026-09-29 — Step 2, navigation

See ADR 0011: the sidebar, the rail, the disclosure groups (the review's
first fix, not the user menu), the breadcrumb's parents, the grey icons
and the amber Review count.

- **Copy.** The sidebar and top bar use the app's own names for every
  screen. "Search or jump to…", "⌘K" and "Toggle sidebar" are the
  mockup's, new to the app, and needed for the controls the README asks
  for.

## 2026-09-29 — Step 3, the Month

- **Stat cards in the review's order** (P1 item 3): Left to spend, End of
  month, Start, Spent, with the forecast line on End of month's card.
  Left to spend is the one hero with a gradient, to the accent's tint;
  the others are white with a tinted tile (P2 item 6).
- **The tiles take the accent, not the mockup's green, rose and sky.** A
  hue names a list (ADR 0010), as the sidebar's icons are grey for the
  same reason (ADR 0011). The hero's words take `canvas-muted`: #6b7280
  reads 4.27 on the tint where the gradient ends.
- **The hint lines under the cards are left out:** "Bills,
  subscriptions, debts and variable", "Start, plus income, less spending
  and savings", "Starting bank balance" and "$X of $Y on Variable
  expenses". The review offers adding or dropping them and asks for
  neither, so the app keeps its own words. With the last line gone, the
  hero's bar goes too, since a bar with no words says nothing to check.
  The app's own hint ("No budgets on Variable expenses yet.") stays.
- **The ‹ Sep 2026 › stepper.** The middle of the stepper is a
  label, not a button; the Bill calendar keeps its own button beside it,
  so its name matches what it shows.
- **No % pill on the lists** (N125, a blocker): no engine output gives it.
  The bars are drawn: each is core's `goalBars` over one Actual and its
  budget, which the screen turns into a width.
- **Mini bars on Variable and Income only** (P1 item 5), rose where core's
  Left is below zero.
- **One pen** (P1 item 5) was already the app's rule; Help's Month article
  now says it.
- **Charts** (N124, in part): the donut's six hues by the row's place on
  its list, repeating after six, and Income in green, in the SVG itself.
  The mockup's "September 2026" line under each chart title is left out,
  as the page's title already says it.
- **The "Review ›" on the waiting banner** is hidden from a screen reader
  (the banner's name already says Review) and below 480 px, where it
  squeezed the sentence to three words a line.
- **Layout:** two across from 768 px; from 1280 px the lists two across
  and the charts in a right column (17rem, 20rem from 1400 px, where the
  pill and the table's side padding also grow back to the mockup's).

## 2026-09-29 — Step 3, the review

- **The Views switch takes the arrow keys** (design review,
  Accessibility), wrapping, with Home and End. It stays four links in the
  tab order rather than becoming a tab list with one stop: it navigates
  to another screen, and a link says so to a screen reader.
- **Four across keeps the small table.** The Week's and Paycheck's cards
  lie four across from 1280 px, so they keep the workbook's smaller
  table type and none of the Month's 1400 px edges (`fourAcross`).
- **Beside the rail, 768 to 1023 px, the Month's table head is 13 px** and
  the overspent pill keeps 6 px sides below 1400 px, so the Variable card
  holds its columns with several rows over budget.
