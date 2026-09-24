# Formula and format decisions

Questions that had more than one defensible answer, the answer chosen, and who
chose it. CLAUDE.md requires an ambiguity to be settled here before code is
written, so that a number nobody can explain later has a place to be looked up.

A decision is recorded with its source — a workbook sheet and cell, or the
part of a statement it was read from — because "we chose B" is only useful
alongside what A and B were.

---

## F1 — Which of a statement's two dates is a transaction's date

**Decided 2026-09-22 by the account holder.**

A Rogers Bank Mastercard statement gives every transaction two dates:

```
Trans   Post
Aug 7   Aug 10   LAVA GRILL RED DEER AB    31.45
```

`Trans` is when the card was used. `Post` is when the bank settled it, up to
four days later.

**Options put to the user**

- **A — the transaction date.** Matches what a person remembers doing. A
  Saturday coffee appears on Saturday. The app's monthly totals will not equal
  the statement's monthly totals, because the bank cuts its month on settlement.
- **B — the posting date.** Monthly totals reconcile with the statement to the
  penny. A purchase can appear up to four days after it was made, and weekend
  spending lands on Monday.
- **C — store both, display the transaction date.** Most flexible, more to
  build, no decision locked in.

**Chosen: A.** In the user's words, "when I bought it".

**Consequence.** `posted_on` in the ledger holds the TRANSACTION date despite
its name. The column name predates this decision and is not worth a migration
on its own; it should be renamed the next time that table is altered for
another reason. The posting date is currently discarded, which means option C
is not available later without re-importing — accepted knowingly, because the
statements are re-importable at any time and the dedupe hash makes a second
import of the same file a no-op.

**Where the periods do not line up.** A transaction made a few days before a
statement period opens still appears on that statement. The year for a bare
`Aug 6` therefore comes from a window that starts 60 days before the period —
see `packages/statement-parsers/src/formats/yearless-dates.ts`.

---

## F2 — Sign convention when importing a Rogers statement

**Decided 2026-09-22. Follows from D3 in `divergences.md`; recorded here
because it is a per-format reading, not a ledger-wide rule.**

The statement writes a **purchase as a positive** number and a **payment or
refund as a negative** one:

```
LAVA GRILL RED DEER AB      31.45     <- money spent
PAYMENT, THANK YOU        -100.00     <- money paid to the card
```

The ledger is the opposite way round: D3 has outflows negative and inflows
positive, so that a period's net is the plain sum of its rows.

**Chosen: negate every amount on import.** `applySignConvention` with
`debit_positive`, which already exists for card CSV exports that do the same.

Both directions are kept: the flipped value goes to the ledger, and the
statement-sign value is what reconciliation compares against the printed
"payments & credits" and "new purchases & debits". Comparing a flipped value
against a printed total is how a sign error cancels itself out and passes.

---

## How the entries below for the workbook views were settled

F3 to F15 come from the workbook views plan (`docs/workbook-views-plan.md` §5.2, answered in
§9a). Each entry says which of three ways it was settled, and only that:

- **Owner chose** — put to the account holder as a question, and answered.
- **Stated to the owner, no objection** — told to the account holder as what
  would be done unless they said otherwise, and they did not object. They did
  not choose it.
- **Engineering default** — never put to the owner, usually because it copies
  the workbook exactly or changes no number they would see.

Formula text is re-read from the workbook's formulas; values in brackets are
its cached results.

---

## F3 — A planned bill amount next to a real charge in the same month

**Decided 2026-09-22 by the account holder (workbook views plan decision 3).**

```
Jan!E22   =Bills!D7+SUMIFS(Bills!Q:Q,Bills!P:P,C22,Bills!O:O,">="&DATE(YEAR($B$3),MONTH($B$3),1),Bills!O:O,"<="&EOMONTH($B$3,0))   [800]
Bills!D7  800    (Rent, "Monthly Amount")
Bills!Q5  note: "Remember this column is for Bills that have changing amounts
          each month (example: electric bill) OR are paid at various times"
```

A bill's month Actual is its fixed Monthly Amount **plus** every payment
logged for it that month. The workbook's own sample depends on it: Credit Card 1 is
$50 fixed plus a $200 logged payment (Paycheck Budget!L50 [250]).

**Options put to the user**

- **A — the real charge replaces the plan.** Netflix set up at $17.99 with a
  $17.99 statement charge shows $17.99.
- **B — add both, as the workbook does.** The same month shows $35.98.

**Chosen: A.** For a bill, debt or subscription category in a window: if any
real ledger row falls in it, the Actual is the sum of those rows and the
planned amount is ignored; otherwise, if a planned amount is in effect and its
due day falls in the window (F8), the Actual is the planned amount, labelled
"planned"; otherwise $0.

**Consequence.** Recorded as divergence D5. No month-tab golden value moves,
because the sample never has both for one bill in one 2026 month; the cells
where the rules differ are left out of the fixtures (plan §5.4). A typed
*extra* debt payment replaces the planned payment instead of adding to it; the
workaround is to type the regular payment too (plan §10 item 3).

---

## F4 — Which rows fall inside a window

**Decided 2026-09-22. Engineering default: copies the workbook.**

```
Jan!U22            =SUMIFS(Transactions!D:D,Transactions!C:C,S22,Transactions!B:B,">="&DATE(YEAR($B$3),MONTH($B$3),1),Transactions!B:B,"<="&EOMONTH($B$3,0))
Weekly Budget!X22  =SUMIFS(Transactions!D:D,Transactions!C:C,V22,Transactions!B:B,">="&$D$6, Transactions!B:B, "<="&$D$7)   [85]
Paycheck Budget!D6 2025-01-01     D7 2025-01-14
```

**Chosen:** a window includes both its first and last day, and compares dates
only, never times. A window's year is its own; it is never taken from a month
name (D10).

**How sure.** The start is proven by cached values: the sample's $85
Restaurants row is dated 2025-01-01, the D6 of both Weekly and Paycheck, and
Weekly!X22 counts it [85]. The day after the end is proven excluded: Car Loan's
$100 on 2025-01-15 is outside Paycheck's window (Paycheck!K52 [0]), and
Clothing on 2025-01-17 is too (Paycheck!X21 [85], not 185). That the end day
itself is included rests on the formula text (`"<="&$D$7`) alone, because no
cached row falls on an end date.

---

## F5 — "Left to spend" on the Month and Week

**Decided 2026-09-22. Engineering default: copies the workbook.**

