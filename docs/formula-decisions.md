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

## How the Workbook entries below were settled

F3 to F15 come from the Workbook plan (`docs/workbook-plan.md` §5.2, answered in
§9a). "The workbook" and "Workbook" are the same file. Each entry says which of
three ways it was settled, and only that:

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

**Decided 2026-09-22 by the account holder (Workbook plan decision 3).**

```
Jan!E22   =Bills!D7+SUMIFS(Bills!Q:Q,Bills!P:P,C22,Bills!O:O,">="&DATE(YEAR($B$3),MONTH($B$3),1),Bills!O:O,"<="&EOMONTH($B$3,0))   [800]
Bills!D7  800    (Rent, "Monthly Amount")
Bills!Q5  note: "Remember this column is for Bills that have changing amounts
          each month (example: electric bill) OR are paid at various times"
```

A bill's month Actual is its fixed Monthly Amount **plus** every payment
logged for it that month. Workbook's own sample depends on it: Credit Card 1 is
$50 fixed plus a $200 logged payment (Paycheck Budget!L50 [250]).

**Options put to the user**

- **A — the real charge replaces the plan.** Netflix set up at $17.99 with a
  $17.99 statement charge shows $17.99.
- **B — add both, as Workbook does.** The same month shows $35.98.

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

**The empty budget.** In Workbook a row with a blank budget still subtracts its
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

**Chosen:** kept as Workbook has it. Savings Difference is Actual − Goal, so
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

**Where it differs.** Workbook treats a blank D9 as $0 and still shows an ending
balance. The engine returns no ending balance when no starting balance is typed
for that month, because a projection from an invented $0 is a wrong number
that looks right. The plan gives this no D-number of its own.

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
- **A blank due day** never matches a partial window: Workbook's match runs
  against an empty string. Setup will prompt for a day paid.
- **Days 29, 30 and 31** count on the month's last day in a shorter month.
  Workbook silently drops them, because those days do not exist in the window it
  lists. Recorded as D6.

---

## F9 — Rounding a savings fund's monthly contribution

**Decided 2026-09-22. Engineering default.**

```
Savings!Z14  =IFERROR((F14-J14)/V14, 0)   [88.9047619]   format "$"#,##0
Savings!Z14  note: "This is your new monthly goal!"
```

Workbook keeps the full fraction and displays it rounded to the dollar ($89).
Money in the app is whole cents, so the fraction has to go somewhere.

**Options considered**

- **A — round up to the cent** ($88.91). Saving it every month reaches the
  goal on time.
- **B — round half-up to the cent** ($88.90). Can fall a few cents short by
  the goal date.
- **C — Workbook's whole dollars** ($89). Hides cents the rest of the app shows.

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

**Chosen:** both, each where Workbook has it. The Year screen gates planned
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
with no objection.** Decision 9 is "Workbook's arithmetic mistakes are fixed and
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
- **B — Workbook's literal result:** income − expenses, savings ignored.
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
588). Workbook displays whole percent; basis points keep two more places without
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

**OPEN.** To be put to the account holder at slice S15b, before any Paycheck
code is written.

```
Paycheck Budget!D6   2025-01-01          D7  2025-01-14     (both typed)
Paycheck Budget!E22  =IF(F22, E50 / 2, D50)   [800]          F22  FALSE
START HERE!C8        2025-01-10 (first pay date)             E8   Bi-weekly
```

Workbook's Paycheck tab takes a typed start and end date. A tick box (F22) halves
a bill's monthly amount with a fixed ÷2, whatever pay frequency START HERE!E8
says; unticked, it counts the bill only if its due day falls in the window
(F8).

**Options to put to the owner**

- **A — copy Workbook.** Type both dates; halve a monthly bill with ÷2.
- **B — find the period from the Income row's pay schedule**, and divide a
  monthly bill by the pay frequency: 4.333 weekly, 2.1667 bi-weekly, 1 monthly.
- **C — find the period from the pay schedule**, and divide a monthly bill by
  the number of paydays that actually fall in that month.

No option is chosen. A split that divides money also needs a rounding rule;
that is settled with the answer.
