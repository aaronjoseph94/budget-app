# Divergences from the workbook

Deliberate differences between this app and the source Excel workbook. Each
entry states the workbook's value, the value chosen here, and why.

A divergence is only valid once recorded here. Silently matching the workbook
is the default; departing from it requires this file.

---

## D1 — Money is rounded to whole cents each month

**Date:** 2026-09-21
**Sheet / cells:** Debt Calculator, B26:Y496

**Workbook behaviour.** Excel carries the amortization in IEEE-754 doubles and
retains sub-cent fractions indefinitely. Credit Card 1's month-2 balance is
`13087.92917` — a balance of 13,087 dollars, 92 cents, and 917 microcents.

**Chosen behaviour.** Interest accrues at `apr / 12` and is rounded half-up to
the cent each month, on integer minor units throughout.

**Why.** Fractions of a cent cannot be paid, received, or reconciled against a
statement. A balance that is not expressible in real money is not a balance.
Carrying sub-cent state would also require floating-point money everywhere,
which `CONSTRAINTS.md` forbids precisely because it produces numbers that
cannot be verified against a bank.

**Measured effect.** Across all four debts and their full schedules
(162 months total), the largest divergence from the workbook is **5 cents**, on
Credit Card 1 near the end of a 111-month run.

| Debt | Workbook payoff | Engine payoff | Max divergence |
|---|---|---|---|
| Credit Card 1 | month 111 | month 111 | 5c |
| Credit Card 2 | month 23 | month 23 | 3c |
| Car Loan | month 16 | month 16 | 0c |
| Student Loan | month 12 | month 12 | 1c |

**Every payoff month and the debt-free date are identical.** No decision a user
would make changes. The divergence is bounded and asserted as a hard ceiling in
`debt-payoff.golden.test.ts` — not a tolerance. If rounding ever gets worse,
the test fails.

---

## D2 — Cleared debts do not roll their payment forward

**Date:** 2026-09-21
**Sheet / cells:** Debt Calculator, H26:Y496

**Workbook behaviour.** Each debt pays only its own minimum for its entire
life. When the Student Loan clears at month 11 and the Car Loan at month 15,
that freed-up $475/month is not redirected. Credit Card 1 still takes its full
110 months, and the workbook reports debt-free May 2034.

**Chosen behaviour.** `amortize()` reproduces this exactly, because the golden
test requires it.

**Why this is recorded anyway.** The workbook's answer is *correct arithmetic
for a strategy nobody would choose*. Redirecting freed payments (the "snowball"
and "avalanche" strategies) pays the same debts off years sooner for the same
monthly outlay.

**Consequence.** Snowball/avalanche is a **new capability** this app adds, not
a port. It will be a separate function with independently derived test cases —
the workbook cannot verify it, because the workbook cannot do it. The flat
schedule remains the golden-verified baseline that proves the underlying
amortization is right.

---

## D3 — One signed ledger replaces three parallel ones

**Date:** 2026-09-22
**Sheet / cells:** Transactions!B:E (spending: date, category, amount, notes),
G:I (income) and K:M (savings transfers), read by the month blocks on the
Jan..Dec tabs (Jan!M8:V16 for income and savings, Jan!B20:V45 for bills, debts,
subscriptions and variable expenses)

*Sheet line corrected 2026-09-22.* It first named a "Monthly Budget" and a
"Weekly Spending" sheet; the workbook has neither.

**Workbook behaviour.** Direction is carried by *location*. Income rows live on
one block, expenses on another, and transfers on a third; every amount is
written as a positive number, and what it means depends on which block it sits
in. A formula sums a range and knows the sign from the range it summed.

**Chosen behaviour.** One `transactions` table with a signed `amount_cents`:
**outflows negative, inflows positive.** Direction is a property of the row.

**Why.** A database filters where a spreadsheet had to separate. Keeping three
tables to preserve the layout would mean three dedupe indexes, three RLS
policies, and a categorization path per table — and every cross-cutting
question ("what did this week actually cost?") becomes a union. With a signed
column, a net figure is a sum, and the sign cannot be lost by reading a row
without knowing which table it came from.

