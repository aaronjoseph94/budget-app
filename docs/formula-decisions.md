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

## F29 — Pay still due this month

**Decided 2026-09-25. Engineering default. Not from the workbook,** which
has no forecast of any kind. Decided by the engineer under the owner's
2026-09-24 instruction to proceed without questions (plan §5, §11; built
in slice A13).

**Chosen.** For each category on the Income list, in the list's order:

- **With a pay schedule** (0011; a schedule left on a category moved off
  Income pays nobody, N27): its paydays after `asOf` and in `asOf`'s month,
  counted from its first pay date on, as the Bill calendar counts them
  (every 7 or 14 days, or monthly on the first pay date's day, a short
  month paying on its last day: F15, D21). Each payday brings its **usual
  pay**: the median (F27's) of its **last 3 receipts**, where a receipt is
  one of its ledger rows above $0, dated inside the records (F24) and on or
  before `asOf`; the latest by date, the larger first on the same day.
  With no receipt yet, the month's Income Goal for it (D12) shared across
  a pay period as the Paycheck shares it (F15's `payShare`: × 12 ÷ 52,
  × 12 ÷ 26 or × 1). With neither, it brings nothing counted.
- **With no schedule and a Goal:** `max(0, goal − received)`, where
  received is its Income Actual this month. It has no day.
- **With neither,** it is *not counted*, and the forecast says pay from it
  is left out rather than treat it as $0. One that has also never paid
  inside the records (a starter list's spare row, such as Donations) is
  *idle* and is not named: it is no pay left out. Added 2026-09-25 while
  building, when the preview named three spare rows on every card.

Pay still due is the sum of what each counted source brings. A source whose
pay is not counted is named, so "pay not included" is never silent.

**Where it departs from the plan.** The plan's no-receipt rule was "the
monthly goal ÷ paydays in the month (F15's `payShare`)". Those are two
different rules; `payShare` is chosen, because it is the share the Paycheck
screen already shows for the same goal, and a two-payday month and a
three-payday month then give each payday the same amount, as a salary does.

**Worked example.** Thursday 24 September 2026 (the running example for
F29 to F32). Pay is paid bi-weekly from 5 June 2026; its paydays are 11
and 25 September, so one, the 25th, is still due. Its latest receipts:
$2,080.00 on 14 August, $2,150.00 on 28 August and $2,100.00 on 11
September; the median is $2,100.00, so pay still due is **$2,100.00**.
With no receipt and a Goal of $4,550.00: $4,550.00 × 12 ÷ 26 = $2,100.00
a payday. With no schedule, a Goal of $4,550.00 and $2,100.00 received:
$2,450.00. With no schedule and no Goal: not counted.

---

## F30 — Where the month ends: a range, or one rough figure

**Decided 2026-09-25. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §5, §11; built in slice A13).

**Chosen.** On day *d* of a month of *D* days:

- **Scenarios for Variable spending still to come.** From day 7, *this
  month's pace*: the Variable block's Actual so far scaled to the month
  (`actual × D ÷ d`, half-up, F28's scaling), less the Actual. And for each
  of up to the **6 most recent complete months** *i* (F24): its Variable
  Actual `V_i` over its `D_i` days, for the days left:
  `(D − d) × V_i ÷ D_i`, half-up. A scenario below $0 (refunds) is $0.
- **The end, per scenario:** `start + income received + pay still due (F29)
  − Spent (F7, planned bills counted, F3) − variable still to come − saved −
  savings still planned`, where savings still planned is
  `Σ max(0, goal − actual)` over the Savings rows with a goal this month.
- **The range** is the lowest, the median (F27's) and the highest of the
  scenarios' ends, each **rounded half-up to $10** on the magnitude
  (−$15.00 is −$20). Shown without cents.
- **Rough.** Before day 7, or with fewer than 3 complete months, the
  forecast is one "about" figure, the median, labelled rough, never an
  invented range. Before day 7 with no complete month there is nothing to
  go on: it says "check back on the 7th".
- **No balance without a typed start (D17).** With none, the ending
  balance is not forecast, and **the projected Spent** (Spent + variable
  still to come, per scenario, rounded the same way) still shows.
- **What is still to come** is shown beside it: pay still due, **bills not
  charged yet** (the planned amounts in Bills, Debts and Subscriptions that
  no real charge has replaced, D5; already inside Spent), Variable spending
  still to come (the median scenario, rounded to $10), and savings still
  planned.
- **Evidence** (F24) is counted from the complete months used.

**The Month's End of month does not change** (F7). The forecast adds pay
still due, Variable spending still to come and savings still planned; the
Month shows it on its own line, labelled "Forecast" (D27).

**Worked example.** 24 September 2026, records from 1 June, so June, July
and August are complete (*some*). Start $2,000.00. Received: $2,100.00 of
pay on 11 September. Pay still due $2,100.00 (F29). Spent $2,180.00: Rent
$1,200.00 paid on the 1st, Phone $60.00 due on the 28th and Internet $80.00
due on the 20th, neither charged yet (planned, so $140.00 of bills not
charged yet), and $840.00 of Variable expenses. Saved $300.00 into the
Flight fund, whose goal this month is $500.00: $200.00 still planned.
Before spending still to come: 2,000.00 + 2,100.00 + 2,100.00 − 2,180.00 −
300.00 − 200.00 = $3,520.00. Scenarios: pace $840.00 × 30 ÷ 24 = $1,050.00,
so $210.00 to come; June $900.00 over 30 days, 6 × 900.00 ÷ 30 = $180.00;
July $1,240.00 over 31, $240.00; August $1,054.00 over 31, $204.00. Ends
$3,280.00, $3,310.00, $3,316.00 and $3,340.00; the median is ($3,310.00 +
$3,316.00) ÷ 2 = $3,313.00. **The range: $3,280 to $3,340, most likely
$3,310.** Projected Spent: $2,360, $2,390 and $2,420. On 5 September with
the same three months: rough, one figure from the months alone (25 days
left: $750.00, $1,000.00 and $850.00; the median $850.00). On 5 September
with records from 8 August: nothing, "check back on 7 Sep".

---

## F31 — Safe to spend, a day

**Decided 2026-09-25. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §5, §11; built in slice A13).

**Chosen.**

- **Available** = `start + income received + pay still due (F29) − Spent
  (F7) − saved − savings still planned (F30)`: what is left once every
  planned bill, the pay still to come and the savings still planned are
  counted, for Variable spending and anything unplanned.
- **A day** = available ÷ the days left **including today** (`D − d + 1`),
  **rounded down** to the cent, so following it never overspends by a
  rounding.
- When available is **$0 or less**, it is $0 a day and says "nothing left
  to spend safely this month", never a negative daily figure.
- **None without a typed start (D17).** A pay source not counted (F29) is
  named beside it, since the figure is then lower than it will be.

**Worked example.** 24 September 2026, as in F30: available is $3,520.00,
over 30 − 24 + 1 = 7 days: 352,000 ÷ 7 = 50,285.71 cents, so **$502.85 a
day for 7 days**. With $3,519.95 overspent instead (available −$0.05):
$0.00, nothing left to spend safely.

---

## F32 — The next 30 days, and the tightest day

**Decided 2026-09-25. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §5, §11; built in slice A13).

**Chosen.**

- **Today's balance** = `start + income − spending − saved`, counting only
  real ledger rows dated from the 1st to `asOf`: spending is Bills, Debts,
  Subscriptions and Variable expenses as the Month nets them; a planned
  bill not yet charged is not in it.
- **Each of the 30 days after `asOf`**, in order:
  - **pay:** each scheduled Income source's paydays (F29's days, from its
    first pay date on), each bringing the per-payday amount F29 gives it
    this month (its usual pay, or its goal's share); a source with no
    schedule has no day and is left out;
  - **bills:** each Bills, Debts or Subscriptions amount in effect in that
    day's month (D13) on its due day, a 29th to 31st on a short month's
    last day (D6), unless a real charge in that month already replaced it
    (D5). One in `asOf`'s month whose day has come (on or before `asOf`)
    with no charge yet, or which has no due day, counts **tomorrow**, as
    "due, not seen yet". One with no due day in a later month counts on
    that month's 1st;
  - **Variable spending:** a daily amount, the real Variable spending over
    the last `min(90, days of records)` days (from the latest of history
    start, the first day read and `asOf` − 89, to `asOf`) ÷ those days,
    half-up; below $0 is $0. Only with **14 days or more** of records;
    with fewer, it is left out and the card says so.
- **The line** is today's balance, then each day's. **The tightest day** is
  the lowest of the 30, the earliest on a tie. **Bills due in the next 7
  days** are those on days `asOf + 1` to `asOf + 7`, in date order.
- **Savings not yet moved are left out,** and the card names savings still
  planned (F30) so the owner knows.
- **No balance without a typed start (D17):** the line and the tightest day
  are not shown, and the bills due in the next 7 days still are.
- **Heights are core's** (`scaleSeries`): each balance as basis points of
  the span from the lowest to the highest value drawn, half-up, so the chart
  divides no money.

**Worked example.** 24 September 2026, as in F30. Today's balance:
2,000.00 + 2,100.00 − (1,200.00 + 840.00) − 300.00 = **$1,760.00**.
Variable spending in the 90 days from 27 June: July $1,240.00, August
$1,054.00 and September $840.00, $3,134.00 ÷ 90 = $34.82 a day. 25
September: +$2,100.00 pay, −$80.00 Internet (due the 20th, not seen yet),
−$34.82: $3,745.18. 28 September: −$60.00 Phone. 1 October: −$1,200.00
Rent, $2,276.26. Then $34.82 a day to **8 October, the tightest day, at
$2,032.52**, the day before payday; 9 October +$2,100.00. Bills in the next
7 days: Internet $80.00 (25 Sep, not seen yet), Phone $60.00 (28 Sep),
Rent $1,200.00 (1 Oct). The $200.00 still to go to the Flight fund is
left out, and said.

---

## F33 — When each savings goal is reached at your pace, and its milestones

**Decided 2026-09-25. Engineering default. Not from the workbook,** whose
Savings tab works a monthly contribution back from a typed goal date (F21)
and never forward from what is really moved in. Decided by the engineer
under the owner's 2026-09-24 instruction to proceed without questions
(plan §5, §11; built in slice A08). The plan wrote it for the flight goal;
G1 made goals plural, so it holds for every active goal.

**Chosen.**

- **The pace comes from what moved in.** A goal's monthly contribution is
  its fund's Savings Actual in each complete month (F24), as the Month's
  Savings block shows it: money moved in, less money taken back out. Up to
  the **6 most recent** complete months are used. A goal on no fund, or on
  a fund no longer on the Savings list (N52), has nothing measured, so it
  has no pace and says so.
- **Low, middle and high.** The middle is the **median** of those months
  (F27's, the middle two halved half-up); the low and high are the **25th
  and 75th percentiles by nearest rank** (F27), so each is a month that
  happened.
- **Weekly** = monthly × 12 ÷ 52, half-up on the magnitude.
- **A date for each** by `projectGoal`: ⌈remaining ÷ weekly⌉ weeks from
  `asOf`. The high pace gives the early date, the middle the middle date,
  the low the late one. A low pace of $0 or less has no late date: the
  range reads "or later".
- **Rough under 3 months.** With 1 or 2 complete months, only the middle
  pace and its one date, labelled rough. With none, no date: the card says
  the month a pace becomes possible, the first of the month after the first
  complete month.
- **No pace.** When the middle weekly pace is $0 or less, there is no date
  ("no date at your current pace"), and the top lever (F34) says how long it
  alone would take.
- **The weekly amount needed** for a goal with a target date after `asOf`
  is `requiredWeeklyContribution`, as written in `goal.ts`; none for a goal
  with no date, a date passed, or the target met.
- **Evidence** (F24) is counted from the months the pace used.
- **Milestones.** A goal with a cost an hour has one every **5 whole hours**
  saved (F45's hours: `timeEquivalent`, minutes half-up, whole hours); any
  other goal one every **tenth of its target** (⌊saved × 10 ÷ target⌋). A
  milestone is **passed** when the saved amount crosses it between the eve
  of the last complete week's Monday and `asOf`, so a new one stays up for
  one to two weeks. Saved then = saved now − what moved into the fund after
  that eve, or after the day its balance was typed if later (D16): a move
  on or before the typed day is already in the typed amount. Only the
  highest milestone passed is named. Nothing at or below $0 is a milestone.

**Worked example.** Thursday 24 September 2026, records from 1 May.
Flight training: $30,000.00 target, $12,650.00 saved, $17,350.00 to go,
$275.00 an hour. Moved in: May $400.00, June $650.00, July $500.00, August
$300.00 (4 complete months, *some*). Sorted 300, 400, 500, 650: the low is
rank ⌈0.25 × 4⌉ = 1, $300.00; the middle ($400.00 + $500.00) ÷ 2 =
$450.00; the high rank ⌈0.75 × 4⌉ = 3, $500.00. Weekly: $69.23, $103.85
and $115.38. Weeks: ⌈17,350.00 ÷ 115.38⌉ = 151, ⌈÷ 103.85⌉ = 168 and
⌈÷ 69.23⌉ = 251, so 16 August 2029, 13 December 2029 and 17 July 2031.
With only July and August, the one rough date is from $400.00: weekly
$92.31, ⌈17,350.00 ÷ 92.31⌉ = 188 weeks, 2 May 2030. With a target date of
24 September 2028, $17,350.00 over 731 ÷ 7 weeks needs $166.15 a week.
**Milestone:** the last complete week is 14–20 September, so the eve is
13 September. $300.00 moved in on the 15th, so saved then was
$12,350.00: 12,350.00 × 60 ÷ 275.00 = 2,694.54…, 2,695 minutes, 44 h. Now
46 h. ⌊44 ÷ 5⌋ = 8 and ⌊46 ÷ 5⌋ = 9, so 45 hours was passed. Emergency,
$1,000.00 target, $520.00 now, $100.00 moved in on the 15th: ⌊420 × 10 ÷
1,000⌋ = 4 then, 5 now, so half the target was passed.

---

## F34 — What to cut: levers, and how much sooner each gets you there

**Decided 2026-09-25. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §5, §11; built in slice A08), for every active goal.

**Chosen.**

- **Which categories.** Each Variable expenses category with a usual month
  (F27: the median of up to its 6 most recent complete months) above $0.
- **Three levers each,** as a month's saving, each rounded half-up to
  **$5.00** (500 cents): a **tenth** of the usual month, a **quarter** of
  it, and **your best month**, the usual month less the lowest of those
  complete months, only when that difference is at least $5.00 before
  rounding. A lever that rounds to $0 is left out.
- **Weekly** = monthly × 12 ÷ 52, half-up.
- **Weeks sooner,** at the goal's middle pace (F33): ⌈remaining ÷ pace⌉ −
  ⌈remaining ÷ (pace + weekly)⌉. With no pace, the lever alone gets there
  in ⌈remaining ÷ weekly⌉ weeks. A goal whose target is met has no levers.
- **Time a month,** for a goal with a cost an hour: the monthly saving by
  `timeEquivalent`, in whole minutes (half-up), shown in the goal's own
  unit.
- **What is offered:** at most **two categories, one lever each**, the
  quarter by default, or the best month when the quarter rounds to $0;
  largest saving first, ties by the category's place on its list, then id.
  A lever that brings the date no sooner (0 weeks) is not offered. The first
  offered is **the top lever**, the one the Coach's goal card and Savings
  show. The rest wait for Forecast's What if (plan A14).

**Worked example.** Dining out's usual month is $405.00 over six months
whose lowest is $300.00 (F27's example). A tenth, $40.50, is $40.00; a
quarter, $101.25, is $100.00; the best month, $105.00, is $105.00.
Groceries' usual month is $380.00: its quarter, $95.00, is $95.00. Offered:
Dining out $100.00, then Groceries $95.00. For Flight training (F33's
example, middle pace $103.85 a week, $17,350.00 to go), Dining out's
$100.00 a month is $23.08 a week: ⌈17,350.00 ÷ 103.85⌉ = 168 less
⌈17,350.00 ÷ 126.93⌉ = 137, **31 weeks sooner**, and 100.00 × 60 ÷
275.00 = 21.8, **22 minutes of flight time a month**. With no pace, it
alone takes ⌈17,350.00 ÷ 23.08⌉ = 752 weeks.

**Wins in the Coach's digest** (F44's list of kinds grows here). **Saved
more:** this month's Savings Actual against the same days last month
(F25), when more was saved; sized and made notable by the summary's band
(F27), weighed as a summary is (thin, the change as its month's effect).
**A milestone passed** (above), one fact per active goal, always notable,
its effect the money one step is worth (5 hours at the goal's cost an
hour, or a tenth of its target, half-up), *solid* because a balance is not
an estimate: a milestone comes rarely, and the Coach should cheer it.

---

## F35 — The next three months, and what-ifs

**Decided 2026-09-25. Engineering default. Not from the workbook,** which
has no forecast. Decided by the engineer under the owner's 2026-09-24
instruction to proceed without questions (plan §5, §11; built in slice
A14). The plan wrote the what-ifs for the flight goal; G1 made goals
plural, so they hold for whichever active goal is chosen, the main goal
first. The plan gives the what-if no number of its own, and F36 to F44
are taken, so it is written here, beside the forecast it changes.

**The three months** are the three calendar months after `asOf`'s month.
For each:

- **Pay.** Each Income source, in the list's order: with a pay schedule
  and a usual pay (F29's median of its last 3 receipts, as of `asOf`),
  its paydays in that month (`paydaysIn`, from its first pay date on) ×
  its usual pay. Otherwise its Income Goal in effect that month (D12), the
  whole goal, as the plan says ("else the goal"): a month has no receipt
  yet to subtract. Otherwise it is *not counted* and named, or *idle* as
  F29 says, and not named.
- **Bills:** every Bills, Debts and Subscriptions amount in effect in that
  month (D13, `billsTotals`' all-fixed total, D7). A change typed from a
  later month (rent going up in November) counts from that month.
- **Variable spending:** the Variable block's Actual in each of up to the
  6 most recent complete months (F24), a month below $0 counted as $0 (as
  F30 does); the **25th percentile, median and 75th percentile** (F27's
  median, nearest rank for the others, F33), each rounded half-up to $10.
  With 1 or 2 complete months, **the median only, rough**. With none,
  nothing is forecast, and it says the day it becomes possible (the first
  of the month after the first whole month, F33's rule).
- **Savings:** each Savings row's goal in effect that month (D12), added
  up.
- **Net** = pay − bills − variable − savings, per variable figure, from
  the unrounded variable figure, then rounded half-up to $10. The **worst
  case** takes the 75th percentile's spending, the **best case** the 25th.
- **Balances, with a typed start (D17):** each month's end chains from
  F30's most likely end: worst = previous worst + worst net, and the same
  for the middle and best, **every chain starting from F30's median**
  (the plan: "chain from F30's median"; starting the worst case from F30's
  low end was the other reading, and would add this month's spread to
  three months of it). Kept unrounded along the chain and each month's
  figure rounded half-up to $10. Labelled **best case** and **worst case**,
  and "not a promise". Without a start, the nets still show.
- **Heights** for the chart come from `scaleSeries` over every worst,
  middle and best figure drawn, so the chart divides no money.

**What if** (a lever of F34, or any saving a month *M*, applied to one
goal):

- **Weekly** = M × 12 ÷ 52, half-up (F34).
- **This month's end:** the lever keeps `M × (D − d) ÷ D`, half-up, of the
  days left (F30's days); each of F30's low, middle and high ends gains it
  and is rounded to $10 again. The ends were already rounded to $10, so a
  what-if end can differ from a from-scratch figure by up to $5, inside
  the $10 the range is shown to. No end without a typed start or before
  F30 has one.
- **The goal's date:** each pace of F33 plus the weekly amount, turned
  into a date by `projectGoal` (early from the high, middle from the
  middle, late from the low; no late date when the low plus the lever is
  still $0 or less). Rough stays rough: one date. **Weeks sooner** at the
  middle pace (F34's formula). With no pace (no fund, too early, or none),
  the lever alone: ⌈remaining ÷ weekly⌉ weeks. A goal whose target is met
  has no date to move.
- **Time a month** for a goal with a cost an hour, by `timeEquivalent`
  (F34).
- Worked on the phone from figures already loaded: a chip never reads or
  asks anything.

**Worked example.** 24 September 2026, as in F30: June, July and August
complete. Pay bi-weekly from 5 June, usual $2,100.00: October's paydays
are the 9th and 23rd, so $4,200.00, and November's and December's two
each. Bills $1,340.00 (Rent $1,200.00, Phone $60.00, Internet $80.00);
with Rent at $1,300.00 from November, $1,440.00 in November and December.
Savings: the Flight fund's $500.00 goal. Variable: June $900.00, July
$1,240.00, August $1,054.00: the 25th percentile rank ⌈0.25 × 3⌉ = 1,
$900.00; the median $1,054.00 ($1,050); the 75th rank 3, $1,240.00.
October's net: 4,200.00 − 1,340.00 − 500.00 − 1,054.00 = $1,306.00
($1,310); worst $1,120.00, best $1,460.00. November's: $1,206.00 ($1,210),
worst $1,020.00, best $1,360.00. From F30's $3,310: October ends $4,616.00
($4,620), worst $4,430, best $4,770; November $5,822.00 ($5,820), worst
$5,450, best $6,130; December $7,028.00 ($7,030), worst $6,470, best
$7,490. With records from 1 August (August alone): rough, variable
$1,050 each way, October's net $1,310 each way.

**What if, worked:** Dining out's quarter, $100.00 a month (F34), on F30's
example: it keeps 100.00 × 6 ÷ 30 = $20.00 this month, so the month ends
$3,300 to $3,360, most likely $3,330. On Flight training (F33's example,
$17,350.00 to go, paces $69.23, $103.85 and $115.38 a week), the lever is
$23.08 a week: ⌈17,350.00 ÷ 138.46⌉ = 126 weeks (22 February 2029),
⌈÷ 126.93⌉ = 137 (10 May 2029) and ⌈÷ 92.31⌉ = 188 (2 May 2030): 168 −
137 = **31 weeks sooner**, and 22 minutes of flight time a month.

---

## F36 — The month in review: totals, savings rate and the biggest changes

**Decided 2026-09-25. Engineering default. Not from the workbook,** whose
month tabs show one month and never review it against another. Decided by
the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §7, §11; built in slice A15).

**Which month, and how far.** Any month can be reviewed (`#/reports/2026-08`).

- **So far:** the month holding `asOf`, over days 1..*d*.
- **Complete:** a month before `asOf`'s that lies wholly inside the records
  and what was read (F24), over the whole month.
- **Partly recorded:** a month before `asOf`'s that the records start inside
  (the owner's August 2026, from the 8th). It is reviewed over the whole
  month, and says where the records start.
- **Not started** (after `asOf`'s month) and **before the records** (ending
  before history start) have nothing to review.

**Totals.** Income, Spent and Saved over the reviewed days, through
`periodSheet` with the month's own amounts in effect (D13), as F25 counts a
window: a month that is over matches the Month's own figures (F7, planned
bills counted); a month so far counts a planned bill only on its due day,
as the Month's comparison strip does, so it is set like for like against
last month. `monthlyTotals` gives each complete month's three whole-month
totals, newest first.

**Against last month** is F25 and F26 unchanged: a month so far against the
same days of the month before, a month that is over against the whole month
before; nothing when that window starts before the records (F24). Each change
is sized by the summary's band (F27: max($25.00, 15% of last month's)).

**Against your usual month:** the median (F27) of each total over up to the 6
most recent complete months **before the reviewed month**, so a month's
review reads the same whenever it is opened, and the month itself is left
out. Shown only for a month that is over: a usual month is a whole month,
and Income comes on paydays, so scaling it to days would mislead. Evidence
(F24) is counted from those months.

**Savings rate** = saved × 10,000 ÷ income, in basis points, half-up on the
magnitude with the sign kept (F26's rounding); **none when income is $0 or
less**, since a share of nothing, or of refunds, means nothing. Saved below
$0 (money taken back out of savings) gives a rate below 0.

**The biggest changes** (`biggestMovers`):

- **Which categories:** Variable expenses only, as digest version 1 (F27): a
  change on Bills, Debts or Subscriptions is a bill moving, not a habit, and
  its price-rise detector is F38's.
- **Against:** the category's usual month (F27) over up to 6 complete months
  before the reviewed month. A category with none has no usual month and is
  never a mover.
- **A month so far** is set against its usual month scaled to the days,
  `usual × d ÷ D`, half-up, with F27's band scaled the same way.
- **A mover** differs from it by at least the band (clear or big, F27). The
  three largest rises and the three largest falls, by the size of the
  change, ties by the category's place on its list, then its id.

**This month against last, by category** (the paired bars): each Variable
expenses row with either side not $0, over the two windows compared above;
the 8 with the largest of their two figures, ties by list order then id.
Lengths are `scaleSeries` over $0 and each figure, a figure below $0 drawn
as no bar (its amount still written), so the chart divides no money.

**Worked example.** Thursday 24 September 2026, records from 1 February.
**August, complete.** Income $4,200.00, Spent $3,150.00, Saved $500.00.
Savings rate 50,000 × 10,000 ÷ 420,000 = 1,190.47…, **1,190 bp** (11.9%).
July: Income $4,200.00, Spent $3,310.00, Saved $300.00: Spent $160.00 less,
against a band of max($25.00, $496.50) = $496.50, *slight*. Usual month
over February to July (6 months, *solid*): Spent $3,000, $3,100, $3,200,
$3,250, $3,300 and $3,310, median ($3,200.00 + $3,250.00) ÷ 2 =
**$3,225.00**. Dining out's six months before August are F27's six figures
(usual month $405.00, band $135.00); August's $560.00 is $155.00 more,
1.15 bands, *clear*, a rise. Coffee
$62.00 against $60.00: $2.00, under $25.00, not a mover. **September so
far**, day 24 of 30, with Dining out's usual month still $405.00: $400.00
against $405.00 × 24 ÷ 30 =
$324.00, band $108.00: $76.00 more, *slight*, not a mover. **No income:**
a month with $0.00 in and $50.00 saved has no savings rate.

---

## F37 — Trends: six or twelve months, and when a line is called steady

**Decided 2026-09-25. Engineering default. Not from the workbook,** whose
month tabs each hold one month and draw no line across months. Decided by
the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §2.6, §7, §11; built in slice A16).

**Which months.** The 6 or 12 calendar months before `asOf`'s month, oldest
first. The month still running is never a point: a part month would always
read as a fall. A month that is not complete (F24: wholly inside the
records and what was read) is a **gap**, never $0, so a line never dives to
nothing before the records start.

**The lines.**

- **Income, Spent and Saved:** each complete month's whole-month totals,
  F36's `monthlyTotals` (planned bills counted, as the Month counts them).
- **Each category:** every Variable expenses category with a figure other
  than $0 in a complete month of the window, by its Actual as the Month
  shows it (`monthActuals`). Variable only, as F36's biggest changes and
  digest version 1: a bill moving is not a habit (F38 speaks of prices).
- **Its usual level:** F27's usual month over up to the 6 most recent
  complete months, drawn as a dashed line across its row.

**The label** (`trendLabel`), given each complete month's figure:

- **Under 4 complete months: "not enough months yet",** naming the month it
  becomes possible: the later of `asOf`'s month plus (4 − the months there
  are), and the first whole month of the records plus 4. With no records,
  no month is named ("once your records hold four whole months").
- **Otherwise** the last up to 6 months, and each pair of months next to
  each other (up to 5 pairs). A pair **rises** when the later month is at
  least $1.00 more, and **falls** when at least $1.00 less (F26: under
  $1.00 either way is the same). The **band** is F27's over those months,
  for a whole month.
- **Rising steadily:** rises × 4 ≥ pairs × 3 (at least 75% of the pairs:
  all 3 of 3, 3 of 4, 4 of 5), **and** last − first is at least the band
  (F27's "clear": from one band). **Falling steadily** is the mirror.
  Anything else is **no clear trend**.
- The label always reads the last 6 months, in the 12-month view too, so a
  label does not change when the view does, and a year-old habit does not
  outvote this half-year.
- Income, Spent and Saved are labelled by the same rule, each against its
  own band.

**Heights** come from `scaleSeries` over $0, every figure drawn and the
usual level: one scale for the three totals, so their lines compare, and
one per category row. So the charts divide no money, and $0 is always on
the scale, so a small wobble is never drawn as a cliff.

**In the Coach's digest:** a Variable category **rising steadily** or
**falling steadily** is a fact (`category_trend`), always worth a card:
rising is one to watch, with one thing to try; falling is a win. Its
figures are the first and last month and their amounts, the months it rests
on and the usual month. Its monthly effect (F44) is |last − first|, weighed
by the evidence of those months. A dismissal names the category, the last
month and the direction, so next month's trend can come back.

**Worked example.** Friday 25 September 2026, records from 1 February.
**Dining out**, March to August: $300, $340, $330, $380, $420, $450. Pairs:
+$40, −$10, +$50, +$40, +$30: 4 of 5 rise, and 4 × 4 = 16 ≥ 5 × 3 = 15.
Usual month: the median of $300, $330, $340, $380, $420, $450, ($340 +
$380) ÷ 2 = **$360.00**; distances $60, $20, $30, $20, $60, $90, MAD ($30 +
$60) ÷ 2 = $45.00; band max($25.00, $54.00, $135.00) = **$135.00**. Last −
first = $150.00 ≥ $135.00: **rising steadily**. **Groceries** $400, $410,
$420, $405, $415, $425: 4 of 5 rise too, but last − first is $25.00, under
its band of max($25.00, 15% of $412.50 = $61.88, 3 × $7.50) = $61.88: **no
clear trend**. **Coffee** $60, $62, $59, $61, $60, $63: 3 rises of 5, 3 × 4
= 12 < 15: **no clear trend**. **Records from 8 August 2026:** on 25
September no month is complete; the first whole month is September, so
with September to December whole, trends are possible from **January
2027**.

---

## F38 — Subscriptions: which charges repeat, and when a price changed

**Decided 2026-09-26. Engineering default. Not from the workbook,** whose
Bills tab holds what the owner types and never reads a statement for a
pattern. Decided by the engineer under the owner's 2026-09-24 instruction
to proceed without questions (plan §2.6, §7, §11; built in slice A17).

**A shop, and its charges** (shared with F39 and F41).

- **A shop** is the statement's descriptor as `statement-parsers`'
  `normalizeMerchant` tidies it (the same key a learned rule matches). The
  app passes it in with each row as data, so core still imports only
  `money-primitives`. A row whose key is empty belongs to no shop.
- **A charge** is a row below $0 on a spending list (Bills, Debts,
  Subscriptions, Variable expenses); its size is the amount without its
  sign. **A refund** is a row above $0 on one. Rows on Income, Savings and
  Not spending are never a shop's.
- **The records covered** start at the later of history start (F24) and the
  first day read. A row before them is not looked at.
- **By hand or from a statement:** rows typed in Add, and rows read from a
  receipt photo, are *by hand*; rows from a card statement (CSV, Excel or
  PDF) are *from a statement*.

**Chosen.**

- **A series** is every charge of one shop in the records covered up to
  `asOf`, oldest first (by date, then row id). It needs **3 or more
  charges**, and **every gap** between one charge and the next in **one
  band**: 6–8 days (weekly), 12–16 (fortnightly), 26–35 (monthly) or
  350–380 (yearly), ends included.
- **Steady amounts:** every charge **but the latest** is within
  max(100 cents, 10% of their median, half-up) of the median of those
  charges (F27's median). The latest is within that too, **or** it is a
  price change (below) of at most half the charge before it.
- **Still running:** `asOf` is at most the band's longest gap after the
  latest charge (35 days for monthly). A series that has stopped, such as a
  cancelled plan, is not listed.
- **Not a subscription:** a shop the owner marked so is never a series.
- **Next date** = the latest charge + the median gap (F27's median, half-up).
- **A price change:** the latest charge differs from the one before by at
  least 50 cents **and** at least 2% of the one before
  (`|latest − previous| × 50 ≥ previous`). Up or down.
- **Its price** is the latest charge when a price changed, else the median
  of all its charges.
  **A year's cost** = price × 52, 26, 12 or 1; **a month's** = a year's ÷
  12, half-up.
- **New:** the first charge is at most 100 days before `asOf`, and the
  records covered begin at least one band's longest gap before it, so an
  earlier charge would have been seen.
- **Order:** largest year's cost first, ties by shop.
- **"Looks like a monthly bill"** (Setup): a monthly series whose latest
  charge is filed on Bills, Debts or Subscriptions, under a category with
  no monthly amount in effect this month. It offers the price and the day
  of the month of the latest charge; one per category, the largest year's
  cost. Nothing is written until the owner saves the bill.
- **In the Coach's digest (version 2):** a price rise whose latest charge
  is in the last 30 days (`price_rise`), and a new series (`new_subscription`),
  are facts, always worth a card, to watch. A price rise is *solid* (the
  statement says it), a new series *some*. Monthly effect (F44): its
  month's cost. A dismissal names the shop and the latest charge's date
  (a price rise) or the first charge's (new), so the next rise comes back.

**Why the latest charge is judged apart.** The plan's rule held every
amount to 10% of the median, which hides the very rise it must report:
$15.99 three times then $18.99 is 19% above its median, so the series
would vanish and no rise would show. The cap at half the charge before
keeps a one-off large purchase at a shop from reading as a price change.

**Worked example.** Thursday 24 September 2026, records from 1 February.
**SPOTIFY** $11.99 on 14 May, 14 June, 14 July and 14 August, and $12.99 on
14 September. Gaps 31, 30, 31, 31: monthly. The first four's median is
$11.99, tolerance max($1.00, $1.20) = $1.20, all within. Latest $12.99 is
$1.00 more: $1.00 ≥ $0.50 and 100 × 50 = 5,000 ≥ 1,199, **a price rise**.
Median gap (30, 31, 31, 31) = 31, next **15 October**; a year $12.99 × 12
= **$155.88**, a month $12.99. First charge 133 days ago: not new.
**NETFLIX** $15.99 on 3 June, 3 July, 3 August, $18.99 on 3 September: a
rise of $3.00, 19% (at most half of $15.99), a series. **GYM** $45.00 on
20 July, 20 August and 20 September: first 66 days ago and the records
began more than 35 days before it, **new**. **CAFE** $4.50 on 1, 29 and
30 September: a gap of 1 day is in no band, **not a series**. Two charges
are never a series.

---

## F39 — Unusual charges, possible doubles, and a charge counted twice

**Decided 2026-09-26. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §2.6, §7, §11; built in slice A17). Shops, charges and the
records covered are F38's.

**Which charges are looked at:** those in a window the screen names. The
Coach: the last 30 days, `asOf` − 29 to `asOf`. Reports → Shops: the month
shown, to `asOf` while it runs. Earlier charges are read for comparison.

**Chosen.**

- **A large charge:** a charge at least max(5000 cents, 3 × the median size
  of its category's charges in the 90 days before its date), where the
  category has **5 or more** such earlier charges inside the records
  covered. Fewer, and it is never called large.
- **A new shop:** a charge of 10,000 cents or more at a shop with no
  earlier row (charge or refund; earlier by date, then row id) in the
  records covered, and at least 60 days after they begin. A charge that is
  large is not also called new.
- **A possible double charge:** two different rows, both charges, at the
  same shop, of the same amount to the cent, at most 3 days apart. Listed
  once, by the later row, which is in the window.
- **Maybe counted twice:** a charge by hand and a charge from a statement of
  the same amount, at most 3 days apart, whatever each calls the shop (a
  typed "coffee" is the statement's "COFFEE HOUSE"). A pair that is both is
  listed here only, as this says more.
- **A row with no shop** counts toward its category's usual charge and can
  be half of a pair counted twice; it is never called large, new or a
  double, having no shop to name.
- **Each is flagged, never hidden:** Shops lists every one, whatever the
  Coach's cards show, and nothing is removed or left out of a total.
  Keeping out a duplicate import is the dedupe hash's job, not this.
- **In the Coach's digest (version 2):** each is a fact, always worth a
  card, to watch: `large_charge` and `new_shop` *some*, `possible_double`
  and `counted_twice` *solid* (the statement says it). Monthly effect
  (F44): the charge's amount. A dismissal names the row, or the two rows.

**Worked example.** Thursday 24 September 2026, records from 1 February.
Dining out has 12 charges between 22 June and 19 September, median $25.00:
threshold max($50.00, $75.00) = $75.00, so **$180.00 on 20 September is
large**. A category with 4 earlier charges is never judged. **FURNITURE CO**
$450.00 on 12 September, no earlier row, 223 days after 1 February: **a
new shop**. **COFFEE HOUSE** $4.50 on 21 and on 23 September, two rows:
**a possible double**. A typed "coffee" $6.25 on 22 September and
**COFFEE HOUSE** $6.25 from the statement on 23 September: **maybe counted
twice**. $6.25 four days apart: neither.

---

## F40 — Habits: the spending grid, the weekday pattern, streaks and personal bests

**Decided 2026-09-27. Engineering default. Not from the workbook,** which
has no day-by-day view, no weekday pattern and no record of weeks kept.
Decided by the engineer under the owner's 2026-09-24 instruction to
proceed without questions (plan §2.6, §7, §11; built in slice A18).

**Shared.** Everyday spending is the **Variable expenses** list, as F36's
biggest changes and F37's lines: a bill is paid on its day and says nothing
about habits. **A day's spending** is the net of that day's Variable rows,
charges less refunds, as the Month's Actual counts it; below $0 after a
refund. **The records covered** start at the later of history start (F24)
and the first day read, as F38's. **Weeks** run Monday to Sunday (D14). A
**complete week** lies wholly inside the records covered and ends before
`asOf`'s week begins.

**The daily allowance.**

- With a weekly budget on at least one Variable category: the sum of the
  Variable weekly budgets set ÷ 7, half-up. A budget of $0 counts: it is
  the owner's number.
- With none set: the **median of the days that had spending** (above $0)
  among the grid's recorded days, F27's median. Every day would give $0
  for anyone who shops three days a week, and every day they shopped
  would read as "more".
- With no budget and no day of spending: none, and every recorded day is
  "none".

**The grid** (`spendingGrid`).

- The weeks from the later of 25 weeks before `asOf`'s week and the week
  holding the start of the records covered, to `asOf`'s week: up to 26.
  None with no records.
- A day before the records covered is **no records**, and a day after
  `asOf` is **to come**; neither is ever $0 or a level.
- **Five levels** against the allowance A, in whole cents with no
  division: **none** when spent ≤ $0; **up to half** when 2 × spent ≤ A;
  **up to all** when spent ≤ A; **up to one and a half** when 2 × spent ≤
  3 × A; **more** otherwise. So each boundary belongs to the lower level.
  With A = $0, any spending is "more".
- Each week's total is its recorded days' spending, and **no-spend days**
  are the recorded days at "none".

**The weekday pattern** (`weekdayPattern`).

- The last up to **12 complete weeks**. Under **4**, "not enough weeks
  yet", naming the Monday it becomes possible: the later of the first
  whole week of the records plus 4 weeks, and `asOf`'s week plus (4 − the
  weeks there are).
- Each weekday's **average** = that weekday's spending over those weeks ÷
  their number, half-up on the magnitude. The **costliest** is the largest
  average above $0, the earlier weekday on a tie; none when no average is
  above $0.
- Bars are `goalBars`' (F17), each weekday's average over a track as long
  as the budgets' allowance; with no weekly budget, no track. The median
  fallback is not drawn as a track: it is not a number the owner set.

**Streaks** (`streaks`, on `weekSheet`).

- A complete week is **kept** when the Week's Left to spend (F5, the
  Variable block's Remaining total, on `weekSheet`) is $0 or more: at or
  under its weekly budgets, a Variable row with no budget taking its whole
  Actual off, as the Week shows it. Each week is judged against today's
  weekly budgets, as the Week shows every week (0004 keeps one set).
- Needs a weekly budget on at least one Variable category; with none, no
  streak, since a row with no budget cannot be kept.
- **The current streak** is the kept weeks in a row ending with the last
  complete week; **the best** is the longest run of kept weeks among all
  the complete weeks read, and the week it ended (the latest, of equal
  runs).

**Personal bests** (`personalBest`).

- The complete months (F24), up to the 12 most recent. Under **3**, "not
  enough months yet", naming the month it becomes possible as F37 does,
  with 3.
- A Variable category has a **personal best** when its Actual in the last
  complete month is lower than in every other of those months by at
  least $1.00 (F26: under $1.00 is the same, so a tie is no best). Listed
  by how far under the next lowest, largest first, ties by list order.

**In the Coach's digest,** only where the Coach gives the weekly budgets
(the Month's line does not): a **current streak of 2 or more weeks** is a
`spending_streak` fact, and each personal best a `personal_best` fact.
Both are wins, always worth a card, and *solid* for a streak (the owner's
own budget) or by the months read for a best (F24). Monthly effect (F44):
the last complete week's Left to spend × 52 ÷ 12, half-up, for a streak;
the next lowest less the best, for a best. A dismissal names the last
complete week, or the category and month, so next week's streak and next
month's best come back.

**Worked example.** Thursday 24 September 2026, records from 1 February.
Weekly budgets: Dining out $70.00, Groceries $140.00, Coffee none. The
allowance is $210.00 ÷ 7 = **$30.00**: a day of $15.00 is "up to half",
$15.01 "up to all", $30.00 "up to all", $45.00 "up to one and a half",
$45.01 "more", and a day with only a refund "none". Budgets of $100.00 give
$14.2857…, **$14.29**. With no budget, days of $12, $30, $8 and $50 give
($12 + $30) ÷ 2 = **$21.00**. The grid runs from Monday 30 March to
Sunday 27 September; 25 to 27 September are to come. **Records from 8
August** (a Saturday): the grid starts Monday 3 August, 3 to 7 August are
no records, eight weeks in all.

**The pattern:** the 12 weeks from 29 June to 20 September. Saturdays of
$40, $0, $25 and $36 over four weeks average $101 ÷ 4 = **$25.25**. Records
from Tuesday 1 September: the first whole week is 7 September, two are
complete by 24 September, and the pattern is possible from **Monday 5
October**.

**A streak,** records from Monday 10 August: the weeks of 10, 17 and 24
August kept, 31 August over by
$5.00, 7 September kept, and 14 September with Left to spend exactly $0.00
(kept: at or under). Current **2**, best **3**, ending the week of 24
August. $4.00 of Coffee, which has no budget, takes $4.00 off a week's
Left to spend.

**A best:** complete months February to August. Dining out's August,
$250.00, is its lowest and $30.00 under the next, $280.00: **a personal
best**. Groceries' August of $400.00 against May's $400.50 is under $1.00
apart: **no best**. Records from 8 August: September, October and
November must be whole, so bests are possible from **December 2026**.

---

## F41 — Top shops, against last month

**Decided 2026-09-26. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §2.6, §7, §11; built in slice A17). Shops, charges and
refunds are F38's.

**Chosen.**

- **Windows** are F25's for a month: a month so far against the same days
  of the month before, a month that is over against the whole month before.
  When the earlier window starts before the records (F24) there is no
  comparison, and the shops still show.
- **A shop's spending** in a window is net: its charges less its refunds.
  A shop whose net is $0 or less in the window shown is left out.
- **The top 10** by net, largest first, ties by shop, each with its net in
  the window before, the change (F26: under $1.00 is the same) and how many
  charges.
- **New this month:** a shop with a charge in the window shown and no row
  at all in the records covered before it. Only when the records covered
  begin at least 60 days before the window, as F39's new shop; otherwise
  "too early to tell". Largest first, at most 10.

**Worked example.** Thursday 24 September 2026, records from 1 February:
1–24 September against 1–24 August. **SUSHI PLACE** $42.10 on 3 September
and $84.20 on 19 September, $126.30, against $60.00: **$66.30 more**.
**GROCER** $250.00 less a $20.00 refund: **$230.00**. **BOOKSHOP**, only a
$15.00 refund: left out. **NEW GYM** $45.00 on 10 September, never seen
before 1 September: **new this month**. With records from 8 August, every
shop in September would look new, so it says it is too early to tell.

---

## F42 — The Sunday check-in: its week, the recap, the questions, the suggested limit and the impulse share

**Decided 2026-09-27. Engineering default. Not from the workbook,** which
has no weekly check-in and no record of why a charge was made. Decided by
the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan §2.4, §3.11 feature 7, §11; built in slice A20).

**Shared.** Weeks run Monday to Sunday (D14). Everyday spending is the
**Variable expenses** list, net of refunds, as F40's. **The records
covered** start at the later of history start (F24) and the first day
read, as F38's and F40's.

**The check-in's week** (`checkinWeek`). The Monday-to-Sunday week that
ends on the latest Sunday on or before `asOf`: on a Sunday, the week
ending that day; Monday to Saturday, the week before. So the check-in is
ready from Sunday and stays on that week until the next Sunday. An
answer's `asked_week` (0017) is this week's Monday: the week the question
is about, whichever day it was answered.

**The recap** (`weeklyRecap`).

- Only when the whole week lies inside the records covered; otherwise
  "not covered", naming where the records start, so a gap is never read
  as a thrifty week.
- **Spent:** the week's Variable spending, net; below $0 in a week of
  refunds.
- **The weekly budgets:** the sum of the Variable weekly budgets set, or
  none. With any set, **Left to spend** is the Week's own (F5, on
  `weekSheet`): each budget less its Actual, a Variable row with no
  budget taking its whole Actual off, as F40's streak judges a week. The
  week is **kept** when that is $0 or more; otherwise **over by** its
  negation.
- **The week before:** its Variable spending, when it too lies inside the
  records covered, and the change (F26: under $1.00 is the same).
- **No-spend days:** days of the week whose Variable net is $0 or less.
- **The top category:** the Variable category with the most spending in
  the week, above $0; the list's order breaks a tie.

**The questions** (`questionsToAsk`). The week's rows on the Variable
list that are **charges of 2000 cents or more** (a refund is never
asked about), with **no answer** in `coach_answers` (in any week: an
answer is kept by the charge), **the largest 3**, a tie going to the
earlier day, then the order given. Asked whether or not the recap is
covered: a question names a real row.

**The suggested limit** (`suggestedWeeklyLimit`), for the recap's top
category.

- Its **usual month** is F27's: the median of its Actual (`monthActuals`,
  as the Month counts it) over up to the 6 most recent complete months
  before `asOf`'s month.
- **Limit** = min(last week's Actual, usual × 12 ÷ 52), **rounded down to
  500 cents**, and **at least 500**. The division is exact, never rounded
  before the minimum is taken: floor(min(52 × actual, 12 × usual) ÷
  (52 × 500)) × 500.
- **With no complete month,** the limit is last week's Actual alone,
  rounded down the same way: "no more than last week".
- **Never above the category's own weekly budget.** When a budget is set
  and the rule gives more, the offer is the budget as it is, so the
  one-tap commitment never loosens a limit the owner chose.
- None when the recap is not covered or had no top category.

**The impulse share** (`impulseShare`). Answers whose `asked_week` is one
of the 8 weeks ending with the check-in's week (its Monday and the 7
Mondays before). Share = impulse answers × 10000 ÷ answers, in basis
points, half-up; none when there is no answer.

**Worked example.** Sunday 27 September 2026, records from 1 February.
The check-in's week is **Monday 21 to Sunday 27 September**; on Wednesday
30 September it is still that week, and on Sunday 4 October it becomes 28
September to 4 October. Weekly budgets: Dining out $70.00, Groceries
$140.00, Coffee none. The week's rows: Coffee $4.50 on the 22nd; SUSHI
PLACE $84.20 (Dining out) on the 23rd; GROCER $112.40 (Groceries) on the
24th; CAFE $19.99 (Coffee) and rent $1,500.00 (Bills) on the 25th; BURGER
BAR $20.00 (Dining out) and a GROCER refund of $15.00 on the 26th.

- **Spent** $104.20 + $97.40 + $24.49 = **$226.09**. **Left to spend**
  ($70.00 − $104.20) + ($140.00 − $97.40) − $24.49 = **−$16.09**: not
  kept, **over by $16.09**. The rent is a bill and counts nowhere here.
- The week before spent $250.00: **$23.91 less**.
- **No-spend days:** Monday the 21st and Sunday the 27th, **2**. Saturday
  nets $20.00 − $15.00 = $5.00, a day of spending.
- **Top category:** Dining out, $104.20.
- **Questions:** GROCER $112.40, SUSHI PLACE $84.20, BURGER BAR $20.00 (at
  exactly $20.00, asked). CAFE's $19.99 is never asked, nor the rent (not
  Variable) or the refund. With SUSHI PLACE already answered: GROCER and
  BURGER BAR.
- **Limit,** Dining out's usual month $300.00: $300.00 × 12 ÷ 52 =
  $69.23…; min($104.20, $69.23…) rounds down to **$65.00**, under its
  $70.00 budget. Usual $500.00: $115.38… against $104.20 gives $100.00,
  above the $70.00 budget, so **$70.00**; with no budget, **$100.00**.
  Usual $20.00: $4.61… rounds down to $0.00, so **$5.00**. With no
  complete month: $104.20 alone, **$100.00**.
- **Impulse share,** the 8 weeks from 3 August to 21 September: 2
  impulse of 5 answers is **4000 bp (40%)**; 1 of 3 is 3333.3…, **3333
  bp**; 2 of 3 is 6666.6…, **6667 bp**. An answer asked the week of 27
  July is left out. No answers: **no share**.

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
  summaries, then the rest: notable facts before the others, each group by
  impact, largest first, ties by key. So a notable fact is never cut to
  make room for one that could not become a card.
- **The day's rotation** (`dailyIndex`, for picking among equals without
  randomness): the days from 1 January 1970 to `asOf`, modulo the count.

**Worked example.** On 24 September: Dining out $212.40 more than the same
days of August, with 6 complete months: effect $212.40 × 30 ÷ 24 = $265.50,
*solid*, impact 79650. Groceries over its $500.00 budget by $30.00: effect
3000, *solid*, impact 9000. Dining out ranks first; a statement ending on
6 September (18 days before) would rank above both.

---

## F45 — Savings goals: their order, the main goal, paused and reached, and progress in hours or dollars

**Decided 2026-09-24. Engineering default. Not from the workbook.** The
request for more than one goal is the owner's (2026-09-24: "I also want the
ability to add other goals for saving not just flight... make sure to add
that"). Every rule below is decided by the engineer under the owner's
2026-09-24 instruction to proceed without questions (plan slice G1). The
workbook's Savings tab has funds, not goals in an order, so there is no cell
to follow (D28).

**Chosen.**

- **Order.** Each goal has a position (0015's `sort_order`). Goals are
  ordered by position, then by when each was made (`created_at`), then by
  id, so goals sharing a position keep the order they were made in. Every
  goal from before 0015 has position 0. A new goal goes after every other:
  the highest position plus 1, as `endOfList` places a row.
- **Moving** a goal up or down swaps it with its neighbour among the active
  goals, and numbers the active goals 0, 1, 2… in the new order
  (`moveInList`); only the positions that change are written. Paused and
  reached goals keep theirs.
- **The main goal** is the first active goal in that order: the one the
  Coach's hero card and the Week's goal card show. With no active goal
  there is none, and those cards say so. **Make main goal** moves a goal to
  the first place among the active goals and numbers them again. On the day
  0015 is pasted every goal is at position 0, so the main goal is the
  oldest, which is the goal the Week, the Coach and Settings showed before
  (`getGoal` read the oldest).
- **Active, paused and reached.** *Active* goals are listed in order, can be
  the main goal, and are the Coach's list. A *paused* goal keeps every
  figure, and its fund still counts money moved into it (D16), but it is
  not the main goal, not on the Coach or the Week, and sits folded under
  **Reached and paused**. *Reached* is the owner's mark that a goal is
  done, with the day it was marked (`reached_on`, the `asOf` of the tap);
  otherwise it is kept as a paused goal is. Saving the whole target does
  not mark a goal reached by itself: the card says the target is met, and
  the owner marks it. **Resume** puts a paused or reached goal back among
  the active goals at the end, never straight back to main, and clears
  `reached_on`.
- **Progress, for every goal.** Saved is the fund's balance kept by
  transfers when the goal is a fund's (D16), and otherwise the amount
  typed. Remaining is target − saved, never below $0. The bar is saved of
  target in basis points, half-up (F17's rounding): 0 at or below $0, and
  10,000 at or past the target. The target is met when saved is at or above
  it.
- **Hours or dollars.** A goal may have a cost per hour and a name for what
  the hours are of: the flight goal's is $275.00 of flight time. With one,
  its progress also reads as whole hours saved of the whole hours the
  target buys, each by `timeEquivalent` (minutes rounded half-up, whole
  hours), the rule A05's flight card uses. A balance below $0 has no hours.
  With no cost per hour, progress is in dollars only.
- **A goal added on Savings** starts with what is typed as saved already,
  true at the end of the day it is added (D16), and, when a target date is
  typed, a start date of that same day, so its card shows the months left
  and what to save each month (F21) rather than "no dates yet". With no
  target date it has no start date either, as the workbook's Travel Fund
  has none (D15).
- **Remove** is only for a goal with nothing saved (saved at or below $0).
  A goal holding money would lose the record of its balance, so its card
  says so and offers Pause or Mark as reached instead. Removing a goal
  leaves its fund on the Savings list, and every charge filed under it.
- **Before 0015 is pasted,** every goal reads as active at position 0,
  which is what 0015 makes of them, so the order and the main goal are the
  same before and after; nothing that changes a position or a status is
  offered until it is in.

**Worked example.** Flight training (made 1 March, position 0, active),
Emergency (made 3 September, position 0, active) and House (made
20 September, position 0, paused). Active, in order: Flight training,
Emergency; paused: House. Main goal: Flight training. **Move up** on
Emergency numbers the active goals Emergency 0, Flight training 1, and only
Flight training's position is written; Emergency is now the main goal.
**Resume** on House puts it at max(0, 1, 0) + 1 = 2, after Flight training.
Emergency with $150.00 of $1,000.00: 1,500 bp, $850.00 to go. Flight
training with $12,650.00 of $30,000.00 at $275.00 an hour: 4,217 bp
(42.1666…% half-up), $17,350.00 to go, 12,650.00 × 60 ÷ 275.00 = 2,760
minutes, 46 h, of 30,000.00 × 60 ÷ 275.00 = 6,545.45…, 6,545 minutes,
109 h.

---

## F46 — Review suggestions: a charge's size band, and which rows are asked about

**Decided 2026-09-27. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan slice A21, §3.6; ADR 0008). The workbook files every row by
hand, so there is no cell to follow.

The AI is never sent an amount (§3.6). To tell a coffee from a tank of fuel
it is sent a size band instead, which core decides (`sizeBand`), so no
screen compares money itself.

**Chosen.**

- **Spent or received.** A row below $0 is spent; $0 or above is received,
  as the ledger's signs are (a purchase is negative).
- **The band** is of the amount without its sign: **small** under 2,000
  cents (under $20), **medium** under 10,000 cents (under $100), and
  **large** from 10,000 cents. A boundary belongs to the band above it:
  exactly $20.00 is medium, exactly $100.00 is large.
- **Which rows are asked about:** those waiting in Review with no category
  stored and no learned rule for their shop. Rows sharing a shop, a
  direction and a band are asked about once, and the answer is proposed for
  each of them.
- **Batches:** each request holds every offered category and as many rows
  as keep its data under about 2,500 tokens (its JSON's UTF-8 bytes ÷ 3,
  rounded up, the helper's own estimate) and at most 40 rows; a batch
  always holds at least one row.

**Worked example.** −$4.50 (−450): spent, small. −$20.00 (−2,000): spent,
medium. −$99.99 (−9,999): spent, medium. −$100.00 (−10,000): spent, large.
$2,100.00 (210,000): received, large. $0.00: received, small.

---

## F47 — Just type it: which number is the amount, which day it was, and which way the money went

**Decided 2026-09-27. Engineering default. Not from the workbook.** Decided
by the engineer under the owner's 2026-09-24 instruction to proceed without
questions (plan slice A22, §3.9; ADR 0005 §7). The workbook is typed into
cell by cell, so there is no cell to follow.

`parseQuickEntry` in `statement-parsers` reads one line such as "coffee 4.50
yesterday" into the typed form's fields. It fills a field only when the
words settle it; anything else is left empty for the owner, or for the AI
under ADR 0005 §7's rule. Nothing is saved until **Add** is pressed.

**Chosen.**

- **The amount.** A word is a possible amount when it is digits, with
  commas grouping thousands and up to two decimals, with `$` before or
  after, read by the existing `parseAmountToCents` in `US_AMOUNT_FORMAT`.
  A zero is not an amount. Words that make up a date are not amounts.
  If any possible amount carries a `$`, only those count; otherwise, if any
  carries cents, only those count. The amount is found when exactly one
  word is left; two or more leave it empty, never the larger or the first.
  A "dollars", "dollar" or "bucks" straight after it is dropped.
- **The day.** Nothing said is today (`asOf`). "today", "yesterday", a
  weekday's full name (the latest such day, today included; "last" before
  it means the latest before today), `YYYY-MM-DD`, or a month's name or its
  three-letter form (and "sept") with a day of the month, either way round,
  with an optional year and an optional "st", "nd", "rd" or "th". With no
  year, this year: last year is never guessed. A date after today, a day
  the month does not have, a date with slashes (9/10 is September in one
  country and October in another), or two different days in one line
  leaves the day empty.
- **Which way.** Received when the line says "received", "earned",
  "refund", "refunded", "got paid" or "was paid"; otherwise spent. "paid"
  alone is spent: "paid 1200 rent" is rent paid.
- **The shop** is every other word, in the owner's own letters, with "I",
  "spent", "paid", "bought", "on", "at", "for", "from", "to" and "with"
  taken off either end. Nothing left leaves it empty.
- **The category** is the one a learned rule gives the shop's tidied name
  (`normalizeMerchant`), exactly, as an import would file it; no rule
  leaves it empty.

**Worked example, on Sunday 2026-09-27.** "coffee 4.50" is 450 cents,
today, spent, "coffee". "coffee $12 yesterday" is 1,200 cents, 2026-09-26.
"paid 1200 rent monday" is 120,000 cents, spent, "rent", 2026-09-21.
"got paid 2100" is 210,000 cents, received, with no shop. "3 coffees 12"
has no amount (3 and 12 both could be); "3 coffees 12.50" is 1,250 cents;
"3 coffees $12" is 1,200 cents. "lunch sep 3" is 2026-09-03; "lunch sep
30" and "lunch 9/3" leave the day empty (the first is after today, the
second could be either month).