```
Jan!D13            =V21        [800]
Jan!V21            =SUM(V22:V45)
Jan!V22            =T22-U22    (Budgeted − Actual, Variable expenses)
Weekly Budget!D13  =Y21        [65]
```

**Chosen:** Left to spend is the Variable-expenses budget remaining: Budget −
Actual for each Variable-expenses row, summed. Bills, debts, subscriptions and
savings do not enter it.

**The empty budget.** In the workbook a row with a blank budget still subtracts its
Actual (`T22-U22` reads a blank as 0), so unbudgeted spending lowers Left to
spend. The engine does the same, but as a named branch that cites F5, not as a
`?? 0` fallback, which the CONSTRAINTS.md floor forbids. The alternative —
leaving unbudgeted rows out of the total — would show more money left than
there is.

---

## F6 — The sign of a savings Difference

**Decided 2026-09-22. Engineering default: copies the workbook.**

```
Jan!V10  =U10-T10   [-3000]   (Actual − Goal, Savings)
Jan!V22  =T22-U22             (Budget − Actual, Variable expenses)
```

**Chosen:** kept as the workbook has it. Savings Difference is Actual − Goal, so
saving less than the goal is negative; Remaining on a spending row is Budget −
Actual, so overspending is negative. The two columns have opposite signs by
design, and in both a negative number is the bad one.

---

## F7 — Spent, and the projected ending balance

**Decided 2026-09-22. Engineering default: copies the workbook. Showing the
balance at all was the owner's choice (plan decision 6 B).**

```
Jan!D11            =SUM(C19,I19,N19,S19)   [867.99]   (Bills + Debts + Subscriptions + Variable)
Jan!D15            =D9+N5-D11-S5           [132.01]   (start + income − spent − saved)
Weekly Budget!D15  =D9+P6-D11-V6           [515]
Jan!D9             1000   note: "Type in the Bank Balance you started the month with!"
```

**Chosen:** Spent is Bills + Debts + Subscriptions + Variable expenses;
savings are not spending. The ending balance is start + income − spent −
saved.

**Where it differs.** The workbook treats a blank D9 as $0 and still shows an ending
balance. The engine returns no ending balance when no starting balance is typed
for that month, because a projection from an invented $0 is a wrong number
that looks right. Recorded as divergence D17 (N9).

---

## F8 — When a planned amount counts, by window

**Decided 2026-09-22. Engineering default: copies the workbook, except for
days 29–31 (D6).**

```
Jan!E22            =Bills!D7+SUMIFS(...)       (no reference to Bills!B, the day paid)
Weekly Budget!D50  ...+if(C50="",,iferror(sum(FILTER(Bills!$D$7:$D$29,Bills!$C$7:$C$29=C50,
                   regexmatch(Bills!$B$7:$B$29&"","\b"&textjoin("\b|\b",1,
                   ArrayFormula(day(ADD($D$6-1,row(INDIRECT("A1:A"&DATEDIF($D$6,$D$7,"d")+1))))))&"\b"))),0))   [800]
Bills!B5           note: "Type the DAY of each month this repeat bill is paid!"
```

Weekly!D50 is a Google Sheets formula; the export wraps it in
`__xludf.DUMMYFUNCTION`, and it is shown above unwrapped, with its doubled
quotes undone.

**Chosen:**

- **A whole month** counts every planned amount in effect, whatever its due
  day, because the month tabs never read Bills!B.
- **A partial window** (a week, a pay period) counts a planned amount only if
  its due day is one of the window's days, as Weekly!D50's `regexmatch` does.
- **A blank due day** never matches a partial window: the workbook's match runs
  against an empty string. Setup will prompt for a day paid.
- **Days 29, 30 and 31** count on the month's last day in a shorter month.
  The workbook silently drops them, because those days do not exist in the window it
  lists. Recorded as D6.

---

## F9 — Rounding a savings fund's monthly contribution

**Decided 2026-09-22. Engineering default.**

```
Savings!Z14  =IFERROR((F14-J14)/V14, 0)   [88.9047619]   format "$"#,##0
Savings!Z14  note: "This is your new monthly goal!"
```

The workbook keeps the full fraction and displays it rounded to the dollar ($89).
Money in the app is whole cents, so the fraction has to go somewhere.

**Options considered**

- **A — round up to the cent** ($88.91). Saving it every month reaches the
  goal on time.
- **B — round half-up to the cent** ($88.90). Can fall a few cents short by
  the goal date.
- **C — the workbook's whole dollars** ($89). Hides cents the rest of the app shows.

**Chosen: A.** A monthly goal exists to reach the target; the rounding should
never be the reason it is missed. The golden value is Savings!Z14 → 8891
cents.

---

## F10 — Which months of the Year count planned bills

**Decided 2026-09-22. Engineering default: copies the workbook.**

```
Hidden!O4           =SUMIFS(Bills!Q:Q, Bills!O:O, ">="&DATE(YEAR('Annual Budget'!$C30), MONTH('Annual Budget'!$C30), 1),
                      Bills!O:O, "<="&EOMONTH('Annual Budget'!$C30, 0), Bills!T:T, "Bills")
                    +IF(OR(AND(MONTH('Annual Budget'!$C30)<=MONTH('Annual Budget'!$D$7), YEAR('Annual Budget'!$C30)<=YEAR('Annual Budget'!$D$7)),
                      YEAR('Annual Budget'!$C30)<YEAR('Annual Budget'!$D$7)), Bills!$D$32, "")   [800]
Annual Budget!D7    2025-05-01   note: "Enter today's date here!"
Jan!E22 ... Dec!E22 =Bills!D7+SUMIFS(...)   [800 on every tab]
```

Annual Budget adds a month's fixed bill, debt and subscription amounts only up
to its typed "today" (D7). The month tabs, and Spending Tracker rows 17–27,
never gate: December shows its planned bills in January.

**Chosen:** both, each where the workbook has it. The Year screen gates planned
amounts at `asOf` and so shows the year to date, as Annual does (Annual!E34
[800] for May counts; E35 [0] for June does not). A future month opened on the
Month screen still shows its planned bills, as a month tab does.

---

## F11 — How the `workbook-year` golden fixture is transcribed

**Decided 2026-09-22. Engineering default: a question about the test fixture,
not about any number the owner sees.**

```
Hidden!J4  =Jan!$O$9    [19400]   (income goals)
Hidden!K4  =Jan!$N$5    [0]       (income actual)
Hidden!M4  =Jan!$U$9    [0]
Hidden!U5  =Feb!$U$21   [0]       (February spending)
Hidden!J18 =Jan!D9      [1000]    (starting balance, via Annual!D44 → D18)
Jan!D7     2026-01-01             Annual Budget!D6  2025-01-01
```

