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
- **Layout:** two across from 1024 px (768 px until the 2026-10-01
  review, V8); from 1280 px the lists two across
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

## 2026-09-29 — Step 7, the Coach, the check-in and Ask

- **Two columns from 1280px** (design-review P2 item 11): the insights on
  the left and the goal card alone on the right, the Coach widening as the
  Month does. Of the review's two fixes, Ask moves to the foot of the left
  column, and the goal card is **not** sticky: a sticky card taller than
  the screen hides its own foot. From 1024 to 1279px, beside the sidebar,
  two columns would leave the insights near 400px, so the Coach stays one
  column there. On a phone the order is unchanged.
- **Tiles and tints in the accent.** Each insight's tile is the accent's
  soft fill, its icon chosen by where the card's action goes, not the
  mockup's rose, violet, amber and sky, which name lists (ADR 0010). The
  check-in's Last week is tinted to the accent, not green, and its win
  line is bold ink, not green.
- **Muted words on a tint** take `canvas-muted`, set once on the goal card
  and Ask's answer card (`[--muted-foreground:var(--canvas-muted)]`), so
  the pace lines and dates drawn inside follow it.
- **The quote** sits on the quiet grey (`muted`), not the mockup's canvas
  grey, where muted words read 4.40 (ADR 0010).
- **Check-in answers** are a three-across segmented control. The arrow
  keys, Home and End move between the three, wrapping, and never answer,
  since an answer is saved as it is pressed; each stays a button in the
  tab order that says whether it is chosen, as the Views switch keeps its
  links.
- **Card gains `flat`,** Mockup A's card with no shadow, as a prop, since
  `cn` does not resolve a `shadow-none` against `shadow-sm`. The Coach's
  insights, the check-in's cards and Ask's answer use it.
- **Copy left out:** "Today’s insights" over the cards and the "Main goal"
  badge on the Coach's goal card are not this screen's copy, and the
  review does not ask for them. Ask keeps its "← Coach" line (P1 item 2),
  which the mockup leaves out.
- **Left as they are:** Ask's suggestion chips keep the small button's
  corners and type, which a caller cannot override (`cn`), where the
  mockup draws 14px pills; the check-in and Ask stay centred in the
  panel at their reading width, where the mockup sets them to the left.
- **No figure is missing.** Every figure is core's, as before:
  `goalsProgress`, the goal forecasts, the check-in's figures and
  `impulseShare`, and `answerQuery`'s answer. Nothing sent to or read from
  the AI changed, and every ✨ keeps its words for a screen reader.

## 2026-09-29 — Step 8, the Forecast and Reports

- **Safe to spend and the month's end are stat cards,** side by side from
  640px, in the Month's look (the accent tile, a 32px figure from
  1280px). Safe to spend is the one card tinted to the accent, as Left to
  spend is on the Month; the mockup's green and sky tints name lists (ADR
  0010). Each keeps its title as a heading (`StatSection`), since the
  cards hold sentences, badges and a drawing, not one term.
- **The range is chart-specs' `rangeBar`** (design-review P2 item 9), drawn
  from `forecastFigures`' basis points, the same `scaleSeries` that places
  the figures; it was already, and now sits in the month's end card. Its
  colours changed, never its shape.
- **"Still to come" is its own card,** as the mockup draws it, beside the
  next 30 days. The sections lie two across from 1280px; from 1024 to
  1279px, beside the sidebar, two would leave each near 340px, so they
  stay one across there, as the Coach does. Debt-free runs across the
  foot. Forecast and Reports widen as the Coach does.
- **`Section` gains `large`,** Mockup A's section card: flat, an 18px title,
  24px sides and 15px words. Every card on the Forecast and every tab of
  Reports uses it; the check-in keeps its own.
- **The what-if answer** sits on the accent's soft fill, its muted words in
  `canvas-muted`; the goals are split by rules, their names semibold.
- **"Range", "Rough" and "So far"** take a new accent Badge (`accent`: the
  accent on its soft fill, already in the contrast test), not the mockup's
  sky, which names Bills.