**Consequence.** Anything that assumed positive-means-spend must say so
explicitly. A category total for a spend category is a negative number, and
the display helper is responsible for rendering it as `$80.00` under a heading
that already says it is spending — not for deciding what it means.

**Not a maths change.** No workbook figure moves. This is how a row is stored,
not how any total is computed, and the debt golden case is untouched by it.

---

## D4 — Every CSV field is trimmed, against RFC 4180

**Date:** 2026-09-22
**Sheet / cells:** not workbook-derived; a property of the import path

**Standard behaviour.** RFC 4180 treats spaces as field content. `COFFEE   ,`
has a merchant of `COFFEE` followed by three spaces, and a conforming reader
preserves them.

**Chosen behaviour.** `tokenizeCsv` trims leading and trailing whitespace from
every field, quoted or not.

**Why.** The merchant string is an input to the dedupe hash. Exports pad
columns inconsistently between downloads of the same statement — a pending row
and its posted counterpart often differ by nothing but padding — and an
untrimmed field makes the same charge hash differently on re-import, so it
enters the ledger twice. That is the silent-duplicate failure the hash exists
to prevent, reintroduced by faithfulness to a specification that has no opinion
about ledgers.

**What this costs.** A merchant whose name genuinely begins or ends with a
space cannot be represented. No such merchant exists in practice, and the
alternative costs duplicated transactions.

**Frozen.** This is now an input to `DEDUPE_HASH_VERSION` 1. Changing the
trimming rule changes every stored hash and therefore requires a version bump
with a backfill in the same migration, exactly as changing the hash's field set
would. It is recorded here so that a later "let us preserve whitespace
properly" cleanup is recognised as a migration rather than a tidy-up.

**Extended 2026-09-22: internal whitespace is collapsed too.** Every run of
whitespace inside a field becomes one space. This exists for the line break in
a quoted field: Amex extended details and several UK exports put a multi-line
memo in the merchant column, and that is a real transaction, not a malformed
one — but a descriptor is a single-line field, and `IngestedTextSchema` rejects
control characters precisely because text rendering across lines can push
content out of a reviewer's view. Without the collapse, a legitimate purchase
goes to the review queue every month over its formatting. It also stabilises
the hash: the same memo arrives CRLF-separated in one download and
LF-separated in the next.

Only whitespace is neutralized. The bidi overrides and isolates are not
whitespace, so a descriptor that displays differently than it is stored still
reaches the schema's guard and is still refused.

**Not applied elsewhere.** `IngestedTextSchema` deliberately does not trim; one
module owns this normalization and it is the tokenizer.

---

## How the Workbook entries below were settled

D5 to D16 come from the Workbook plan (`docs/workbook-plan.md`, answered in §9a).
Each says how it was settled: **owner chose** (asked, and answered),
**stated to the owner, no objection** (told what would be done unless they
said otherwise; they did not choose it), or **engineering default** (not put
to the owner). Cached values are re-read from the workbook.

---

## D5 — A real charge replaces a bill's planned amount

**Date:** 2026-09-22
**Sheet / cells:** Jan..Dec E22:E44, K22:K44, P22:P44; Bills!D7:D29, H7:H29,
L7:L29 and the log O7:R30; formula decision F3
**Settled:** owner chose (plan decision 3)

**Workbook behaviour.** A bill's month Actual is its fixed Monthly Amount plus
every payment logged for it (`Jan!E22 =Bills!D7+SUMIFS(Bills!Q:Q,…)`). The
sample's Credit Card 1 is $50 fixed plus a $200 payment: Paycheck
Budget!L50 = **250**, Annual Budget!K29 = **550**.

**Chosen behaviour.** If a bill, debt or subscription category has any real
ledger row in the window, its Actual is those rows and the planned amount is
ignored. Only with no real row does the planned amount count, labelled
"planned". The same sample would show 200.