Annual Budget reads goals, budgets, starting balances and the income, savings
and spending Actuals from the month tabs by position — the **2026** tabs —
whatever year Annual itself shows. Only Hidden!O, Q and S (bills, debts,
subscriptions) filter by Annual's own year, 2025, through Annual!C30.

**Chosen:** the fixture re-dates January's budgets, goals and starting balance
from 2026-01 to 2025-01, so that one engine reading one year reproduces
Annual's cached cells. Its ledger holds only the Bills-log rows, not the
Transactions rows. The fixture's `$semantics` header says so. The engine
itself always reads one year (D10).

---

## F12 — The Year's "Left To Spend" and "Ending Balance" boxes

**Decided 2026-09-22 under plan decision 9, which was stated to the owner
with no objection.** Decision 9 is "the workbook's arithmetic mistakes are fixed and
recorded". This entry is plan decision 15, which falls under it; decision 15
and its options below were not put to the owner on their own, so the owner
did not choose "Left over".

```
Annual Budget!D15  =D9+O6-D11-U6   [-4819.85]   label "Left To Spend"
Annual Budget!D20  =D9+O6-D11-U6   [-4819.85]   label "Ending Balance"
Annual Budget!O6   (blank)          Annual Budget!U6  (blank)
Annual Budget!D9   =H6   (income)   D11 =N6 (expenses)   D13 =T6 (savings)   D18 =D44 (starting balance)
```

Both boxes read two empty cells, so both show income − expenses, savings
ignored, and the ending balance never includes the starting balance.

**Options**

- **A — income − expenses − savings, called "Left over".**
- **B — the workbook's literal result:** income − expenses, savings ignored.
- **C — leave the box off.**

**Chosen: A.** D15 becomes D9 − D11 − D13, shown as **"Left over"** so it is
not confused with the Month's "Left to spend", which means budget remaining
(F5). D20 becomes D18 + D9 − D11 − D13. Recorded under divergence D7.

---

## F13 — Rounding a 50/30/20 share

**Decided 2026-09-22. Engineering default. Dormant:** the owner did not choose
the 50/30/20 view (plan decision 2), so nothing uses this until they do.

```
503020!G7  =SUM(L7/($L$7+$M$7+$N$7))   [0.9411764706]   format 0%
503020!I7  =SUM(N7/($L$7+$M$7+$N$7))   [0.05882352941]
```

**Chosen:** a share is held in basis points, rounded half-up (G7 → 9412, I7 →
588). The workbook displays whole percent; basis points keep two more places without
a float.

---

## F14 — What "a year" is

**Decided 2026-09-22. Engineering default: copies the workbook.**

```
Annual Budget!D6   2025-01-01   note: "Choose any month you'd like to see a 12-Month Budget display for!"
Annual Budget!I10  =D6
Annual Budget!I11  =DATE(YEAR(I10),MONTH(I10)+1,DAY(I10))
```

**Chosen:** the Year covers twelve months from a start month the owner picks,
not a calendar year. Its address carries the start month (`#/year/2026-01`).

---

## F15 — How a pay period is found, and how a monthly bill is split across it

**Decided 2026-09-23 by the account holder: option B.** Asked and answered
on 2026-09-23. The rounding, and the three smaller questions B leaves open,
are engineering defaults recorded below before the Paycheck engine (S15b).
The departure from the workbook is D18.

```
Paycheck Budget!D6   2025-01-01          D7  2025-01-14     (both typed)
Paycheck Budget!E22  =IF(F22, E50 / 2, D50)   [800]          F22  FALSE
START HERE!C8        2025-01-10 (first pay date)             E8   Bi-weekly
```

The workbook's Paycheck tab takes a typed start and end date. A tick box (F22) halves
a bill's monthly amount with a fixed ÷2, whatever pay frequency START HERE!E8
says; unticked, it counts the bill only if its due day falls in the window
(F8).

**Options put to the owner**

- **A — copy the workbook.** Type both dates; halve a monthly bill with ÷2.
- **B — find the period from the Income row's pay schedule**, and divide a
  monthly bill by the pay frequency: 4.333 weekly, 2.1667 bi-weekly, 1 monthly.
- **C — find the period from the pay schedule**, and divide a monthly bill by
  the number of paydays that actually fall in that month.