- **Reports' title row** is the Month's: the title, its ? and "So far"
  beside them; on the right the month stepper and Save as PDF. The
  stepper's middle keeps the month's full name as its heading ("September
  2026", the mockup's "Sep 2026"), since it is the printed page's title.
  "So far" still leaves with the stepper on Trends and Habits (P2 item
  10); the tests that said so still pass.
- **The tabs are a segmented control** like the Views switch, with one tab
  stop; the arrow keys, Home and End choose along them, wrapping, as
  Add's do, and the choice is still remembered (`rememberTab`). Below
  640px the tabs narrow their sides so all four fit at 390px; at 320px
  they scroll in their own box, fading at the edge, as before.
- **The review runs across the top** tinted to the accent, the one tinted
  card on Reports; the Overview's other cards, and every card on Trends,
  Shops and Habits, lie two across from 1280px.
- **Charts (N124):** the Forecast's and Reports' charts now carry Mockup A's
  light tokens in their attributes, as the page already painted them.
  "This month and last" stays chart-specs' paired bars, where the mockup
  draws HTML bars; a restyle keeps a chart's shape.
- **Copy left out:** the mockup's "The month in review, trends, shops and
  habits" under the Reports title, and its small-capitals "THE MONTH IN
  REVIEW", are not the app's; the review keeps its card title. The
  Debt-free card keeps "Open Debts" as the sentence's link, where the
  mockup draws a button.
- **No figure is missing.** Every figure is core's, as before:
  `monthEndForecast`, `safeToSpend`, `cashFlow30`, `cashFlowAhead`,
  `scaleSeries`, the goal outlooks and `whatIf`, `debtPlan`, and
  `monthReport` and the Trends, Shops and Habits reads.

## 2026-09-29 — Step 9, Savings and Debts

- **Both title rows are the Month's:** the serif italic titles, Savings'
  yellow banner and Debts' rose banner and grey page go. Add a goal and
  Add a debt sit on the title row's right from 640px, as the mockup draws
  them, full width under the words on a phone. Both screens widen with
  the sidebar, their cards three across from 1280px.
- **Goal cards** are white with Savings' amber title strip
  (`savings-title`, now #FFFBEB), an icon tile in Savings' tile and
  accent, and the name at 18px in ink. The tile is a plane for a goal
  counted in hours and a piggy bank for the rest, as the sidebar's goal
  card chooses. Figures are in ink and labels muted; the bar is amber on
  its tile; "Amount needed" keeps Savings' ink on its band. The hours
  line sits on the accent's soft fill, as the mockup draws it, and the
  lever in a plain bordered box. Saved this month is tinted to Savings'
  amber, the list it counts. "Main goal" takes the filled accent badge.
- **Every goal action stays**, as it was laid out: Edit goal, Make main
  goal and the arrows on one line; Pause, Mark as reached and Remove on
  the next. The mockup draws Remove as a bin alone and leaves Mark as
  reached out of sight; the app keeps both words.
- **The debt summary** is one wide card tinted to the accent, the one
  hero on the screen, as on the Month, the Week and the Forecast. Two by
  two beside the ring until 1280px (design review P2 item 13), four across
  from there. Below 640px the total takes a row of its own: beside the
  ring at 390px it broke inside the number, as it did before this step.
- **Hues on Debts (ADR 0010).** The mockup draws the rings and the chosen
  plan in violet, which ADR 0010 keeps for Subscriptions. They take the
  accent instead, as the mockup's other non-list tints did in steps 3–8.
  Each debt's tile and labels take Debts' rose, as the Year's Debts today
  already draws these same debts. The screen's first line says these are
  not the Month's Debts list; rose here means "a debt", the one meaning
  the hue has everywhere.
- **The rings (N124):** chart-specs' `debtRing` keeps its shape and takes
  new colours: what is paid in the accent #4F46E5 over the neutral track
  #E5E7EB, the centre in ink. The accent's soft fill was tried as the
  track and vanished where the summary's tint ends.
- **The chosen plan is Minimums only.** The app has no plan to choose:
  the summary and the Forecast's debt-free line both follow `debtPlan`,
  which is Minimums only. So that card is the one tinted. The
  mockup tints Avalanche, which was only its sample; saying which plan is
  cheapest would take a comparison core does not give, and choosing a
  plan is a feature, not a restyle. The tint has no word of its own; its
  date matches the summary's Debt-free by above it.
- **Left as it was:** "A card you pay off from your bank…" stays under
  the intro, where the mockup moves it to the foot, since it qualifies
  the first sentence.
- **Copy:** nothing new. No figure is missing: every figure is core's, as
  before (`savingsFunds`, `goalProgress`, `periodComparison`, the levers,
  `debtPlan`, `debtStatus`, `debtBalanceChange`, `payoffStrategies`).

## 2026-09-29 — Step 10, Add, Review and All transactions

- **Titles and steppers are the Month's:** `MonthTitle` on all three, and
  All transactions takes the Bill calendar's "‹ Sep 2026 ›" stepper
  (`StepButton`), so the month shown is named between the arrows.
- **Add's tabs** keep their icons and their keys (arrows, Home, End, one
  tab stop) and sit on the canvas grey, the unchosen words in
  `canvas-muted`, as Reports' tabs do (ADR 0010). I spent / I received
  sits on the canvas grey the same way.
- **A PDF statement's card** holds its figures, the rows not read and
  Import, tinted to the accent as each screen's one hero is; its muted
  words take `canvas-muted`. "Matches your statement" keeps the app's
  green success badge.
- **Shops are in the fixed-width face** on all three screens, as the
  mockup draws every string a statement printed; typed names are drawn
  the same way, since the ledger does not tell them apart by face.
- **Review's count** beside the title is waiting's amber, not the
  mockup's orange (ADR 0011), and hidden from a screen reader, since the
  line under the title says the number.
- **Suggest categories and Approve these N** sit on the title row's
  right. Approve these N is filled, as the mockup draws it; it still only
  opens the question, and nothing is filed until Approve all N. The
  suggestions line stays on the page, empty and hidden, so what it later
  says is heard (it used to arrive with its words already in it).
- **Picker, Approve and ✕ on one line from 480px.** Below that the picker
  takes its own line, as before: at 320px one line left the picker near
  100px, too narrow to read "Choose a category…". A new category's name
  and list stack under the picker, so the tab order still runs picker,
  name, list, Approve.
- **The unreadable lines** sit in waiting's amber card (#FFFBEB, #FDE68A
  edge, the #D97706 icon); ink and muted words on it are measured.
- **Money out and Money in stay white,** where the mockup tints them rose
  and green: those hues name Debts and Income (ADR 0010), and these totals
  are every row. Money in keeps the app's green figure, as before.
- **Width:** the three screens keep the app's centred reading width
  (48rem), where the mockup sets 920 to 960px to the left of the panel.
  At 1440px Review's two buttons therefore wrap under its title.
- **Copy left out:** "· Card statement (PDF)" on each Review row (the
  queue does not read each row's import; N134), the "Similar shop" badge,
  and "every approved charge and payment" under All transactions' month.
  The search box has no magnifier: the field's padding is its own, and
  `cn` cannot override it from outside.
- **Seen only in tests:** the preview has no way to hand Add a PDF, so the
  tinted statement card was checked by add-statement.test, not by eye.
- **No figure is missing.** Every figure is the engine's or the import's
  as before: the reconciliation's totals, the queue's count, and
  `summariseImport` on All transactions. Nothing about approving changed.

## 2026-09-29 — Step 11, Setup, Settings and AI settings

- **Setup's own look goes:** the teal band, its serif italic title and
  the grey page. "Start here!" is the Month's title on a card tinted to
  the accent, the name in a field of its own. On the tint the app's field
  grey reads 2.99 to one, so the field's edge and the muted words there
  take `canvas-muted`, measured. The mockup's line under the title ("Your
  name, and every category under the list it belongs to…") is the
  source's doc comment, not its copy, so it is left out.
- **Each list is its own card,** its section named over its title in
  small capitals ("Source" over Income, "Recurring expenses" over Bills,
  Debts and Subscriptions), with an icon tile in the list's hue from the
  Month's table, now `list-tone.ts`. Not spending has no hue and takes a
  grey tile. Each card is now an h2; the workbook's five section headings
  became the words over the titles.
- **Two columns from 1280px,** the lists with fields on the left and the
  name-only lists on the right, each read top to bottom, so a keyboard
  moves in the order they are seen. The mockup pairs them row by row
  (Variable beside Bills); that order would leave the keyboard jumping
  between columns. Narrower, one column in the workbook's order.
- **Fields on the name's line from the card's own width** (a container
  query at 42rem), so it follows the card, not the screen: beside the
  rail at 768px, and in the left column at 1280px, the fields stay under
  the name, since beside four buttons the name had 70px. The workbook's
  notes on the columns stay above the heads, which the mockup drops.
- **P2 item 12:** the rule under each name stays the field grey, not a
  fainter one, since it is the field's only edge (FE-5, 3:1). A saved
  name gets the name card's ✓, named "Saved", gone at the next keystroke.
- **Totals** run across each card's foot on the list's tint; Fixed monthly
  bills is the page's one hero, white to the accent's tint.
- **"‹ More"** shows only below 768px, where More is reachable; Setup is
  in the sidebar and the rail from there. Stop drops "from September"
  where the heads above name the month; its accessible name keeps it.
- **Settings** takes Mockup A's section cards (Forecast's `Section
  large`): the three shortcuts across from 1024px, Weekly budgets beside
  the learned shops and the account from 1280px. Learned shops are in the
  fixed-width face, as step 10 set. The piggy bank beside "Your savings
  goals" goes, as the mockup draws none; the buttons keep their icons.
- **AI settings:** the status is the one hero, tinted to the accent, not
  the mockup's green (Income's); its tile is a sparkle, which says nothing
  about whether AI is on, since the sentence beside it says that. The
  mockup's subtitle ("Turn on free AI, choose services, and how the Coach
  talks.") is not the app's copy and is left out. The order's ↑ ↓ became
  the app's chevrons. *Since 2026-10-08 (ADR 0015):* one reading column,
  not two from 1280px. **Use AI** sits in the hero beside the sparkle,
  the sentence under them; then the **Free AI** card, the three free
  services as rows parted by rules, each with its key steps, **Test** and
  the model it uses; then **Advanced**, folded, with the paid keys, the
  order, paid services and the daily limit (one card, as drawn) and the
  Coach's tone.
