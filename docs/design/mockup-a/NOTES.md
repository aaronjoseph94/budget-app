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
  budget, which the screen turns into a width. *(Since drawn: see the %
  pill below.)*
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

## 2026-09-29 — The % pill (N125)

- **The engine gives it** (F50): the orchestrator allowed this one engine
  slice ahead of step 4. `budgetUsedBp` is the list's Actual total over
  its budget total, the two figures the card head prints beside it.
- **Drawn as the mockup does:** a round pill after the name, in the list's
  tile colour with its ink (ADR 0010, measured ink on tile), 14px
  semibold, "116%". A screen reader hears "116% of the budget", or "of
  the goal" on Income and Savings.
- **No pill** with no budget or a $0 one, or when refunds took the Actual
  below zero (F50). The bar under it still shows 100% at most; the pill
  is where the overspending shows as a number.
- **Whole percentages,** by the app's one percentage helper, so 99.6%
  reads "100%" while the list is not yet over; the Left column and its
  rose pill say which rows are.
- **Amended by the owner's choice (N130, F51):** on Bills, Debts and
  Subscriptions a planned amount stands as a row's budget where none is
  typed, so the pill, "$X of $Y" and the bar are over the effective total,
  and the Budgeted cell shows the plan marked "planned", as the Actual
  column does. Bills paid as planned read about 100%, as the mockup draws.

## 2026-09-29 — Step 4, the Week and Paycheck

- **The title row, stepper and review line are the Month's,** shared, not
  copied (`StepButton`, `WaitingBanner`). The stepper's middle names the
  period's dates, as the mockup does, though the line under the title
  says them too.
- **Spent and Left to spend are the Month's stat cards** (`StatCard`):
  Left to spend the one hero with the accent's gradient, as on the Month,
  Spent white; tiles in the accent, not the mockup's rose and green, which
  name lists (ADR 0010). One across below 480 px, since Spent carries the
  comparison under it, as the mockup puts it.
- **Left to spend's bar and "$X of $Y in weekly budgets" are left out,**
  as on the Month: the words are not the app's, and no engine output
  gives the Actual of the budgeted rows alone.
- **The goal card is wide and tinted,** white to the accent's tint, with a
  ring drawn from `goalProgress`'s basis points and the percentage inside
  it; its muted words take `canvas-muted`, as on the Month's hero. The
  time line sits on the soft accent (`foreground` on `primary-soft`,
  added to the contrast test).
- **The lists lie two across in list order,** as the Month lays them and
  as the mockup draws the Period screen. The workbook's four-across order
  (Summary, Income, Savings, Bills … Variable last) retires with it, and
  so does the smaller table type it needed (N126).
- **Paycheck follows the Week:** the same title row and stat cards, and
  "How this period is counted" as the wide tinted card, its name now a
  visible heading (it was the card's name for a screen reader only), with
  "Pay periods from" beside it as the mockup draws it. The pay-period
  lavender (`paycheck-band`) leaves the screen; nothing else draws it, and
  its tokens are left for a clean-up of their own (N129).
- **With every caller in list order,** `PeriodBlocks` has one layout and
  `Block` one table type; `inListOrder` and `fourAcross` are removed.

## 2026-09-29 — Step 5, the Year

- **The title row is the Month's** (`MonthTitle`, the ? beside it, the
  twelve months under it); the slate band and its serif italic title go.
  "Planned bills count up to…" stays a line of its own under the row,
  where the mockup joins it to the dates with " · ": two sentences that
  each stand alone read better apart, and a phone wraps them anyway.