**Chosen: B.** The pay period comes from an Income row's pay schedule: its
first pay date and its frequency, Weekly, Bi-weekly or Monthly (START
HERE!C8:C14 and E8:E14, the plan's `pay_schedules` table, §4). A monthly
bill is divided by the pay frequency.

- **The period.** From one payday up to the day before the next. Weekly and
  bi-weekly paydays fall every 7 or 14 days from the first pay date. Monthly
  ones fall on the first pay date's day of each month; a day the month lacks
  pays on its last day, as D6 treats a due day, so a first payday on the 31st
  pays on 28 February and the period runs to 30 March.
- **The split.** A monthly amount shown in a pay period is × 12 ÷ 52 weekly,
  × 12 ÷ 26 bi-weekly and × 1 monthly: the 4.333 and 2.1667 put to the owner,
  exactly (52 ÷ 12 and 26 ÷ 12). The example given with the question was
  $1,600 rent, about $738 a bi-weekly period. It replaces F8's due-day rule on
  this screen: the share counts in every period, whatever the day paid, as
  the workbook's ticked Split does. Real rows in the period count as they are, and
  a bill with one shows it instead of its share (F3, D5).

A split that divides money also needs a rounding rule, and B does not give
one. These are engineering defaults, recorded 2026-09-23 (S15b):

- **Rounding.** Worked in integer cents and rounded half-up to the cent:
  $1,600 × 12 ÷ 26 = $738.4615… is **$738.46**; weekly, $369.23. With 52 and
  26 as divisors a half cent cannot arise, so this is rounding to the
  nearest cent. Each row rounds on its own and a block adds the rounded
  rows, so a total can be a cent or two away from the monthly total divided.
- **Budgets and goals.** The month's budgets and goals, as the Month
  resolves them (D12), are split the same way. The workbook types a separate set per
  period on the Paycheck tab (D22:W44, Q10:Q16, W10:W16); the app stores none,
  and a budget the owner already typed per month is the one they meant.
- **Which month's amounts.** The month the payday starting the period falls
  in, so a period from 28 January to 10 February shows January's rent and
  budgets. This copies the workbook: `Paycheck Budget!E50` finds its month
  from the start date alone (`DATE(YEAR($D$6),MONTH($D$6),1)`).
- **Before the first payday.** The schedule runs back as well as forward, so
  stepping back past the first pay date shows the periods the same schedule
  gives. The workbook's Bill Calendar is not consistent here: its bi-weekly paydays
  go back before START HERE!C8, and its weekly and monthly ones do not.

---

## F16 — Remaining and Difference on a row with no budget or goal

**Decided 2026-09-23. Engineering default: copies the workbook where it has
the column, and shows nothing where it has none.**

```
Jan!V22   =T22-U22        (Remaining, Variable expenses; a blank T22 reads as 0)
Jan!V21   =SUM(V22:V45)   [800]    Jan!D13 =V21
Jan!V11   =U11-T11        [0]      (Difference, Savings; Travel Fund, T11 blank)
Jan!V9    =SUM(V10:V16)   [-3000]
Jan!B20:E20, H20:K20, M20:P20   Categories · Budgeted · Actual   (no Remaining)
Jan!M8:P8                       Income Streams · Goal · Actual   (no Difference)
```

A budget or goal can be missing: never typed, or typed as "no budget" from a
month on (D12). The workbook reads a blank as 0 in every formula, so it has no
missing case. The engine keeps "no budget" apart from $0, and so has to say
what each column shows without one.

**Chosen:**

- **Variable expenses.** Remaining is Budget − Actual; with no budget it is
  0 − Actual, F5's reading of a blank applied to each row. The rows then add
  up to the block's Remaining (V21), which is Left to spend (D13).
- **Savings.** Difference is Actual − Goal (F6); with no goal it is what was
  saved, as V11 reads a blank goal. The rows then add up to V9, which stays
  total saved − total goals.
- **Bills, Debts and Subscriptions.** The workbook has no Remaining column here. The
  app's is Budget − Actual where a budget is set, and empty where none is:
  0 − Actual would show every unbudgeted bill, Rent included, as overspent by
  its whole amount. These lists get no Remaining total, as the workbook has none.
- **Income.** Goal and Actual, with their totals (O9, P9), and no
  difference, as the workbook has.
- **Budget totals** (D21, J21, O21, T21, O9, T9) add the budgets that are set;
  a row with none adds nothing, as `SUM` skips a blank, and a list with none
  totals $0, as the workbook shows.

The row itself always keeps its missing budget, so a screen can tell "no
budget" from "$0". Each branch that reads a missing value as 0 is written out
and cites F5 or this entry; neither is a `?? 0` (CONSTRAINTS.md floor).

**What the owner would see.** A savings fund with no goal shows what went
into it as its Difference, and a bill with no budget shows no Remaining.
Neither changes any cached value.

---

## F17 — What a share is, for the Month's charts

**Decided 2026-09-23. Engineering default: changes no cached value.**

```
Jan chart13  doughnut, hole 50%   categories Jan!$S$22:$S$45   values Jan!$U$22:$U$45
             data labels off; one colour per row position (dPt idx 0-22)
Jan chart12  stacked columns      Goal Jan!$O$10:$O$16   Actual Jan!$P$10:$P$16
             one value axis, overlap 100
```

The workbook's doughnut sizes each Variable-expenses row by its Actual against the
others, and its income chart draws every Goal and Actual on one value axis.
Neither prints a number, and the cached sample has every U22:U44 at 0 and
U45 empty, so the doughnut is empty and there is no share to copy. The charts' geometry is
arithmetic on money, which invariant 1 puts in `packages/core`, so the engine
has to say what a share is — including for a row that refunds have taken
below zero (D8), which no slice of a doughnut can draw.

**Options considered**

- **A — a share of the rows above zero.** A row's share is its Actual over the
  sum of its block's Actuals that are above zero. A row at or below zero has
  none and is left out of the ring; the Month names a row below zero beside
  it, and a row at zero has nothing to name.
- **B — a share of the block's total.** With a row below zero the shares add
  to more than the whole, and the slices cannot close a ring.
- **C — a share of the absolute values** (what a spreadsheet pie does with a
  negative). A $45.99 refund would be drawn as $45.99 of spending.

**Chosen: A.** It is the only one of the three a ring can draw that does not
show a refund as spending.

- **`shareBp`** on every row of every block: its Actual × 10,000 over the sum
  of the block's Actuals above zero, rounded half-up to a basis point as F13
  rounds. Null when the row's Actual is not above zero, or nothing in the
  block is. Rounded shares can miss 10,000 by up to half a basis point a
  row (seven equal rows add to 10,003); the ring stops at the whole, and a
  shortfall of a few basis points is narrower than the gap between slices.
- **Goal bars** (`goalBars`): each income row's Goal and Actual in basis points
  of the largest Goal or Actual among the rows given, rounded half-up, so every
  bar is drawn to one scale, as chart12's single axis draws them. An Actual
  below zero has no bar; a row with no goal has no track.

**What the owner would see.** The ring's slices and each income bar's length.
A category whose refunds beat its spending is named under the ring instead
of being drawn.

---

## F18 — The Year's biggest expense, top 3 and best savings month

**Decided 2026-09-23. Engineering default: the one reading that agrees with
decisions already made (D5, which the owner chose as decision 3; D13; F10;
F14).** It changes numbers the owner will see on the Year, so it is listed
for them in the S13b report.

```
Hidden!P38:Q40  =QUERY(M73:O119, "SELECT M,O ORDER BY O DESC LIMIT 3")
                [Rent 9600; Student Loan 650; Credit Card 1 600]
Hidden!O73      =SUMIFS(Bills!D:D,Bills!C:C,$M73)*12 + (the same for H and L)*12
                 + SUMIFS(Bills!Q:Q, …, O20..P20) + SUMIFS(Transactions!D:D, …, O20..P20)
Hidden!O20:P20  =DATE(YEAR(M18),1,1) .. DATE(YEAR(M18),12,31)     M18 =TODAY()
Hidden!R38      =O120 =SUM(O73:O119)   [11065.88]    Q43 =R38-Q42 ("Other Expenses")
Hidden!M73      FILTER(Hidden!B3:B157): Variable expenses, Bills, Debts, Subscriptions
Hidden!I60:K60  =QUERY('Annual Budget'!U10:X21, "SELECT U,V,W ORDER BY W DESC LIMIT 3")
                [2025-01, 3000, 0]
```

The workbook's Home ranks each category by a third measure of a year: twelve
times its monthly amount, whatever month it started, plus the logged
payments and transactions of today's calendar year. A bill both planned and
logged counts twice, and a bill set up in October counts twelve months. The
top 3's cached values depend on today's date, so none is a golden value
(plan §5.4).

**Options**

- **A — the Year's own Actuals.** Each Bills, Debts, Subscriptions and
  Variable expenses category's Actual over the Year's twelve months, counted
  as the month rows count it: a real charge replaces the plan (D5), a plan
  counts from its month (D13) and only up to asOf (F10).
- **B — the workbook's measure:** twelve times the monthly amount, plus the rows of
  asOf's calendar year.
- **C — A, with every month's planned amounts counted**, a projection of the
  whole Year.

**Chosen: A.** B counts twice what the owner chose to count once (decision
3) and prices a bill for months before it existed (D13). C ranks categories
by amounts the Year's own Expenses total leaves out, so a share would be of
a whole shown nowhere. A is the only reading in which the top 3 agree with
the Year around them.

- **Top 3.** Categories with a Year Actual above zero, highest first. Equal
  amounts keep the workbook's list order (Hidden!B3:B95: Variable expenses, Bills,
  Debts, Subscriptions), then Setup's row order. `shareBp` is the amount
  over the sum of every category's Year Actual above zero, half-up (F17),
  which is the workbook's doughnut: the category against its "Other Expenses".