- **Switches** were already the app's `SWITCH` checkbox with
  role="switch"; unchanged. **The key field** is unchanged: a password
  field emptied the moment it is sent, never shown back beyond the last
  four characters the helper reports.
- **Left as they are:** the name fields in Setup's narrow right column
  show about 14 characters at 1280 to 1440px, where the mockup's are
  wider (N135); card titles made with `CardTitle` elsewhere keep 16px.
- **No figure is missing.** Every figure is core's, as before:
  `billsTotals` for each card's total and Fixed monthly bills,
  `resolvePlans` for the fields, today's calls from the helper.

## 2026-09-29 — Step 12, Help, Getting started and Sign in

- **Help's list beside the article from 1024px,** 18rem wide, 20rem from
  1280px, drawn only on a wide screen (`useWide`), as the Year draws one
  layout, not both. Beside an article the list shows titles alone, in a
  nav named "Help articles", the open one lit (`aria-current="page"`);
  "Help" over it is words, not a heading, so the article's title stays the
  page's only h1. "‹ Help" leaves there, since the list is the way back.
  `#/help` alone keeps the centred list with each summary; only the list
  standing alone takes ⌘K's search, so the ask is never spent on a list
  about to be replaced.
- **An article's steps are a card,** "You're done when…" (with the
  mockup's check, in the accent, not Income's green) and "Stuck?" two
  across where the column allows. No Help card keeps a shadow, the ?
  sheet's words list included.