**Why.** With imported statements Workbook's rule counts every card-paid bill
twice: Netflix set up at $17.99 plus its $17.99 statement line makes $35.98.
Workbook's own note on Bills!Q5 says the log is for bills "that have changing
amounts each month … OR are paid at various times", so its author expected a
bill to be fixed or logged, not both.

**What it costs.** A typed *extra* debt payment replaces the planned payment
rather than adding to it. The cells where the two rules differ are left out of
the golden fixtures (plan §5.4).

---

## D6 — A due day of 29, 30 or 31 counts in a short month

**Date:** 2026-09-22
**Sheet / cells:** Bills!B7:B29, F7:F29, J7:J29 (day paid); Weekly Budget!D50
and Paycheck Budget!D50 (the day match); Bill Calendar's day grid
**Settled:** engineering default

**Workbook behaviour.** A partial window matches a bill's day paid against the
days that exist in the window, so a bill due on the 31st never matches in a
30-day month and one due on the 30th vanishes in February. Bill Calendar
likewise has no cell for the missing days. No sample bill is due after the
23rd, so no cached value shows it.

**Chosen behaviour.** A due day past the end of a month counts on that month's
last day (formula decision F8).

**Why.** Rent due "on the 31st" is still due in April. Dropping it makes a week
look $1,600 cheaper than it is, with nothing on screen to say so.

---

## D7 — Workbook's arithmetic mistakes are fixed

**Date:** 2026-09-22
**Sheet / cells:** Annual Budget!P9, Q9, J9, V9, W9, D15, D20; Bills!H36
**Settled:** stated to the owner, no objection (plan decision 9)

**Workbook behaviour.**

| Cell | Formula | Cached | Mistake |
|---|---|---|---|
| Annual!P9 | `=SUM(P10:P36)` | 1803.97 | runs past the twelve month rows into the Subscriptions card below |
| Annual!Q9 | `=SUM(Q10:Q36)` | 4819.85 | the same; Annual!D11 and N6 repeat it |
| Annual!J9, V9, W9 | `=SUM(J10:J16)` and so on | 19400, 3000, 0 | sum seven months, not twelve |
| Annual!D15, D20 | `=D9+O6-D11-U6` | −4819.85 | read the blank O6 and U6 (formula decision F12) |
| Bills!H36 | `=SUM(D32,H32,G46)` | 850 | G46 is empty, so subscriptions ($17.99) are dropped from "all fixed" |

**Chosen behaviour.** Each total sums exactly the rows it is labelled for, over
twelve months; D15 and D20 follow F12; "all fixed" is bills + debts +
subscriptions.

**Why.** These are range typos, not choices. J9 and V9 happen to be right in
the sample only because August–December goals are 0, so the fix is covered by
a hand-derived test rather than a cached cell.

Bill Calendar's own mistakes fall under the same decision: its first Sunday
cell (Bill Calendar!B9) reads the log as `Bills!$P$7:$Q44` where every other
day reads `$P$7:$Q$30`, it shows at most five bills a day, and it drops days
29–31 in short months (D6).
They are recorded against their cells when the calendar is built (S15c).

---

## D8 — Money is shown with its cents and its minus sign

**Date:** 2026-09-22
**Sheet / cells:** Jan..Dec Actual columns P10:P16, U10:U16, E22:E44,
K22:K44, P22:P44, U22:U44 (format `"$"#,##0.00;;`); Difference and Remaining
columns V10:V16, V22:V44 (format `"$"#,##0.00;"$"#,##0.00;`); Bills!D32, H32,
L32 (format `"$"#,##0`); Jan's income chart
**Settled:** engineering default

**Workbook behaviour.** On the Actual columns the `;;` format shows nothing
for a negative or a zero, so a month where refunds beat purchases in a category
shows an empty cell. On the Difference and Remaining columns the format shows a
negative *without its minus sign*: Jan!V10 holds **−3000** (no savings against
a $3,000 goal) and shows "$3,000.00", which reads like money saved. The Bills
totals round to the dollar: L32 holds **17.99** and shows "$18". The income
chart stacks Actual on top of Goal.