- **Biggest expense** is the first of the top 3, and none when nothing was
  spent.
- **Best savings month** is the month with the largest Savings Actual, the
  earliest of equals, as QUERY keeps row order; with nothing saved it is the
  first month at $0, as the workbook shows January. Its goal comes with it (J60).
  Home's red "↓ −$90" beneath it subtracts two date serials and shows the
  difference as dollars; it has no meaning to carry over and is not built.

**What the owner would see.** In September, on a Year from January,
"Biggest expense" is the year so far (Rent at $1,600 is $14,400 by then),
not a year projected from monthly amounts. If they want the projection, it
is C, and changes the three cards only.

---

## F19 — What a share is, for the Year's charts

**Decided 2026-09-23. Engineering default: changes no cached value.** It
follows F17 and F18, so each chart agrees with the Year's own totals beside
it.

```
chart40  stacked column, overlap 100   cats 'Annual Budget'!I10:I21
         series K10:K21 (income Actual, #D7EEEB), Q10:Q21 (expense Actual, #F9D7D2)
chart41  pie, varyColors               Hidden!I40:J42 = Annual H6, N6, T6
         (Income, Expenses, Savings; #D7EEEB, #F9D7D2, #F7EAA9, no labels)
chart42  clustered column               Hidden!I32:K37: Goal J32:J37, Actual K32:K37
         (= Annual J9 V9 V29 D29 J29 P29 and K9 W9 W29 E29 K29 Q29; #517070, #E6E1CE)
Home chart3  the same pie as chart41 in Home's colours, percent labels only
Home chart9-11  one doughnut per top-3 row, hole 75%: the row against R38 − it
```

None of the five prints a number, and the sample draws them from cells the
Year recomputes (D7, F12, F18), so there is no cached share to copy. Their
geometry is arithmetic on money, which invariant 1 puts in `packages/core`.

**Options considered**

- **A — F17's rule for every chart.** A part is drawn only above zero, and
  its share is of the parts above zero, half-up to a basis point; bars share
  one scale, the largest thing drawn.
- **B — shares of the Year's signed totals.** A refund-heavy month or a
  negative Left over would give parts that add to more than the whole.
- **C — draw chart40 as a clustered column.** Its stack adds income to
  expenses, a height that means nothing, but the plan (§6.4) asks for
  the workbook's stack, so A keeps it.

**Chosen: A.**

- **Stacked column** (chart40): each month's column is its income Actual
  with its expense Actual stacked on it, as the workbook stacks them. A part at or
  below zero is not drawn. Core gives each drawn part where it starts and
  ends, in basis points of the tallest column, half-up, so parts meet
  exactly and no column passes the top.