- **Help's wording** (the step's fourth item): steps that said "Open More,
  then Savings" and Reports' "from the bar at the top on a wide screen"
  described the look before the sidebar. Each now names the screen and
  says it is under More on a phone. AI settings' steps still say More: on
  a computer nothing else leads to it once AI is on (N136).
- **Getting started:** the Month's title; an empty segment in the track
  grey (it was the near-white hover fill, near invisible), the step showing
  a taller ringed segment. The step is the one hero, white to the accent's
  tint, its muted words and field edges in `canvas-muted`. From 1280px
  "All 9 steps" lies open beside it, still the same details, so Help's
  "open All 9 steps" stays true; narrower, folded under the buttons.
- **Sign in:** the sidebar's wallet tile, "Budget" and its line centred
  over the one card with a shadow (README), on the canvas washed with the
  accent's tint at the top. Field names bold, not small capitals; Sign in
  runs the card's width. "Check your email" is the card's heading.
- **Copy left out:** Help's "ARTICLE" over the title, the "✨ Ask about
  this" pill beside Related (the ? sheet keeps it; adding it here is new
  behaviour), the search box's magnifier (as on All transactions), and the
  sign-in's "Accounts are made in the Supabase dashboard. There is no
  sign-up here.", which is auth.tsx's comment, not its copy.