- **Starts in** is two 44px select pills on the right of the title row,
  still the native picker a phone shows as a wheel (`NativeSelect`, with
  the app's darker field edge, ADR 0010).
- **The review line is the amber `WaitingBanner`**, as on the Month and
  the Week (design-review P1 item 4), in the Year's own words. The mockup
  put it as a grey link inside the greeting card; one waiting colour won.
- **Glance cards** are Mockup A's: white, a 1px edge, 16px corners, no
  shadow, 15px muted names and 20px bold figures. The greeting is the one
  card tinted to the accent (P2 item 6). One across on a phone, two from
  640px, four from 1280px.
- **Left over and the balances stay in their own card** below 1280px and
  in the totals panel from 1280px, where the mockup puts them inside "vs
  last year". "vs last year" is left out altogether while its comparison
  loads or has nothing to compare yet, and it would take the balances
  with it.
- **The tables (P2 item 7):** chips choosing one table below 1280px, the
  charts beside it from 1024px as the mockup draws them; from 1280px all
  seven tables four across with the totals panel, as Annual lays them, so
  eight cards fill two rows. The 1280px test is `useFourAcross`; `useWide`
  stays 1024px for the sidebar. Four across, the tables keep 12px type
  until 1400px and 10px sides, so no month or figure wraps beside the
  sidebar at 1280px.
- **Each list's hue (ADR 0010):** Bills sky, Debts rose, Subscriptions
  violet, as on the Month. The mockup draws Debts violet and Expenses
  rose; **Expenses are the four lists added, no one list, so they take the
  neutral grey** (`owed`) in the table and the charts, never Debts' rose.
- **No striped rows**; this month's row is today's yellow and bold, as the
  mockup draws it. `year-row-alt` is now drawn by nothing (N129).
- **Charts (N124):** colours only, written into the file and repainted
  from the tokens in dark mode. The pie keeps its shape (the mockup draws
  a donut) and chart-specs' own legend; "Against goals and budgets" stays
  chart-specs' Goal-beside-Actual columns (grey Goal, accent Actual) where
  the mockup draws a bar per list in its hue, since a restyle changes
  chart-specs' colours only. The top 3 rings take the donut's first three
  chart hues by rank. Debts today moved to classes of its own
  (`chart-debts-*`) so the Debts screen's ring keeps its colours until
  step 9.
- **Copy left out:** the mockup's chart subtitles "Income in green,
  expenses in rose" and "Each list's actual against its goal or budget
  over the year" are not the app's; the charts keep their own keys.
- **No figure is missing.** Every figure the mockup shows is yearSheet's,
  periodComparison's, fund or debt status, or core's `partShares`,
  `stackedColumns`, `goalBars` and F18's `shareBp`, as before.

## 2026-09-29 — Step 6, the Bill calendar

- **The calendar's own tokens take Mockup A's values** (`calendar-*`):
  the sky tint #EFF6FF behind the weekday names and the month's pill,
  Bills' ink #0369A1 for their words and the week totals, bill names in
  the ink, and two new ones, `calendar-today` (the Year's yellow) and
  `calendar-off` (the hover grey on other months' days). Dark values are
  the mockup's too. Today's number, names and amounts on the tint are in
  the contrast test.
- **The title row is the Month's:** the ? beside the title, "Bill
  calendar" under it, and the pill and a "‹ Sep 2026 ›" stepper on the
  right (`StepButton`, shared). The mockup's line "Bill calendar · each
  bill on its day, paydays, and each week’s total" is not the app's
  copy, so the app keeps "Bill calendar" alone.
- **Each bill's rule is its list's hue** (ADR 0010): sky Bills, violet
  Subscriptions, rose Debts, in the grid and in the phone's agenda. The
  phone's dotted grid keeps one colour of dot, as its legend says "a bill
  due"; the agenda under it carries the hues.
- **The payday pill keeps its darker green** (#047857, white words, 5.5:1).
  The mockup's #10B981 with white reads 2.5:1.
- **Names wrap instead of being cut short.** The mockup ends a long name
  with "…" ("Credit …"); two cards named "Credit Card 1" and "Credit
  Card 2" would then read alike. A name wraps and its amount drops under
  it. Below 1280px the grid keeps the smaller 12px bill lines and 10px
  weekday names it had, so "Wednesday" fits beside the rail.
- **"+N more" after two bills** (design-review P2 item 8) opens the day in
  the app's sheet, listed as the agenda lists it. N is a count of bills
  left over, not a money figure. A bill in the sheet opens its charges
  in place of the day.
- **Today** is tinted and its number is in the accent, with
  `aria-current="date"`. On the phone's dotted grid, today's number gets
  the same colours unless it is a payday, whose green wins.
- **No figure is missing.** Each figure the screen shows comes from
  `billCalendar`: the day's bills, the week totals and the month's total.