- **Pie** (chart41, Home chart3): Income, Expenses and Savings Actuals over
  the twelve months (the Year's totals, D7), each over those of the three
  above zero, half-up. The workbook's pie mixes money in with money out; so does
  this, as the plan asks.
- **Clustered column** (chart42): Goal and Actual for Income, Savings,
  Variable expenses, Bills, Debts and Subscriptions over twelve months, on
  one scale, the largest Goal or Actual, as `goalBars` (F17) draws the
  Month's income. The workbook's J9, V9 and W9 add seven months (D7); these add
  twelve.
- **Top-3 doughnuts** (Home chart9–11): each row's `shareBp` from F18, the
  rest of the ring the track, as the workbook's "Other Expenses" is.

**What the owner would see.** The charts' shapes. The numbers written
beside them are the Year's own.

---

## F20 — What the Bill Calendar puts on a day, and what it adds up

**Decided 2026-09-23. Engineering default: copies the workbook except where
D5 (owner chose), D19, D20 and D21 depart from it.**

```
Bill Calendar!G3   2025-01-01 (the month, typed)
Bill Calendar!H9   FILTER({Bills!C7:D29; G7:H29; K7:L29; P7:Q30},
                          ({Bills!B7:B29; F7:F29; J7:J29; O7:O30} = H8)
                        + ({same} = DATE(YEAR(G3), MONTH(G3), H8)))     [Rent, 800]
Bill Calendar!M14  FILTER('START HERE'!B8:B44, E = "Bi-weekly",
                          C <= date, (date − C) / 14 whole)              [Income 1]
Bill Calendar!Q8   =SUM(C9:C13, E9:E13, …, O9:O13)                       [800]
Bill Calendar!J3   =SUM(Q8:Q43)                                          [1167.99]
```

The calendar lays a month out Sunday first (B6 "S U N D A Y"). Each day
lists the bills, debts and subscriptions whose Day Paid is that day, and the
Bills log's payments dated that day; the right-hand cell of the day's
number names an income source paid that day. Each week has a total, and the
month a total of the weeks.

**Chosen.**

- **Planned against real (D5, owner's decision 3).** A bill, debt or
  subscription with a real ledger row anywhere in the month shows each of
  those rows on its own date, and its monthly amount is not shown that
  month. With none, its monthly amount in effect that month (D13) shows on
  its due day. So Credit Card 1 in January 2025 shows $200 on the 5th and
  nothing on the 14th, where the workbook shows both: Q20 is 100, not **150**, and
  J3 1,117.99, not **1,167.99**. The month's total is therefore the Month's
  Bills + Debts + Subscriptions Actuals for the same month, except as below.
- **A monthly amount with no day paid** is on no day and in no total, as in
  the workbook (a blank B7 equals no day). The screen lists it under the calendar
  as having no day paid, so it is not lost. The Month still counts it (F8):
  a whole month counts every plan.
- **Paydays** come from the pay schedules of categories on Income only
  (N27), on each payday from the first pay date on, as the workbook's `C <= date`
  asks; before the first pay date there are none. Weekly and bi-weekly ones
  fall every 7 or 14 days, monthly ones on the first pay date's day of each
  month (D21 for a day the month lacks). A payday shows the income source's
  name and never an amount, as the workbook does.
- **A real row is shown as the workbook shows a payment**, positive when money
  went out (D3), each row by itself; a refund shows with its minus sign
  (D8). Rows on other lists are not on the calendar.
- **Weeks** hold only the days of the month; a week total adds its days'
  amounts (Q8), and the month total its weeks (J3). The calendar has as many
  weeks as the month touches, four to six; the workbook always draws six bands and
  leaves the spare ones blank (Q38 **0**).
- **Order within a day** is the workbook's stack, Bills then Debts then
  Subscriptions, each in Setup's order. A real charge takes its bill's
  place in that stack; the workbook lists its logged payments after every monthly
  amount, in the log's order (H9's `{…; Bills!P7:Q30}` comes last). Only the
  order on the day differs, never an amount or a total.

**What the owner would see.** Bills paid by card on the day they were
charged, and never twice (decision 3).

---

## F21 — A savings fund's months remaining and monthly contribution

**Decided 2026-09-23. Engineering default: copies the workbook, except
where D15 and D22 depart from it and D16 (owner chose) supplies the
current amount.**

```
Savings!B9   =SUM(B7-B5)                                        [1867]
Savings!V14  =IF(OR(ISBLANK(N14),ISBLANK(R14)),"",DATEDIF(N14,R14,"M"))   [21]
Savings!Z14  =IFERROR((F14-J14)/V14, 0)                         [88.9047619]
             F14 = B7 (goal), J14 = B5 (current amount), N14 2024-01-08, R14 2025-10-08
```

**Chosen.**

- **Amount needed** is the goal less the current amount, with no floor, as
  B9 has none: a fund past its goal shows how far past it is, with its
  minus sign (D8). The screen says the goal is reached beside it.
- **Months remaining** is `DATEDIF(start, goal, "M")`: whole calendar
  months from the start date to the goal date, one fewer when the goal
  date's day of the month is before the start date's (2024-01-31 to
  2024-02-29 is 0). It is measured from the typed Start Date, not from
  today, as V14 is, so it does not count down as time passes.
- **Monthly contribution** is the amount needed over the months remaining,
  rounded up to the cent (F9). The current amount in it is the fund's
  balance on the day it is read (D16), where the workbook's J14 is whatever was
  last typed in B5.
- **No dates** gives no months and no contribution (D15). **A goal date
  before the start date, or in the start date's own month**, gives no
  contribution (D22); the months are shown as 0 in the second case, as V14
  shows them, and not at all in the first, where V14 shows `#NUM!`.

**What the owner would see.** The workbook's figure, to the cent. Because the
months are counted from the start date, the monthly figure goes down as the
fund fills, not up as the goal date nears; that is also what the workbook does
each time its current amount is retyped (NOTICED N54).

---

## F22 — What a debt's status is on a day

**Decided 2026-09-23. Engineering default: copies the workbook, read at an
explicit day instead of today.** The final month's interest is D24 (owner
chose). Whether recorded payments move a debt's balance is not decided
(NOTICED N53); until it is, balances come from the schedule alone, as
the workbook's do.

```
Debt Calculator!H9    =INDEX(J26:J496, MATCH(EOMONTH(TODAY(),-1)+1, $C$26:$C496))  [11356.30966]
Debt Calculator!B10   =SUM(H9, M9, … DN9)                                         [11913.52651]
Debt Calculator!E20   =100%-(B10/D26)                                             [0.4518231949]
Debt Calculator!I495  =J18-H9  ("Balance Paid")    I496 =H9  ("Remaining Balance")
Debt Calculator!D27   =SUM(J26, O26, … DP26)   [20958]   E26 =SUM(I26 …)+SUM(H26 …)   [775]
```

**Chosen.**

- **The day.** `debtStatus` takes `asOf` and finds the schedule row of
  `asOf`'s month, as H9 finds the row of today's month. The balance is that
  row's closing balance, so the month's payment counts as made from its
  first day, as in the workbook. The cached H9 was worked out in September 2026,
  month 19 of the sample; the golden test asserts month 19 by its index,
  never by today (CLAUDE.md).
- **Paid** is the starting balance less the balance (I495), net of
  interest. The workbook's goes below zero for a debt whose interest outruns its
  minimum; `amortize` refuses such a debt and says which, so here it never
  does. **Remaining** is the balance itself (I496).
- **Progress** is paid over the starting balance, E20, in basis points,
  half-up as F13 and F17 round. With no starting balance at all (no debts,
  or every one typed as 0) there is no progress, where E20 divides by 0.
- **Before a debt's start month** its balance is its starting balance and
  nothing is paid; the workbook's MATCH finds no row there and shows `#N/A`. After
  its last payment, its balance is 0.