- **No figure is missing.** Getting started's count and order are core's
  `setupProgress`, as before; Help and Sign in show no figures.

## 2026-09-30 — The final sweep

Every screen and state walked at 320, 390, 768, 1024, 1280 and 1440 px,
light and dark, in the preview, and compared with the mockups. No page
scrolls sideways; no h1 differs (32px bold everywhere but Sign in's card,
28px, and More, a phone list); no text under 4.5 to one was found after
the fixes below; every touch target is 44px or sits in a 44px label.

- **Flat by default.** `Card` and `Button` carry no shadow, and the `flat`
  prop is gone. The shadows left are the three the mockup draws: the
  sign-in card, the sheet over the page, and a segmented control's chosen
  segment (0 1px 2px). A test holds every other file to none. Fields lost
  shadcn's `shadow-xs`; More's list, the Month's Start here and Coach
  line, and Help sheet's two link-buttons lost theirs (N138).
- **Tabular figures on the body,** not per element: fifteen sentences
  carried a figure without `.tnum`. `.tnum` stays, redundant.
- **Getting started's lit step** takes `canvas-muted` on its tint, as
  every other tinted surface does.
- **31 unused tokens removed** (N129), with their contrast rows.
- **Content padding 28px beside the sidebar** (review of the sweep): the
  page kept its 16px phone gutter at every width, so from 1024px the
  content sat 12px left of the top bar and of the mockup's 28px (README
  spacing). The rail's panel, 768 to 1023px, keeps 16, where the Month's
  Variable table fits its card; the Forecast's month table lost 4px
  between columns so it fits its card at 1280.
- **N127 stays open:** chart text is one shared constant (see its entry).
  Closed by the 2026-10-01 review (V1, below).
  N124 and N128 were already settled.

### Every deliberate difference from the mockups

Colour and hue (ADR 0010: a hue names a list, and contrast is a floor):
- Stat cards, insight tiles, the Debts rings, the chosen debt plan, the
  AI status, Forecast badges and every non-list tint take the indigo
  accent, where the mockup uses green, rose, sky, violet or teal.
- Sidebar icons are grey, the lit one the accent (ADR 0011); the mockup
  colours each.
- The Review count, the waiting banners and Review's unreadable lines are
  waiting's amber, where the mockup has orange in places; the Year's
  review line is the amber banner, not a grey link.
- Small orange words are #C2410C, large ones and icons #EA580C (#F97316 is
  2.8:1). The waiting count is #92400E. A field's edge is a darker grey
  than #D1D5DB (a control's only edge needs 3:1). Words on the canvas and
  on tints are `canvas-muted`. The payday pill is #047857 with white (the
  mockup's #10B981 reads 2.5:1). A filled button in dark mode has dark
  words on #818CF8.
- The Year's Expenses are grey (`owed`), not Debts' rose; the four lists
  added are no one list. The Month's Money out / Money in on All
  transactions stay white, not rose and green.