**Chosen behaviour.** A negative Actual, Difference or Remaining shows its
minus sign. A zero Actual on a budgeted row stays blank, as in Workbook. Totals
show cents. The income chart draws Actual over a Goal track.

**Why.** A hidden negative is a number the owner cannot see is wrong, and a
total that disagrees with its own rows by a rounding is a total they stop
trusting. Display only: no value changes.

---

## D9 — Paying the card is neither spending nor income

**Date:** 2026-09-22
**Sheet / cells:** Bills!O7:R7 (2025-01-05, Credit Card 1, 200, "Paid off my
balance!"), read into Jan..Dec K22 and Paycheck Budget!K50 and L50
**Settled:** stated to the owner, no objection (plan decision 4)

**Workbook behaviour.** The sample logs a $200 card payment as a Debts payment,
and it counts in Spent: Paycheck Budget!K50 = **250** ($50 + $200) feeds L22,
and Spent (D11) is **1135**.

**Chosen behaviour.** "PAYMENT, THANK YOU" is filed to "Card payments" in the
app-only "Not spending" list. It is in no block, no total, and not income; a
footnote says "Paid to your card: $… — not counted". Card interest and fees go
to "Card interest & fees" under Variable expenses (plan decision 14).

**Why.** The purchases the payment covers are already counted, one by one,
from the same statement. Counting the payment too would count them twice.

---

## D10 — A month is always read in its own year

**Date:** 2026-09-22
**Sheet / cells:** Hidden!J4:U15 (reads Jan..Dec by position); Annual
Budget!Q11, K9, W9, W30
**Settled:** engineering default

**Workbook behaviour.** Annual Budget shows 2025 (D6) but reads spending,
income and savings from the month tabs, which are dated 2026, matching by
month name alone. Q11 = **867.99** includes February 2026 spending ($0);
February 2025's $356 of spending is never read. K9, W9 and W30 are **0** where
the sample's 2025 rows give 2600, 2000 and 235.

**Chosen behaviour.** Every window takes its year from its own dates (formula
decision F4). February 2025 on the Year is February 2025 in the ledger.

**Why.** The app has one ledger with real dates, not twelve tabs with a year
typed on each; there is no second year to read by mistake. Formula decision
F11 explains how the year fixture is transcribed so the golden cells still
hold.

---

## D11 — Lists have no fixed number of rows, and a name lives in one list

**Date:** 2026-09-22
**Sheet / cells:** START HERE!B8:B14, H7:H14, B18:B40, D18:D40, F18:F40,
H17:H40; Jan!S10:S16 and S22:S44; Bills!T7
**Settled:** engineering default

**Workbook behaviour.** Each list has a fixed number of slots: 7 income
sources, 8 savings funds, 23 bills, 23 debts, 23 subscriptions, 24 variable
expenses. The month tabs show only the first 7 funds (Jan!S10:S16 =
`'START HERE'!H7`…`H13`) and the first 23 variable expenses (S22:S44 = H17…H39),
while the Transactions dropdowns allow all 8 and all 24, so an 8th fund or a
24th category is typed and never counted. Every tab reads a name by its cell
position. A name typed in two recurring lists resolves to the first match
(Bills!T7, a `COUNTIF` chain: Bills, then Debts, then Subscriptions).

**Chosen behaviour.** A list holds any number of categories. Rows are keyed by
id, so renaming or reordering never orphans past rows. A category belongs to
exactly one list.

**Why.** A category that can be typed but never counted is a silent loss, and
a name that means two things depending on lookup order is a guess. Moving a
category to another list is refused while it has a monthly amount in effect;
Setup says "remove the monthly amount first".

---

## D12 — A budget carries forward until changed

**Date:** 2026-09-22
**Sheet / cells:** Jan..Dec D22:D44, J22:J44, O22:O44, T22:T44 (budgets),
O10:O16 and T10:T16 (goals)
**Settled:** engineering default (plan decision 5: "from this month on" is the
default, and "just this month" stays on offer)

**Workbook behaviour.** Each month tab has its own typed budgets and goals,
twelve independent sets. The sample fills only January; February–December are
typed 0 or blank (Feb!D22 = 0), which is why Annual Budget!D29, the year's
Bills budget, is **800** and not 9600.

**Chosen behaviour.** A budget typed "from this month on" applies to that month
and every later month until another is typed; "just this month" applies to that
month only. The engine resolves each month: a "just this month" value wins,
else the latest "from this month on" value at or before it, else no budget.
Nothing is copied forward.

**Why.** Twelve retyped budgets a year, forever, is the work the app exists to
remove. Resolving on read, instead of copying values into later months, keeps
Workbook's property that editing October never rewrites January, and lets a
later "from this month on" edit to January still reach March. The sample is
expressible exactly, so golden values hold.

---

## D13 — A planned bill amount applies from a month onward

**Date:** 2026-09-22
**Sheet / cells:** Bills!D7:D29, H7:H29, L7:L29 (Monthly Amount), read by
every month tab
**Settled:** engineering default

**Workbook behaviour.** One Monthly Amount per bill serves all twelve tabs:
Jan!E22 and Dec!E22 are both **800**, from Bills!D7. Changing it rewrites
every month, past ones included.

**Chosen behaviour.** A monthly amount applies from the month it is set and
every month after, until changed or stopped. Raising rent from $1,600 to $1,700
in October leaves September at $1,600. A bill set up today does not appear in
earlier months.

**Why.** A one-year workbook can afford one amount for every month. An app
holding years of history cannot: last year's rent would change the day this
year's goes up.

---

## D14 — A week runs Monday to Sunday

**Date:** 2026-09-22
**Sheet / cells:** Weekly Budget!D6 (typed start, 2025-01-01, a Wednesday),
D7 `=D6+6`
**Settled:** engineering default; the Week screen already worked this way
(`packages/core/src/week.ts`)

**Workbook behaviour.** A week is whatever seven days follow the typed start
date. The sample's week runs Wednesday to Tuesday.

**Chosen behaviour.** Weeks are Monday to Sunday, stepped with ‹ ›. The
"/wk?" tick box (Weekly!F22; E22 `=IF(F22, E50 / 4.333, D50)`) is not built; a planned
amount counts in a week when its due day falls in it (formula decision F8).

**Why.** A fixed week can be stepped through and compared with the last one;
a typed week has to be retyped each time. Monday-first keeps a weekend
together.

---

## D15 — A savings fund with no dates says so instead of showing $0

**Date:** 2026-09-22
**Sheet / cells:** Savings!Z15 `=IFERROR((F15-J15)/V15, 0)`, cached **0**
**Settled:** engineering default

**Workbook behaviour.** Travel Fund has no start or goal date, so V15 is empty,
the division fails, and `IFERROR` shows a monthly goal of $0.

**Chosen behaviour.** The engine returns no monthly contribution, and the
screen says "no dates yet".

**Why.** $0 a month reads as "nothing to save", which is the opposite of true.
The CONSTRAINTS.md floor forbids a silent 0 on a money path for this reason.

---

## D16 — A savings fund's balance: typed once, then kept by transfers

**Date:** 2026-09-22
**Sheet / cells:** Savings!B5, F5 … Z5 ("Current Amount", typed; B5 note:
"How much do you currently have in this Savings account or fund?")
**Settled:** owner chose (plan decision 7, option B), asked and answered on
2026-09-23.

**Workbook behaviour.** Each fund's current amount is typed by hand and
nothing updates it. The sample's Emergency Fund shows **133** (Savings!B5)
while the Transactions log records a $2,000 transfer into it (K7:M7).

**Chosen behaviour.** Type the balance once; each savings transfer recorded
in the app after that adds to it. The alternative (option A) was to type it
every time, as Workbook and the app do today.

**Why.** A balance that has to be retyped goes stale, and the transfers are
already recorded for the Month's Savings block.