- **Totals.** Starting (D26), the balance (B10), paid, progress (E20), this
  month's payments with extras (E column) and the balances this month
  started from (D column: the prior month's closing balances).
- **Start months.** Each debt keeps its own start month (0014); when every
  debt shares one, as all of the sample's do, this is the workbook exactly. The
  debt-free date is the latest payoff month among them (B14).

**What the owner would see.** The workbook's figures, at whichever month the
screen reads, with the cents of D1 and the final-month interest of D24.

---

## F23 — Snowball and avalanche

**Decided 2026-09-23. Engineering default. Not from the workbook**, which
cannot do it (D2): Hidden Debt's ACCELERATOR (CL:DH) is an unfinished stub
whose every cell is 0 or FALSE. So nothing here has a cached value, and the
tests are hand-derived.

**Chosen.**

- **What rolls.** Every month the plan pays out what all the started debts'
  minimums and that month's extras add up to, the same amount the flat plan
  pays while every debt is owed. A cleared debt's minimum, and what is left
  of a payment larger than the balance it clears, go to the next debt in
  order, in the same month.
- **The order.** Snowball: the smallest starting balance first. Avalanche:
  the highest APR first. Ties go by name. The order is set once from what
  was typed, not re-sorted as balances change, so it is the list a person
  would write down and work through.
- **Everything else is `amortize`'s:** no interest in a debt's first month,
  interest half-up to the cent (D1), the final month charged (D24), each
  debt from its own start month; a debt that has not started takes no
  rolled money. The flat plan is `amortize` itself, and the tests check that
  it gives the golden debt-free date.
- **Shown** side by side: each plan's debt-free date and its total interest.

---

## F24 — Where the records start (history start)

**Decided 2026-09-24. Engineering default. Not from the workbook,** which
never compares one period with another. Decided by the engineer under the
owner's 2026-09-24 instruction to proceed without questions
(`docs/ai-first-plan.md` §6, §11).

**Chosen.**

- **History start** is the earliest first day of any imported statement's
  period (`ingest_batches.period_start`, 0007). With no statement that has a
  period, it is the earliest date in the ledger. With neither, there is none.
- **A statement wins over an earlier typed row.** Card charges are most of
  the spending, so a month is only whole from the first statement on. A
  coffee typed before it would otherwise open a month holding one coffee,
  and every comparison with it would read as a huge rise.
- **A window that starts before history start is never compared or used as
  a baseline.** A month before the records is missing, not $0.
- **For later slices, recorded now:** a *complete month* lies wholly between
  history start and the first day of `asOf`'s month; the evidence is *thin*
  with 0–2 complete months, *some* with 3–5, *solid* with 6 or more.

**Worked example.** Statements for 8 Aug – 7 Sep and 8 Sep – 7 Oct 2026, and
cash typed on 2 Aug. History start is 8 Aug. On 24 Sep the earlier window,
1–24 Aug, starts on 1 Aug, before it, so the Month compares nothing and says
"Import the statement before 8 Aug to compare with August". On 10 Oct the
earlier window, 1–10 Sep, is inside the records and is compared.

---

## F25 — Which days are compared (comparison windows)

**Decided 2026-09-24. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions.

**Chosen, for a month** (built in plan slice A03):

- **The month running** (the month holding `asOf`, on its day *d*): days
  1..*d* of it, against days 1..min(*d*, last month's length) of the month
  before. Like for like: a month two-thirds through is never set against a
  whole one.
- **A month already over:** the whole month against the whole month before.
- **A month not started yet:** no comparison. Nothing has happened in it.
- **Both sides go through `periodSheet`,** each with its own month's budgets
  (D12) and monthly amounts (D13), so F8 applies to each side the same way:
  a partial window counts a planned bill only on its due day, and a due day
  of 29–31 counts on a short month's last day (D6).
- **Consequence, said on screen:** a same-days figure is not the Month's
  Spent, which counts every planned bill for the whole month. So the Month
  names both same-days figures and both windows, and never puts a change
  under Spent.

**Worked examples.** On 24 Sep 2026: 1–24 Sep against 1–24 Aug. On 31 Mar
2027: 1–31 Mar against 1–28 Feb (February has no later days, so the earlier
window ends with its month rather than running into March). On 30 Mar 2028:
against 1–29 Feb. August 2026 viewed on 24 Sep: 1–31 Aug against 1–31 Jul.
A rent of $800 due on the 28th, in September viewed on 24 Sep, counts on
neither side; viewed on 28 Sep, on both.

**Chosen, for the other screens** (built in plan slice A04, 2026-09-24;
decided by the engineer under the owner's 2026-09-24 instruction to proceed
without questions). Each follows the month's three cases: a period still
running is set against the same days of the one before, a period already
over whole against whole, and one not begun is not compared. Every earlier
window is checked against history start (F24).

- **A week** (Monday to Sunday, D14): Monday to `asOf` against the same
  weekdays a week earlier.
- **A pay period** (F15): its payday to `asOf` against the previous payday
  plus the same number of days, capped at that period's last day. Each side
  counts the monthly amounts of its own payday's month as a pay period's
  share, whatever their due day, as the Paycheck does (F15, D18).
- **A Year** (F14's twelve months): its first day to `asOf` against the same
  days a year earlier; a Year already over against the twelve months before
  it. A day the earlier year lacks (29 February) ends on its month's last
  day, as a month's window does. Each side is counted month by month, each
  month with its own amounts (D13), so a planned bill counts only on its due
  day in a month still running (F8). That is why the Year names the
  comparison's figures on their own rather than setting them under its
  totals, which count this month's planned bills whole (F10).
- **Savings:** saved this month is the Savings block's Actual, for each fund
  and in total, over the month's windows above.
- **Debts:** the balance each debt's schedule gives at the end of `asOf`'s
  month (F22) against the end of the month before. It comes from the typed
  debts, not the records, so history start does not bound it. Less is
  "good". Before a debt's start month both are its starting balance.

**Worked examples.** On Thursday 24 Sep 2026: the week 21–24 Sep against
14–17 Sep. Paid every two weeks from Friday 18 Sep: 18–24 Sep (six days on)
against 4–10 Sep. Paid monthly on the 1st, on 31 Mar 2027: 1–31 Mar against
1 Feb plus 30 days, capped at 28 Feb. The Year January to December 2026 on
24 Sep 2026: 1 Jan–24 Sep 2026 against 1 Jan–24 Sep 2025; with records from
8 Aug 2026 that earlier window lies before them, so nothing is compared. A
Year from March 2027 on 29 Feb 2028: 1 Mar 2027–29 Feb 2028 against 1 Mar
2026–28 Feb 2027. A debt at $5,000.00 after August's payment and $4,850.00
after September's, on 24 Sep: "$150.00 less" than a month ago.

---

## F26 — A change, its percentage and its direction

**Decided 2026-09-24. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions.

**Chosen.**

- **Change** = now − before, on the Actuals as the Month shows them (spent,
  received or saved, positive), in cents.
- **Percentage,** in basis points: |change| × 10000 ÷ |before|, rounded
  half-up, carrying the change's sign, so a rise and a fall of the same
  size read the same. **None when before is $0:** the amount shows, a
  percentage never does.
- **Direction:** under 100 cents either way is *same*; otherwise *more* or
  *less*.
- **Meaning, by list:** on Variable expenses, Bills, Debts and
  Subscriptions (and Spent), *more* is "watch" and *less* is "good"; on
  Income and Savings, *more* is "good" and *less* is "watch"; *same* means
  nothing. Every change is written in words, never shown by colour alone.
- **Words:** "$40.00 more", "$40.00 less", "about the same".

**Worked examples.** Spent 1–24 Aug $1,180.00, 1–24 Sep $1,020.00: change
−16000 cents; 16000 × 10000 ÷ 118000 = 1355.93, so −1356 bp, "$160.00 less",
shown as 14%; good. Before $0.00, now $25.00: change 2500, no percentage.
Before $10.00, now $10.99: change 99, *same*, "about the same".

---

## F27 — A category's usual month, and when a change is worth a card

**Decided 2026-09-24. Engineering default. Not from the workbook,** which
keeps no history across months. Decided by the engineer under the owner's
2026-09-24 instruction to proceed without questions
(`docs/ai-first-plan.md` §6, §11; built in slice A07).

**Chosen.**

- **Median** of a list of whole cents: the middle value once sorted; with
  an even count, the two middle values added and halved, half-up on the
  magnitude with the sign kept (as F26 rounds). None for an empty list.
- **Quantile by nearest rank:** for a share `p` in basis points, the value
  at rank ⌈p × n ÷ 10000⌉ (at least 1) of the list sorted ascending. No
  averaging between ranks, so every quantile is a month that happened.
- **Usual month:** the median of a category's totals over up to its **6
  most recent complete months** (F24). A month outside what was read is not
  complete either: the Coach reads twelve months back, the Month only last
  month, and a month neither read is missing, not $0.
- **MAD** (median absolute deviation): the median of each of those months'
  distance from the usual month.
- **The band,** for a whole month: with 3 or more complete months,
  max(2500, 15% of the usual month half-up, 3 × MAD); with 1 or 2,
  max(2500, 25% of the usual month half-up). With none, there is no band
  and no category change is reported.
- **For a window of d days in a month of D,** the band is scaled by d ÷ D,
  half-up, and never below 2500.
- **The summary's band** (this month and this week against the same days
  before, F25) is max(2500, 15% of the earlier figure, half-up). It needs
  only the two windows, so the Month can size it from the two months it
  already reads and get the Coach's answer.
- **Size:** under one band is *slight*; from one band to under two is
  *clear*; two bands or more is *big*. A change is **notable**, and can
  become a card, when it is clear or big.
- **Which change, in digest version 1:** a Variable expenses row's Actual
  over days 1..d of this month against the same days of last month (F25),
  the figure the Month's "vs" column shows, so the Coach and the Month
  agree. Bills, Debts and Subscriptions wait for the price-rise detector
  (F38): a change there is a bill moving, not a habit.
- **Evidence** (F24) is counted from the complete months the change's band
  used. A summary compares two windows and uses no baseline, so its
  evidence is *thin* by definition, on the Month and on the Coach alike.

**Worked example.** Dining out's six complete months, March to August:
$300, $420, $360, $510, $390 and $450. Sorted, the middle two are $390 and
$420, so the usual month is $405.00. The distances are $105, $15, $45,
$105, $15 and $45; their median is $45.00, the MAD. The band is
max($25.00, $60.75, $135.00) = $135.00. On 24 September (d = 24, D = 30)
it is $135.00 × 24 ÷ 30 = $108.00. Dining out 1–24 September $520.00
against 1–24 August $307.60 is $212.40 more: 1.97 bands, *clear*, so a
card. The Month's summary on the same day, $1,020.00 against $1,180.00:
the band is max($25.00, $177.00) = $177.00, and $160.00 less is *slight*.
The coach line still says it; it is not a card.

---

## F28 — A category's pace this month

**Decided 2026-09-24. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §5, §11; built in slice A07).

**Chosen.**

- **From day 7 of the current month,** a category's Actual so far scaled to
  the whole month: `actual × D ÷ d`, half-up on the magnitude. Before day 7
  there is too little to scale (a week's groceries would read as a month's
  four times over), and a past month has its real total, so neither has a
  pace.
- **Over budget by** `pace − budget`, when a budget is set and that is above
  0; otherwise none.
- **Over and near budget, in the digest,** on Variable expenses with a
  budget above $0: *over* when the Actual is above the budget, by
  `actual − budget`; *near* when the Actual is at least 90% of the budget
  and not above it (`actual × 10000 ≥ 9000 × budget`), with `budget −
  actual` left. A category over its budget is not also near it, and has no
  pace fact: it is already there.
- **Notable:** over budget by $1.00 or more (F26's "same"); near budget
  always; a pace over budget by at least max(2500, 15% of the budget,
  half-up), since a pace is an estimate and a few dollars over is noise.

**Worked example.** On 24 September (d = 24, D = 30), Dining out $360.00 so
far with a budget of $400.00: pace $360.00 × 30 ÷ 24 = $450.00, over by
$50.00; the notable line is max($25.00, $60.00) = $60.00, so no card. It is
also near budget: $360.00 is 90% of $400.00, with $40.00 left. On 6
September, no pace. August viewed on 24 September: no pace.

---

## F44 — Impact, for ranking the Coach's cards

**Decided 2026-09-24. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §2.3, §11; built in slice A07).

**Chosen.**

- **A fact's monthly effect,** in cents, always positive: a change scaled to
  a whole month, `|change| × D ÷ d`, half-up; a pace over budget, `pace −
  budget`; over budget, `actual − budget`; near budget, the `budget −
  actual` left. Later slices add a lever's monthly saving, a subscription's
  monthly cost and an unusual charge's amount.
- **Impact** = effect × evidence weight: *thin* 1, *some* 2, *solid* 3.
  A change's evidence is its history's (F27). Over and near budget set a
  charge against the owner's own number, not an estimate, so they are
  *solid*; a pace is an estimate from the days so far, so it is *some*.
- **Always first:** stale data, when the latest statement ends more than 10
  days before `asOf` (a stale ledger makes a coach confidently wrong); then
  rows waiting in Review. Neither is ranked by money.
- **Only notable facts** (F27, F28), and the kinds that are always notable
  (stale data, waiting rows; later milestones, price rises and possible
  double charges), become cards. The summaries are the coach line, not
  cards.
- **The digest keeps at most 12 facts:** stale data, waiting rows, the two
  summaries, then the rest by impact, largest first, ties by key.
- **The day's rotation** (`dailyIndex`, for picking among equals without
  randomness): the days from 1 January 1970 to `asOf`, modulo the count.

**Worked example.** On 24 September: Dining out $212.40 more than the same
days of August, with 6 complete months: effect $212.40 × 30 ÷ 24 = $265.50,
*solid*, impact 79650. Groceries over its $500.00 budget by $30.00: effect
3000, *solid*, impact 9000. Dining out ranks first; a statement ending on
6 September (18 days before) would rank above both.