- Getting started's "You're done when…" check and "Done" are the accent,
  not Income's green; the check-in's Last week is tinted to the accent.

Layout:
- Below 768 px the phone bar and single column stay (ADR 0011); the
  mockups are 1440 px only.
- Sidebar groups other than Plan fold (design-review P1 item 1).
- The Month lays the lists two across with the charts in a 17 to 20rem
  column from 1280 px; the mockup puts three lists across.
- The Coach is one column from 1024 to 1279 px, the goal card not sticky;
  the Forecast's sections likewise one across below 1280 px.
- Add, Review and All transactions keep the 48rem centred reading width,
  where the mockup sets 920 to 960 px to the left; Review's two buttons
  therefore wrap under the title at 1440.
- Setup's two columns run top to bottom, so the keyboard follows what is
  seen; the mockup pairs them row by row.
- The Year's pie stays a pie and "Against goals and budgets" stays
  Goal-beside-Actual columns; Reports' "This month and last" stays paired
  bars. A restyle changes a chart's colours, never its shape.
- Bill calendar names wrap instead of ending in "…", so "Credit Card 1"
  and "Credit Card 2" stay apart. Planned amounts there are italic, as
  the screen's own legend says; elsewhere "planned" is a small word.
- The check-in and Ask stay centred at reading width.
- Ask's suggestion chips keep the small button's corners, not 14px pills.
- Goal and debt actions keep every word (Mark as reached, Remove), where
  the mockup shows a bin alone.
- Chart words are 13 px wherever a chart sits (V1, 2026-10-01), where the
  mockup writes 12 to 14 px; until then they scaled with the card, 9 px
  in the Month's column and 18 px on the Forecast (N127).

Copy (the app's own; screens.md is the inventory):
- Left out, as not the app's: the Month's hint lines under the stat cards
  and the hero's bar; "September 2026" under chart titles; Reports' and
  the Forecast's subtitles and "THE MONTH IN REVIEW"; the Year's chart
  subtitles; "Today's insights" and the "Main goal" badge on the Coach;
  "· Card statement (PDF)" on Review rows (N134) and the "Similar shop"
  badge; "every approved charge…" under All transactions; Setup's and AI
  settings' subtitles; Help's "ARTICLE" and "✨ Ask about this" pill; the
  sign-in's note on accounts; the search boxes' magnifiers.
- Added, as the design review asked: "← Coach" on Ask and "← Settings" on
  AI settings; the sidebar's and top bar's "Search or jump to…", "⌘K" and
  "Toggle sidebar".
- The Week's and Month's "$X of $Y in weekly budgets" and its bar are left
  out: no engine output gives the Actual of the budgeted rows alone.

Figures: none is computed on a screen. Every percentage, bar, ring and
share is core's (goalProgress, budgetUsedBp, shareBp, partShares,
goalBars, scaleSeries and the rest).

## 2026-10-01 — The frontend and visual reviews

Two reviews (frontend: FE-*, visual: V*) found what follows; each fix is
its own commit with a test seen failing first. What the owner would feel,
then why.

Charts:
- **Chart words are 13 px on every screen and width (V1, N127).** A chart
  measures the box it is drawn in and chart-specs draws it on as many
  units across as put its 12 px-designed words at 13 px (`widthFor`,
  2,000 to 5,000 units). Heights, row pitches and every length from core
  are unchanged; only the horizontal span moves, so a narrow card shortens
  a long name with "…" sooner, and a wide one gives it more room. Rings
  and sparklines sit in boxes of their own size and stay at 3,000. Before
  a chart is measured (and in an exported file) it is drawn at 3,000, as
  before. Chosen over three fixed sizes: one size per chart could not hold
  12 to 14 px for a chart whose card is 222 px at 1440 and 324 px on a
  phone. Measured at 320, 390, 768, 1024, 1280 and 1440, three stay under
  13 px: the Year's pie in the glance row at 1280 (183 px across, 11 px;
  drawn on fewer units its legend would cut "Expenses" short), the twelve
  month names, which shrink to 11.7 px on a phone to keep their gap (V6),
  and the Against goals labels, four fifths of the text by design.
- **The donut's legend names are in the ink, the figures muted (V5),** as
  Month.dc.html writes them; the hue stays on the slices and swatches.
- **A Goal's pale key swatch is edged in its Actual's colour (V4);** the
  bars are not, since they sit on their own track.
- **Twelve months' names never touch (V6):** whole where they fit with a
  6 px gap, a little smaller (not under four fifths) where that is
  enough, and by first letter ("J F M") on the narrowest charts. Each
  column's title keeps the whole month.
- **The Year draws its totals pie once (V12),** in the glance row; the
  chart row's two charts take two columns each, so "Against goals and
  budgets" is on one line (V19).

Layout:
- **The Month, Week and Pay lay their lists one across below 1024 px
  (V8).** Two beside the tablet rail were 225 px each and broke "Variable
  expenses" and most names onto three lines; the 13 px table head that
  squeezed them in is gone.
- **A list with every row folded says "Nothing on this list this month."
  (this week, this pay period) with its Show N empty (V9),** not a tinted
  table head over no rows.
- **On a phone a list card's tile is 40 px and its name 16 px, and "of
  $budget" stays whole (V20),** so the head is two lines, not five.
- **The Year's Top 3 is each name over its amount and share, at every
  width (V2);** four across, each table card's total sits under its name,
  so every head is two lines and the tables start level (V3).
- **Bill calendar days: each bill's name over its amount, on every day
  and width (V13);** still no "…". Two columns, tried first, squeezed a
  tablet's day to a letter a line ("R e n t") and broke "Insuranc e" on a
  desktop, so the name wraps between words and breaks only a word wider
  than the day.
- **Comparison lines start their second half with the dot (V7),** so "·"
  never ends a line or stands alone, and a figure keeps its word ("$1,860.23
  spent"), where "spent" stood on a line alone in a narrow card.
- **Reports' stepper shows a dimmed chevron at the latest month (V15),**
  as the Week's and Pay's do.
- **Setup's column head is "Monthly amount" on one line; "Amounts apply
  from September on." joins the hint above (V16).** Each field's own name
  still says the month.
- **Savings goal cards fill their row, actions at the foot (V17),** and
  "saved of $30,000.00" stays on one line (Savings and the Coach).
- **Help's two closing cards are one height (V18); the sign-in subtitle
  is balanced (V23).**

Behaviour:
- **A screen that cannot load says so, with Reload (FE-1),** where a
  missing chunk or a screen's error left a blank page; a chunk from an
  older deploy reloads the page once by itself. Not offline, where the
  reload would fail too and the browser's own error page would take the
  app's place: the note stays and says to check the connection.
- **A late AI reading never overwrites what the owner did meanwhile:** a
  receipt read after "Use another photo" is dropped and its preview let go
  (FE-2); Just type it's fill is dropped once the form has been changed or
  sent, and a reading that fails says so (FE-4). An Add pressed early that
  only said what was missing sent nothing, so the reading still fills in.
- **All transactions keeps its rows on screen while it reads again after a
  removal (FE-5);** only a new month shows "Loading…". The removed row and
  its amount go at once, so a row already deleted never offers Remove.
- **Approve these N marks each category the AI chose with ✨, and says
  so once (FE-7);** a category the owner picked has no mark. "Not this"
  can no longer be undone by a read that was already out (FE-8).
- **Every field has a name a screen reader says (FE-6, FE-12):** the
  search on All transactions, a new category's name on Review; Add's list
  picker is labelled "Which list", the words it is named by.
- **The Week's loading pulse and a progress bar's growth stop under
  reduced motion (FE-11).**
- **Ask reads the payoff plan again after a read that failed (FE-13).**

Left as they were, and why: the reviews' taste calls (V10 Review's
disabled Approve, V14 the Year chip's ink, V21 today's dark calendar
cell, V22 the sidebar's group spacing) and FE-3, FE-10, which the
verification refuted. Settings' new-category row (FE-6 in part, FE-9,
V11) is the AI-apps build's file and waits for it.
