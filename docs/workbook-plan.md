# Workbook in the app: the build plan (revised)

**Status: answered 2026-09-22 — the owner's answers are in §9a, and they amend the tables below where marked. Building from S0.** Written from the owner's copy of the "Ultimate Annual Budget" (Workbook) workbook, which is never committed (CLAUDE.md). Every cached value cited below was re-read from that file's cached Excel values; the fixtures in §5.3 must be transcribed from it again, each with a header naming sheet and range. Branch `main` at `b90086e` when written.

**The short version, for the owner:**
- **Month screen.** It looks and works like Workbook's Jan–Dec tabs. It is one screen, and arrows change the month.
- **Year screen.** It combines Workbook's Annual Budget and Home tabs. You choose the month it starts from, as in Workbook.
- **Setup screen.** It combines Workbook's START HERE and Bills tabs. The lists keep Workbook's names: Income, Savings, Bills, Debts, Subscriptions and Variable expenses.
- **Your statement fills them in.** The Rogers statement fills the Month and Year screens once you have told the app which Workbook list each shop belongs to. You do that once per shop.
- **Card payments don't count.** "PAYMENT, THANK YOU" never counts as spending or income. Card interest and fees go to "Card interest & fees" (decision 14).
- **Three times you paste SQL.** Database changes arrive in three batches. You paste each batch into Supabase once, and the screens that need it wait until you say it worked.
- **When you first see it.** Slice S5b is the first time you see a Workbook month filled from your statement.

---

## 1. What Workbook is

Workbook is a chain of typed lists and lookups.

- **START HERE** holds your name (I3) and six fixed-size name lists: 7 income sources (B8:B14), 8 savings funds (H7:H14), 23 bills (B18:B40), 23 debts (D18:D40), 23 subscriptions (F18:F40) and 24 variable expenses (H17:H40).
  - Every other tab reads those names by cell position.
  - The month tabs show only the first 7 savings funds (Jan!S10:S16 → H7:H13) and the first 23 variable expenses (S22:S44 → H17:H39). The Transactions dropdowns still allow all 8 and all 24 (`'START HERE'!$H$7:$H$14`, `$H$17:$H$40`). So an 8th fund or a 24th category is typed but never counted.
- **Money is typed in two places:**
  - **Bills.** Each bill, debt and subscription gets a "Day Paid" and a "Monthly Amount" once. There is also a dated Variable Bills log (O:R, with notes in R). The notes on Bills!D5 and Q5 say the log is for bills whose amount changes or which are paid irregularly.
  - **Transactions.** Three side-by-side logs:
    - spending: date · category · amount · notes (B:E; E7 "Bubba's BBQ with Frankie!")
    - income: G:I
    - savings transfers: K:M
- **The twelve month tabs (Jan–Dec)** are identical.
  - Each has a typed month date (Jan!D7), a typed starting bank balance (D9 = 1000 on all twelve tabs), and typed budgets and goals.
  - Each fills its six blocks with `SUMIFS` by category name and a date window:
    - Spending, income and savings Actuals come from Transactions.
    - Bill, debt and subscription Actuals are the fixed Monthly Amount every month, plus that month's log entries.
  - A summary card shows four numbers: start, spent, left to spend and projected end balance.
- **The year view.**
  - **Annual Budget** is a rolling 12 months from a typed start month (D6, note: "Choose any month…"; I11 adds one month at a time). It has a typed "today" (D7, note: "Enter today's date here!").
  - Annual reads the month tabs by month name through the hidden "Hidden" tab. It ignores which year they are for (§5.5).
  - **Spending Tracker** repeats the month-tab block totals for 12 months (rows 17–27).
  - **Home** shows the year as 15 scorecards, which Google flattened to images, and 11 native charts whose sources are Hidden ranges. Parts of it are driven by `TODAY()`.
- **Other views.** Weekly Budget and Paycheck Budget re-run the month logic over a typed date window. Weekly starts on whatever date you type (D6 = Wednesday 2025-01-01).
- **Standalone calculators.** Savings, Debt Calculator (with Hidden Debt), Net Worth and Financial Freedom work on typed inputs.
- **The rest.**
  - 503020 tags categories NEED or WANT.
  - Bill Calendar places bills and paydays on a Sunday-first month grid (B6 "S U N D A Y"). The paydays come from START HERE!C8:E14.

## 2. The mapping

| Workbook tab | Becomes in the app | Slice | Notes |
|---|---|---|---|
| Home | Top of the **Year** screen ("year at a glance"), drawn in Home's palette (§6.6). It shows the greeting, income/expenses/savings totals and pie, "Left over", biggest expense, top-3 doughnuts and best savings month. The savings-goals chart and debt chart come later. | S13–S14 (+S16, S17) | Its `TODAY()` window (Hidden!M18/O20/P20) becomes an explicit `asOf`. The 15 flattened scorecards (Chart1…Chart37 PNGs) have no formula, so each value is matched to a Hidden cell by value. The 11 native charts keep their sources. **Not reproduced under decision 2's defaults:** the net-worth tile ($191, Chart14 at L9 ← Hidden!Q51 = 'Net Worth'!C6), the 50/30/20 goal-vs-actual bars (Hidden!P31:S33), and the three spending-group bars (Hidden!J86:K91, from Spending Tracker's own groups). |
| START HERE | **Setup** screen: your name plus the six lists under Workbook's own headings, plus one app-only list, "Not spending" | S2a, S2b | Rows are keyed by id, not cell position, so renaming never orphans old rows. There are no 7/8/23/24-slot limits (D11). Income start date and frequency (C8:E14) are not built; only Bill Calendar reads them. |
| Bills | Inside **Setup**: "Day paid" and "Monthly amount" on every Bills, Debts and Subscriptions row, effective from the month you set them (D13), plus the three total tiles | S9 | The Variable Bills log (O:R) is not a separate log. A real charge or a typed payment in that category *is* the log entry. §3.4 explains how planned and real amounts combine. |
| Transactions | The **ledger** (`transactions`, already exists), filled by statement, photo and typed entry | exists | Workbook's three logs (Transactions!B:E, G:I, K:M) become one signed ledger (D3, whose sheet citation S0 corrects). A row's list decides which block it feeds. Workbook's Notes column has no counterpart yet (§10). |
| Jan … Dec | **One Month screen** with ‹ › | S4–S12 | This is exactly the roadmap's own "one month view with a period selector". |
| Weekly Budget | The existing **Week** screen, rebuilt as Workbook blocks on the same engine as Month | S15 | The "/wk?" option (monthly amount ÷ 4.333) is not built. Weeks stay Monday–Sunday (D14). |
| Paycheck Budget | **Paycheck** screen (owner chose it, §9a): the Month blocks over one pay period, found from the pay schedule of an Income row | S15b | Workbook types both dates (Paycheck!D6/D7) and halves a monthly bill with a fixed ÷2 (Paycheck!E22 `=IF(F22, E50 / 2, D50)`) whatever the pay frequency in START HERE!E8. How the period and the split are found is formula question F15; on 2026-09-23 the owner chose B, the period from the pay schedule and a monthly bill divided by the pay frequency. |
| Annual Budget | **Year** screen plus `yearSheet`, starting at a month you choose | S13, S14 | Its arithmetic mistakes are fixed (decision 9). It is always read in one year (D10). |
| Bill Calendar | **Bill calendar** screen (owner chose it, §9a): a Sunday-first month grid of bills due, charges paid and paydays, with week and month totals | S15c | Due days exist from S9. Paydays need a pay schedule per Income row (first pay date and Weekly / Bi-weekly / Monthly, START HERE!C8:E14), added in Sitting B. Workbook's own calendar bugs are fixed under decision 9 (Bills!P7:Q44 range typo on Sundays, 5-bills-a-day cap, days 29–31 skipped). |
| 503020 | **Not built** (owner did not choose it, §9a) | — | Tags would be keyed by category. Workbook's tags (H12:H58) are positional, next to a `FILTER`-compacted list, so they drift when a list changes. |
| Savings | **Savings** screen: `savings_goals` (exists) linked to a Savings-list category, plus `savingsFundPlan` | S16 | Seven fund cards become any number. |
| Debt Calculator | **Debts** screen. `amortize()` is already golden-verified. | S17 (roadmap Phase 7) | Needs tables and an as-of status function. |
| Spending Tracker | Its 12-month grid of block totals (rows 17–27) becomes part of Year. Its second taxonomy is **not built**: 12 fixed groups in E31:E125 ("Home & Utilities", "Groceries", …). | S13, S14 | That taxonomy is a second list you would maintain only to feed Home's three group bars. Year shows your own top categories instead. |
| Net Worth | **Not built** | — | It needs 222 typed numbers a year (17 line items × 13 columns), and no weekly decision depends on it. |
| Financial Freedom | **Not built** | — | The roadmap deferral stands: a 35-year horizon against a goal about two years away. |
| Hidden | Engine functions only (`yearSheet`, top 3, 50/30/20 roll-up) | — | No screen. |
| Hidden Debt | Engine only (`amortize`, exists) | — | Its dead sections (ACCELERATOR, COUNTDOWN, and a reference to a missing "Subscription Computations" sheet) are not ported. Snowball is the roadmap's own new capability (D2). |

**Where the roadmap changes.** S0 edits `docs/ROADMAP.md` and `CAPABILITY-MAP.md` (including its "Slice order for delivery") to say the following:

| Roadmap said | Now | Why |
|---|---|---|
| Twelve month tabs become one month view with a selector | Built as exactly that (S5b) | No conflict. |
| "Weekly is the primary lens" (ROADMAP; CAPABILITY-MAP: "the user thinks in weeks") | Your call (decision 1). Recommended: Month opens first, Week one tap away. | Both files record weekly-first as how you think. You have since asked for Workbook, whose money lands on month tabs, so decision 1 asks you instead of assuming either way. |
| Paycheck view "superseded" because weekly is primary | Built (S15b) | The owner asked for it (§9a). |
| 50/30/20 demoted to a report | Not built | The owner did not choose it (§9a). |
| "The workbook is no longer the specification" | For the look and behaviour of the Workbook views you choose, it is again. For its arithmetic mistakes and the deferred tabs, it is not. | You asked for Workbook. |
| Phase 3 savings coach is next | Moves behind S1–S15 | You asked for Workbook first. The coach will read the same `monthSheet` numbers, so nothing is wasted. |
| Phases 5–7 come after the coach | Parts of them move ahead of Phase 3: bills and recurring amounts from Phase 5 (not the calendar, reminders or forecast), charts from Phase 6 (not Sankey or export), savings funds and the debt screen from Phase 7 (not net worth or retirement) | The Workbook views need them. |
| Net worth and retirement deferred | Still deferred | Unchanged. The 222-number count strengthens the deferral. |

## 3. How imported transactions fill in Workbook

### 3.1 One Rogers row to one Workbook cell

The example row is `Aug 7  Aug 10  LAVA GRILL RED DEER AB  31.45` (docs/formula-decisions.md F1).

| Step | Code | What happens |
|---|---|---|
| 1 | Add → Statement; `packages/statement-parsers/src/pdf/*`, `formats/rogers.ts` | The date is **Aug 7**, the transaction date (F1). The amount is **−3145** cents, negated (F2). The raw merchant text is kept, and so is the statement period (`readPeriod`). |
| 2 | `reconcileStatement` (core) | Parsed rows must exactly equal the statement's printed purchases, payments and balance equation, or the import is refused. |
| 3 | `save_import` RPC (0004; the version from migration 0007 also records the statement period) | The dedupe hash drops rows already in the ledger or the queue. The rest become pending `ingest_candidates`. A candidate whose normalised merchant **exactly** matches a `merchant_rules` row is auto-approved and posted. |
| 4 | Review screen → `approve_candidate` | First sighting only: you pick "Restaurants" from a picker grouped by Workbook list. The row posts to `transactions`, and the rule LAVA GRILL → Restaurants is learned. |
| 5 | Month screen → `monthSheet` (core) | The screen reads the ledger for 2026-08-01..31. The read is paged with an exact count and refuses to show a partial month (today's `listTransactions` stops silently at `.limit(2000)`). It also reads categories (with their list), budgets and planned amounts. Restaurants is in Variable expenses, so the charge lands in **Variable expenses → Restaurants → Actual $31.45**. Remaining becomes budget − 31.45, and Spent rises. This is Jan!U22's rule (`SUMIFS` by category, date ≥ first of month and ≤ `EOMONTH`), keyed by category id instead of name. |

Nothing is stored per month. Renaming a category, moving it to another list or re-filing a row changes every month on the next read (CLAUDE.md: never persist a derived money value).

### 3.2 Workbook's six lists become category `kind`

| START HERE list (Workbook heading) | `kind` | Month block | Actual is | Budget column |
|---|---|---|---|---|
| Income, "Source" (B8:B14) | `income` | Income | money in (+) | "Goal" (Jan!O10:O16) |
| Savings (H7:H14; month tabs show H7:H13) | `savings` | Savings | money moved to savings | "Goal" (T10:T16). Difference = Actual − Goal (V10). |
| Recurring expenses → Bills (B18:B40) | `bill` | Bills | real charges, else the planned amount (§3.4) | "Budgeted" (D22) |
| Recurring expenses → Debts (D18:D40) | `debt` | Debts | same | "Budgeted" (J22) |
| Recurring expenses → Subscriptions (F18:F40) | `subscription` | Subscriptions | same | "Budgeted" (O22) |
| Variable expenses (H17:H40; month tabs show H17:H39; note: "What transactions have varied amounts?") | `variable` | Variable expenses | money out, net of refunds | "Budgeted" (T22). Remaining = Budget − Actual (V22). |
| none (app-only): "Not spending" | `transfer` | no block, one footnote line | never counted | none |

### 3.3 What each kind of statement row does

| Row on a Rogers statement | Ledger amount | How it is filed | Where it shows |
|---|---|---|---|
| Purchase (LAVA GRILL 31.45) | −3145 | First time: one tap. After that: the learned rule. | Variable expenses → its category |
| Subscription charged to the card | − | The rule files it to a Subscriptions-list category | Subscriptions. It replaces that month's planned amount (§3.4). |
| **PAYMENT, THANK YOU −100.00** | +10000 | One tap → "Card payments" (Not spending). The rule is learned, so later ones file themselves. | In no block, no total, not income, not 50/30/20. Footnote: "Paid to your card: $100.00, not counted; what it paid for already is." This departs from Workbook, whose sample counts a $200 card payment in Debts (Bills!O7:R7, "Paid off my balance!"), so it is recorded as D9. |
| Refund or return | + | The shop's own rule files it to the same category (rules match the merchant, not the sign) | It nets against that category in that month. It is never income, because income is the `income` kind only. A refund with no purchase that month shows as a negative Actual with its minus sign. Workbook's `"$"#,##0.00;;` format would hide that row (D8). |
| Interest or annual fee | − | One tap → "Card interest & fees", a Variable-expenses category (decision 14). The rule is learned. | Variable expenses; counted in Spent. |

Money that never appears on the card:
- Rent and other bills paid from the bank use their planned amount from Setup.
- Pay is typed as "received" in an Income category (Add → Type it already supports "received").
- Moves to the flight fund are typed in a Savings category.

**Why card interest is not a Debts row.** In Workbook, the Debts Actual means *payments you make* (Bills!H7 plus the log). If the Rogers card were a Debts row with a Monthly amount, two things would go wrong:
- The planned payment would count in Spent every month, on top of the purchases in Variable expenses that it pays for. That is the double count §3.3 removes for "PAYMENT, THANK YOU".
- Under D5, one $4.12 interest charge would replace the planned $50, so one row would hold two different kinds of number.

The schema cannot tell which category is "the card", so this is prevented three ways: interest goes to Variable expenses, the seed gives no debt a monthly amount (§7), and Setup's Debts card says "a card you pay off from your bank is not a monthly debt payment here — its purchases are already counted".

### 3.4 Recurring bills next to real statement rows, without double counting

Workbook's rule is Jan!E22 = `Bills!D7 + SUMIFS(Bills!Q:Q, Bills!P:P, C22, Bills!O:O, in month)`. That is the fixed Monthly Amount **plus** every logged payment. Workbook's own sample depends on this: Credit Card 1 shows $50 fixed plus a $200 payment. With imports, the same rule doubles every card-paid bill: Netflix set up at $17.99 plus the $17.99 statement charge makes $35.98.

**Recommended rule (decision 3; recorded as divergence D5 and formula decision F3).** Workbook's own cell notes support it. Bills!Q5 says the log "is for Bills that have changing amounts each month … OR are paid at various times". So the author expected a bill to be either fixed or logged, not both.

| Situation in the window | Actual | Label |
|---|---|---|
| One or more real rows in that bill's category | sum of the real rows; the planned amount is ignored | — |
| No real row, a planned amount is in effect for that month, and the due day falls in the window (always true for a whole month) | the planned amount | "planned" |
| Neither | $0 | — |

- **Planned amounts have start dates (D13).** A Monthly amount applies from the month you set it and every month after, until you change or stop it. Raising rent from $1,600 to $1,700 in October therefore never rewrites September. A bill set up today does not appear in earlier months. Workbook has one amount for every month, which a one-year workbook can afford and an app holding years of history cannot.
- **A blank due day** counts for a whole month but never inside a Week window. Workbook does the same: its day match runs `REGEXMATCH` against an empty string (Weekly!D50). Setup nudges you: "add a day paid so this shows in weeks".
- **Golden values are unaffected.** Every Jan–Dec month-tab golden value is the same under both rules, because the sample never has a fixed amount and a real payment for the same bill in the same 2026 month. The only 2026 log row is Student Loan $650 on 2026-02-10, and Student Loan has no Monthly amount (Bills!H10 is blank).
- **Where the rules differ.** Those cells are listed in §5.4 and left out of the fixtures.
- **What it costs.** A typed *extra* debt payment replaces the planned payment instead of adding to it (see §10).

### 3.5 What still needs a tap

- The first charge from every shop. After that, never again for that shop.
- Every photo-read receipt. Migration 0004 stops a model's category from ever being approved as-is.
- Pay and savings transfers, which you type (you are the reviewer).
- Planned bill amounts, budgets and (decision 6) each month's starting balance.

**Why the review queue stays:** a charge's category decides which Workbook block and which totals it lands in. Only an exact match you have already taught the app may make that decision without you (CLAUDE.md invariant 3).

## 4. Data model changes

These are forward-only migrations. **Apply 0003 and 0004 first,** using the SQL editor or a repaired CLI history (HANDOFF §3).

**Three sittings.** New migrations come in batches so that you paste SQL only three times:
- **Sitting A:** 0003–0007, before S2a.
- **Sitting B:** budgets, plans and balances, before S7.
- **Sitting C:** savings funds, then debts, before S16/S17.

Each migration is its own commit, and migration commits land on `main` harmlessly. **A code commit that reads a new column or table lands only after you confirm that sitting's SQL ran.** `main` deploys itself, and `AppDataProvider.refresh` loads categories on every screen. A code commit that selects `kind` before 0005 is applied would put a load error on the whole app.

Migration numbers are assigned in the order migrations are written. No number is reserved for a migration that may not happen.

Every migration that creates a table enables RLS and adds the `user_id = auth.uid()` policy in the same file. Each migration commit also extends `supabase/tests/schema-assertions.sql`, because today that file only checks the `rowsecurity` flag (line ~224). A table with RLS on and no policy would pass, and the isolation probe reads `transactions` only. So:
- 0005 adds a `pg_policies` check that every public table has an owner policy.
- Every new CHECK or trigger gets a refusal test.
- Every new function joins the anon-execute assertion (lines 441–450) and gets `revoke all … from public, anon`.

| Migration | Change | Workbook source and reason |
|---|---|---|
| `0005_category_kinds` | New enum `category_kind` (`income, savings, bill, debt, subscription, variable, transfer`). `categories.kind` is added `not null default 'variable'` to backfill existing rows, **then the default is dropped**, so a category created without a list is refused (23502). Also `sort_order int not null default 0` and `unique (id, user_id)` for composite foreign keys. | The six START HERE lists and their row order. Today `ensureCategory` is called with no list from `ReviewScreen.tsx:72`, `AddScreen.tsx:349` and `SettingsScreen.tsx:50`. Without this, a "Pay" category made in Add → "I received" would land in Variable expenses as a negative row. |
| `0006_recategorise` | `recategorise_transaction(p_transaction, p_category, p_learn)`: SECURITY DEFINER. It checks that `auth.uid()` owns both ids, updates the ledger row **and its source candidate's `category_id`** (`category_source = 'user'`), and optionally updates the merchant rule. It is granted to `authenticated` only. | 0004 revoked UPDATE on `transactions`, so fixing a mis-filed row needs a guarded function. The candidate must not be left saying the old category. |
| `0007_statement_periods` | `ingest_batches.period_start date`, `period_end date` (nullable). A 7-argument `save_import` records them. The 5-argument one stays, because migrations are forward-only. | "Statement imported up to Sep 7" must come from the statement, not from the latest row. Cash typed today would otherwise move it. |
| `0008_category_budgets` | Table `category_budgets(user_id, category_id, month date CHECK first-of-month, applies enum ('onward','only'), budget_cents bigint NULL CHECK ≥ 0, unique(user_id, category_id, month, applies))`, with a foreign key `(category_id, user_id)` → `categories(id, user_id)` on delete cascade. RLS and the policy. Writes are plain upserts under RLS. | The month tabs' typed Budgeted and Goal cells: D/J/O/T 22:44, O10:O16, T10:T16. |
| `0009_category_plans` | Table `category_plans(user_id, category_id, effective_month date CHECK first-of-month, planned_cents bigint NULL CHECK ≥ 0, due_day smallint NULL CHECK 1..31, unique(user_id, category_id, effective_month))`, with a composite foreign key. RLS and the policy. A trigger refuses a plan on a category whose kind is not bill, debt or subscription. A trigger on `categories` refuses moving such a category to another list while its current plan is non-null. | Bills!B/D, F/H, J/L. Effective-dated (D13); `planned_cents NULL` from a month means "stopped". |
| `month_balances` (decision 6 = B, chosen) | Table `month_balances(user_id, month, starting_balance_cents bigint signed, unique(user_id, month))`, with RLS and the policy | Jan!D9, typed on every tab (note: "Type in the Bank Balance you started the month with!") |
| `pay_schedules` (Sitting B, for S15b and S15c) | Table `pay_schedules(user_id, category_id, first_pay_date date, frequency enum ('weekly','biweekly','monthly'), unique(user_id, category_id))`, composite foreign key to `categories(id, user_id)` on delete cascade, a trigger refusing a category whose kind is not `income`. RLS and the policy. | START HERE!C8:C14 (first pay date) and E8:E14 (dropdown "Weekly,Bi-weekly,Monthly") |
| `savings_funds` | `savings_goals.category_id` (unique; composite foreign key **on delete restrict**; `SET NULL` on a composite key would try to null the NOT NULL `user_id`) and `savings_goals.start_date`. Plus `balance_as_of date` if decision 7 is B. | Savings!C4, N14, R14 |
| `debts` (Phase 7) | `debts(...)` and `debt_extra_payments(...)`, both with RLS and policies | Debt Calculator J18:J20 and I26:I494 |
| `needs_wants` | **Not built** (§9a) | 503020 |

What is *not* stored:
- Any Actual, total, Remaining, Left to spend, Left over, ending balance or year figure. `packages/core` computes these on every read.
- Your display name, which goes in the Supabase auth `user_metadata`, so no table is needed.
- Weekly budgets stay `categories.weekly_budget_cents` from 0004, unchanged.

**Budgets: one per month, or one for all months? Decided: store what you meant, and resolve it in the engine.**
- **"From this month on"** writes an `'onward'` row for that month.
- **"Just this month"** writes an `'only'` row for that month and nothing else.
- **Which value applies.** `packages/core` resolves each month:
  - an `'only'` row for that exact month wins;
  - otherwise the latest `'onward'` row at or before it applies;
  - otherwise there is no budget.
- **Why not copy values forward.** The earlier draft copied the old value into the next month. That copy went stale when an earlier month changed "from this month on". This way, editing January "from this month on" later still reaches March.
- **Goals.** Income goals and savings month goals use the same table.

Why this fits Workbook:
- Workbook has twelve independent typed budgets (Jan!D22:T44 … Dec). The sample's author filled only January: goals O10:O14 (4500, 600, 1200, 4100, 9000), T10 3000, D22 800, J22 150, O22 17.99 and T23 800. February–December budgets are typed 0 or left blank. (The starting balance D9 is the exception, typed 1000 on every tab.)
- So retyping twelve times does not happen in practice.
- Carry-forward keeps Workbook's month-by-month freedom and keeps its property that editing October never rewrites January (D12).
- The sample is expressible exactly: `'onward'` rows at 2026-01 hold January's values, and `'onward'` rows at 2026-02 hold 0.

## 5. Engine (`packages/core`)

### 5.1 Functions

All are pure: one input object in, one output object out. No I/O and no clock, and they import only `money-primitives`.

| Function | Input | Output | Workbook source | Slice |
|---|---|---|---|---|
| `periodSheet` (new `period-sheet.ts`) | `{ from, to, categories[{id,name,kind,sortOrder}], budgets[{categoryId,budgetCents\|null}], plans[{categoryId,plannedCents\|null,dueDay\|null}], entries[{postedOn,amountCents,categoryId,source}], statementPeriodEnds[], startingBalanceCents\|null }` (budgets and plans already resolved for the window) | Six blocks, each `{ rows[{categoryId,name,budgetCents\|null,actualCents,basis:'real'\|'planned'\|'none',remainingCents\|differenceCents, shareBp}], budgetTotalCents, actualTotalCents }`. Also `summary{spentCents, leftToSpendCents, incomeCents, savedCents, endingBalanceCents\|null}`, `transfersCents` and `importedThrough\|null`. | Jan!C19:V45 and D9:D15; Weekly and Paycheck rows 9–45 and 50–72 | S4, S7, S10, S11, S12b |
| `monthSheet` | `{ asOf, categories, budgetHistory[{categoryId,month,applies,budgetCents\|null}], planHistory[{categoryId,effectiveMonth,plannedCents\|null,dueDay\|null}], entries, statementPeriodEnds, startingBalanceCents\|null }` | `periodSheet` over `monthBounds(asOf)`, with budgets and plans resolved for that month | Jan … Dec | S4, S7 |
| `billsTotals` | `{ month, categories, planHistory }` | `{ billsCents, debtsCents, subscriptionsCents, allFixedCents }` | Bills!D32, H32, L32, H36 | S9 |
| `yearSheet` | `{ startMonth, asOf, categories, budgetHistory, planHistory, entries, startingBalances[{month,cents}] }` | Twelve month rows × (income goal/actual, expense budget/actual, savings goal/actual, four group budget/actuals). Also totals, `startingBalanceCents\|null` (the start month's), `endingBalanceCents\|null`, `leftOverCents` (decision 15) and `atAGlance` (biggest, top 3 with `shareBp`, best savings month). | Annual Budget; Hidden!I4:U15, I32:K42, P37:Q49; Spending Tracker rows 17–27; Home | S13a, S13b |
| `savingsFundPlan` | `{ goalCents, currentCents, startDate\|null, goalDate\|null }` | `{ amountNeededCents, monthsRemaining\|null, monthlyContributionCents\|null }` | Savings!B9, V14, Z14 | S16 |
| `monthsBetween` (money-primitives) | `(from, to)` | whole months, as Excel's `DATEDIF "M"` | Savings!V14 | S16 |
| `debtStatus` | `{ amortization, asOf }` | Per debt: current balance, paid, remaining. Also the total and progress in basis points. | Debt Calculator H9, B10, E20, I495:I496 | S17 |
| `needsWantsSplit` | `{ sheet, tags, goalBp }` | Needs, wants and savings+debt: goal, actual and share in basis points | 503020!G5:N7 | S18 |
| `weeklySummary` (exists) | adds `kind` per category | Spending covers the bill, debt, subscription and variable kinds, netted and signed as on the Month, so a refund-only week shows negative spending instead of vanishing. Money in counts the income kind only. Savings and transfers are excluded, and weekly budgets are summed over spending kinds only. The `?? ZERO_CENTS` in the budget sum goes too. | not from the workbook | S3b |

Charts get every percentage from here (`shareBp`). `chart-specs` only turns basis points into angles and bar lengths.

### 5.2 Excel semantics for the `period-sheet.ts` header

These are the formula decisions (F3–F14) that S0 records before any code:
- **F3 — Planned versus real.** The rule in §3.4 (D5).
- **F4 — Window.** Inclusive at both ends and date-only (Jan!U22: `">="&DATE(Y,M,1)`, `"<="&EOMONTH`). The year always comes from the window, never from a month name (D10).
  - Start-inclusivity is proven by cached rows dated 2025-01-01, the D6 of both Weekly and Paycheck.
  - End-inclusivity rests on the formula text only (`"<="&$D$7`), because no cached row falls on an end date.
  - Paycheck!X21 and K52 prove that the day after the end is excluded.
- **F5 — Left to spend (Month and Week only).**
  - It is the Variable-expenses budget remaining: Budget − Actual per row, summed (Jan!D13 = V21; Weekly!D13 = Y21).
  - A row with no budget counts as a $0 budget in the total, so unbudgeted spending lowers Left to spend. This is written as a named branch that cites F5, not as a `?? 0` fallback (CONSTRAINTS floor).
- **F6 — Savings sign.** Savings Difference is Actual − Goal (Jan!V10), the opposite sign to Remaining. It is kept as-is.
- **F7 — Spent and ending balance.**
  - Spent (Jan!D11 = `SUM(C19,I19,N19,S19)`) is Bills + Debts + Subscriptions + Variable expenses; savings are excluded.
  - The ending balance is start + income − spent − saved (Jan!D15 = `D9+N5-D11-S5`; Weekly!D15 = `D9+P6-D11-V6`). It is null when no start is typed.
- **F8 — Planned amounts by window.**
  - For a whole month they count regardless of due day, because the month tabs ignore Bills!B.
  - For a partial window they count only if the due day falls inside it (Weekly!D50 `REGEXMATCH`).
  - A blank due day never matches a partial window.
  - Days 29–31 clamp to the month's last day. This is D6, because Workbook silently drops them in short months.
- **F9 — Rounding.** A savings monthly contribution rounds up to the cent.
- **F10 — Which months count planned amounts.**
  - Annual gates them at its typed "today": `IF(... <= 'Annual Budget'!$D$7 ...)` in Hidden!O4.
  - The month tabs and Spending Tracker (rows 17–27) never gate.
  - So the Year screen gates at `asOf` and shows the year to date, as Annual does. A future month opened on the Month screen still shows its planned bills, as a month tab does.
- **F11 — How `workbook-year` is transcribed.**
  - Annual reads goals, budgets and the income, savings and spending Actuals from the **2026** month tabs by position, whatever its own year is. Examples: Hidden!J4 = `Jan!$O$9`, K4 = `Jan!$N$5`, M4 = `Jan!$U$9`, U5 = `Feb!$U$21`, and starting balances via D44 ← Hidden!J18 = `Jan!D9`.
  - Only Hidden!O, Q and S (bills, debts, subscriptions) use Annual's own year (2025, via Annual!C30).
  - The fixture therefore re-dates January's budgets, goals and starting balance from 2026-01 to 2025-01. Its ledger holds only the Bills-log rows, not the Transactions rows. This is stated in the fixture's `$semantics`.
- **F12 — Year "Left to spend" and "Ending balance"** (decision 15).
  - Annual!D15 (labelled "Left To Spend") and D20 ("Ending Balance") are both `=D9+O6-D11-U6`, and O6 and U6 are blank.
  - Under decision 15 A: D15 := D9 − D11 − D13 (income − expenses − savings), shown as **"Left over"** so it is not confused with the Month's budget-remaining "Left to spend". D20 := D18 + D9 − D11 − D13.
- **F13 — 50/30/20 shares.** They round half-up to a basis point.
- **F14 — Year span.** The Year covers 12 months from a chosen start month (Annual!D6; I11 `=DATE(YEAR(I10),MONTH(I10)+1,DAY(I10))`), not a calendar year.
- **Workbook's arithmetic mistakes are fixed (D7).** These fixes apply only if you agree to decision 9:
  - Annual!P9/Q9 `SUM(P10:P36)` runs into the Subscriptions card.
  - J9/V9/W9 sum only seven months (J10:J16).
  - D15/D20 read the blank O6/U6 (F12).
  - Bills!H36 `SUM(D32,H32,G46)`, where G46 is empty.

### 5.3 Golden fixtures

These are date-independent. Values are in cents, and each file's header names its sheet and range. Fixtures hold only the asserted cells and the minimum inputs, because their lines count toward the 300-line commit limit.

Several cached cells are single-addend sums or a budget minus zero. An engine that summed only the first row or ignored actuals would still pass them. So every fixture slice also carries hand-derived multi-row tests, clearly marked as Suite rather than External. The golden sets below add the few cached cells that subtract a real non-zero Actual.

| Fixture | Slice | Cells (sheet!cell = cached → cents) |
|---|---|---|
| `workbook-period` part 1 | S4a | Weekly Budget, window 2025-01-01..07: X22 85 → 8500, X21 85 → 8500, R10 2600 → 260000, X10 2000 → 200000. Paycheck Budget, window ..01-14: **X21 85 → 8500** (it would be 185 if Clothing on 2025-01-17 leaked in), R10 → 260000, X10 → 200000. |
| `workbook-period` part 2 | S4b | Paycheck!K52 0 (Car Loan $100 on 2025-01-15, D7 + 1, is excluded; no planned amount). Paycheck "Actual This Month" (keyed on $D$6 = January 2025): **L52 100 → 10000** (a real debt row lands in its month). Feb!K25 650 → 65000 (a real row with no planned amount). Mar!K25 0 (it does not leak into March). |
| `workbook-month` part 1 | S7 | Jan: D21 80000, J21 15000, O21 1799, T21 80000, O9 1940000 (five typed goals, the one multi-row sum), T9 300000, V10 −300000, V9 −300000, V23 80000, V21 80000, D13 80000. **Non-zero subtraction:** Weekly!Y22 6500 and Weekly!D13 6500 (budget 150 − actual 85), Paycheck!D13 6500. |
| `workbook-bills` | S9 | Bills: D32 80000, H32 5000, L32 1799 (plus hand-derived multi-row totals) |
| `workbook-month` part 2 | S10 | Jan: E21 80000, K21 5000 (the $200 dated 2025-01-05 is excluded, which is the year filter), P21 1799, D11 86799. Feb: K21 70000, D11 151799. Mar: K21 5000. Dec: D11 86799. Weekly: E22 80000 (due day 1 is in the window), L22 20000 (the real $200 is in the window; planned due day 14 is outside). Paycheck "Actual This Month": E50 80000, R50 1799 (a planned amount for January 2025). |
| `workbook-month` part 3 | S11 | Jan!D15 13201, Feb!D15 −51799, Weekly Budget!D15 51500 |
| `workbook-year` part 1 | S13a | Annual Budget (D6 = 2025-01, D7 = 2025-05, fixture per F11): **E29 400000 and Q29 8995** (5 × 800 and 5 × 17.99: non-zero proofs of the gate), **E34 80000** (May counts: the gate includes the current month), **E35 0** (June: the first gated month), D29 80000 (February's typed 0 stops carry-forward), J29 15000, P29 1799, V29 80000, P10 176799, Q14 86799, J9 1940000, V9 300000, D18 100000. Hidden!Q5 5000, Hidden!O15 0. |
| `workbook-year` part 2 | S13b | Spending Tracker (the 2026 tabs, ungated, so `asOf` 2026-12): M17 960000, M20 125000, M23 21588. |
| `workbook-week` | S15 | Weekly Budget: D11 108500, Y10 −100000, Y9 −100000, Q9 580000, W21 15000, K21 30000 |
| `workbook-savings` | S16 | Savings: B9 186700, F9 1600000, V14 21 months, Z14 88.9047619 → 8891 under F9 |
| `workbook-503020` | S18 | 503020: L7 80000, N7 5000, G7 0.9411764706 → 9412 bp, I7 0.05882352941 → 588 bp |
| existing `debt-payoff` (extended) | S17 | Debt Calculator column E (E26 775, E28 825) and column D (D27 20958) are the only new oracle data. Balances at an explicit asOf of 2026-09-01, which is month 19 (J44 11356.30966, O44 557.2168436), are already in the schedule fixture (B26:Y496); they are asserted by month index and never via H9. This waits for the final-month-interest decision. |

J9 and V9 pass whether or not the seven-month mistake is fixed, because the August–December goals are 0. The fix itself is therefore covered by a hand-derived test.

### 5.4 Cells deliberately left out

| Cells | Cached value | Why |
|---|---|---|
| Paycheck Budget!L22, L21, J19, K50, **L50**; D11, D15 | 250 (each); 1135, 465 | Workbook's fixed + real rule ($50 + $200). Under D5 the value is 200. |
| Annual Budget!K29, K30, H27, Q10; Hidden!Q4; Bill Calendar!J3, Q14 | 550, 350, 550, 1167.99, 350; 1167.99, 200 | The same rule applied to January 2025 |
| **Annual Budget!Q11** | 867.99 | Cross-year: W31 is February **2026** spending (Feb!U21 = 0). Reading the sample in one year gives 1223.99, because February 2025 has $356 of spending (Transactions!B10:D12). |
| **Annual Budget!K9, W9, W30** | 0, 0, 0 | Cross-year. A correct-year reading of the sample gives 2600, 2000 and 235. Under F11's fixture (no Transactions rows) these zeros would pass any engine. |
| Annual Budget!P9, Q9, N6, D11, D15, D20; Hidden!J41; Home Chart12/Chart31 | 1803.97, 4819.85, … | Range mistake and blank-cell mistake |
| Bills!H36 | 850 | `G46` is empty, so subscriptions are dropped |
| Weekly Budget!E50, L50, R50 | 800 / 50 / 17.99 | They read the blank `$E$6` |
| Everything driven by `TODAY()`: Hidden!P23, P25, P27, Q33:S33, P38:R40, O22:O116; Home top-3 and annual cards; Debt Calculator H9, B10, E20, I495:I496 | — | Date-dependent (CLAUDE.md) |
| Home's 15 flattened scorecards | — | They are images and have no cell |
| Transactions-driven month-tab cells (Jan..Dec P10:P16, U10:U16, U22:U44) | 0 | Trivial zeros. They are kept only as hand-written negative tests. |
| Savings!Z15 | 0 | Workbook shows $0 when dates are missing. The app returns "no dates yet" instead (CONSTRAINTS floor: no silent 0; D15). |

### 5.5 The 2026-months-versus-2025-transactions problem

- **The problem.** The month tabs are dated 2026 (Jan!D7 = 2026-01-01). Every Transactions sample row is dated 2025 (2025-01-01..02-23), and so are two of the three Bills-log rows. So no month-tab cell exercises "a spending, income or savings row lands in a month": every U and P Actual is 0.
- **Oracles that still mean something:**
  - (a) The same `SUMIFS` over typed 2025 windows: Weekly Budget (2025-01-01..07) and Paycheck Budget (..14). `periodSheet` runs them through the same code as a month.
  - (b) Paycheck's "Actual This Month" block (E50:R72), which is keyed on `$D$6`, so January 2025 (unlike Weekly's blank `$E$6`). E50 800, L52 100 and R50 17.99 hold under both rules; L50 250 does not.
  - (c) The only 2026 log row (Feb!K25 = 650), and the fact that it does not leak into March (Mar!K25 = 0, Mar!K21 = 50).
  - (d) The year filter: Jan!K21 = 50 excludes the $200 dated 2025-01-05.
  - (e) Annual Budget's Bills-log columns by month, read in Annual's own year (F11).
- **Optional, and only you can do it.** This closes the gap for spending, income and savings rows.
  - In Google Sheets, set Jan!D7 to 1/2025 and download a **second** copy as .xlsx under a new name. Keep this file as the oracle for every fixture above.
  - The re-export would change existing goldens: Jan!K22 becomes 250 (50 + 200, which differs under D5), and Hidden, Annual and 503020!C52 shift. Also changing Feb!D7 would lose Feb!K25 = 650.
  - From the second copy, January-2025 Actuals (Restaurants 85, Clothing 100, Gas 50, Income 1 2600, Emergency Fund 2000) become valid oracles in a new fixture whose header names the second file.
  - A LibreOffice recalculation is *not* valid: it is a different engine, and CLAUDE.md allows cached values only.
- **Fixture inputs follow ledger conventions.** Spending and savings rows are negated and income is positive (D3). Bills-log rows become ledger rows in their bill or debt category. Merchant strings are synthetic.

## 6. Screens

### 6.1 Navigation and Home
- **Phone bottom bar:** **Month** · Week · **Add** (centre, as now) · Review (with badge) · More.
- **More:** Year, Setup, Savings, Debts (once built), All transactions (today's Ledger), Settings.
- **Desktop top bar:** Month · Week · Year · Review · Add · Setup · More.
- **Home.** Workbook's Home becomes the top of **Year**, including the greeting "Hi, <name>!" (Home!C4 `=B26`). There is no separate Home screen.
- **Addresses.** URLs gain the period, e.g. `#/month/2026-09` and `#/year/2026-01` (the start month, F14), extending the hand-rolled `nav.ts`. Refreshing, the back gesture and reopening from the home screen then land on the same month.
- **Stack note.** CLAUDE.md and ADR 0001 name TanStack Router/Query and vite-plugin-pwa, but the app uses none of them and has no service worker. S0 records the decision to keep extending `nav.ts` in ADR 0003, and flags the out-of-date stack line in `NOTICED-NOT-TOUCHING.md` (changing CLAUDE.md is yours to approve).

### 6.2 Month on iPhone (about 390 px, one column; numbers are illustrative)

```
 September 2026                 ‹  ›     Caveat title #5B7A75, band #F6FDFC
 12 waiting for review — not counted     tap → Review
 Statement imported up to Sep 7          from the statement period (0007)
 ┌ Start  $2,400.00 ┬ Spent        $1,834.12 ┐  summary #FAFFFF, Comfortaa
 └ Left to spend $215.88 ┴ End of month $…  ┘  Start/End only if decision 6 = B
 VARIABLE EXPENSES  $984.12 of $1,200.00  band #FEE4D4
                   Budget   Actual   Left
 Restaurants     150.00    81.45   68.55
 Groceries       400.00   431.20  −31.20  ← #B83A3A pill, minus shown
 Show 4 empty
 BILLS  $1,650.00                         band #FCDAD6
 Rent          1,600.00 1,600.00  planned
 SUBSCRIPTIONS … DEBTS … INCOME … SAVINGS … charts
 Paid to your card: $255.00 — not counted
 Month   Week   (+)   Review 12   More
```

- **Block order on the phone** is Summary → Variable expenses → Bills → Subscriptions → Debts → Income → Savings → Charts. The block every statement changes sits above the fold. Desktop keeps Workbook's exact arrangement.
- **Rows.** Rows with no budget and no Actual collapse behind "Show N empty". A zero Actual on a budgeted row stays blank, as Workbook's `;;` format does. Negatives show their minus sign (D8). Numbers use tabular digits.
- **Tapping a row** opens that category's charges for the month. Merchant text goes through `IngestedText` and is never rendered as markup. The sheet also offers "Move to…" (S6) and budget editing (S8).

### 6.3 Month on desktop (≥1024 px; Month and Year widen from `max-w-3xl` to about 1280 px)

```
| Title + summary (Jan!B3:F16) | Charts (H3:K18) | INCOME (M3:P16)        | SAVINGS (R3:V16)  |
| BILLS (B17:F44)              | DEBTS (H17:K44) | SUBSCRIPTIONS (M17:P44) | VARIABLE (R17:V44) |
```

Tablets (768 px) show two columns.

### 6.4 Year
- **Start month.** A picker sets the start month (Annual!D6). "Today" is the gate (Annual!D7, F10), and the current month's row is highlighted #F5F1E1 (Annual Budget conditional-format rules 2–5).
- **At a glance (Home, in Home's palette).**
  - Shown: greeting; income, expenses and savings totals with the pie; **"Left over"** (decision 15), labelled differently from the Month's "Left to spend"; starting and ending balance (Annual!D18/D20, if decision 6 = B); biggest expense; top-3 doughnuts; best savings month.
  - Added later: the savings-goals chart (S16) and the debt chart (S17).
  - Not shown under decision 2's defaults: the net-worth tile, the 50/30/20 bars and the three spending-group bars.
- **Phone tables.** Below the cards, a segmented control (Income · Expenses · Savings · Bills · Debts · Subscriptions · Variable) switches one 12-row table (month | budget or goal | actual).
- **Desktop.** Workbook's layout: a left totals panel, three top cards, a chart row and four bottom cards on Annual's cream, with a #456464 header.
- **Year charts (S14b).**
  - A stacked column of monthly income and expense Actuals (Annual K10:K21 #D7EEEB, Q10:Q21 #F9D7D2).
  - An income/expenses/savings pie (#D7EEEB/#F9D7D2/#F7EAA9).
  - A clustered goal-vs-actual column (Hidden!J32:K37, #517070/#E6E1CE).
  - Home's pie and top-3 doughnuts.

### 6.5 Setup (START HERE plus Bills)
- **Header.** A #2B5D6A band with the title **"Start here!" in an italic serif** (`ui-serif` italic, which is New York on iPhone), white (contrast 7.3:1). The visible Workbook heading is an italic-serif image (image17.png); START HERE!B2 is an empty cell formatted Caveat. Next to it sits a "My name is ___" field (START HERE!I3, Helvetica Neue 13 italic #F3F9FA).
- **Cards.** A #F3F3F3 canvas holds white cards under Workbook's headings:
  - Income (column "Source")
  - Savings
  - Recurring expenses: Bills, Debts, Subscriptions
  - Variable expenses
  - A seventh card, "Not spending", is app-only.
- **Rows.** Each row can be renamed inline, reordered, or moved to another list. Creating a category anywhere in the app asks which list it belongs to (S2a).
- **Bills, Debts and Subscriptions** rows add "Day paid" and "Monthly amount (from <this month> on)" (S9). Under each card sits a total tile (Workbook's Bills!D32, H32, L32), shown to the cent (D8). Workbook's `"$"#,##0` would show Netflix's 17.99 as "$18".
- **Hints.** Short help comes from Workbook's own cell notes. For example, Bills!B5's note reads "Type the DAY of each month this repeat bill is paid!" (B5 itself is the "Day Paid" heading), and START HERE!H17's note reads "What transactions have varied amounts?".
- **Messages.** Setup has its own failure messages. Today `describeWriteFailure` (format.ts) would say "the numbers did not add up" for a refused CHECK (23514) and "no longer exists" when deleting a category still in use (23503). Setup says instead "that list can't have a monthly amount", "remove the monthly amount first" or "this category still has charges — move them first".

### 6.6 Visual design system

Each Month group gets a set of tokens. **Ink** is used for all text and numbers. **Accent** is used only for fills, bars and decoration.

| Token set | band | header | total row | ink | accent | rule | Workbook cells |
|---|---|---|---|---|---|---|---|
| `income` | #EFF9F8 | #F6FDFD | #D7EEEB | #4F6E69 (Workbook #5B7A75, 4.36 → 5.20) | #9ABDB7 | #CCE2DF | Jan!M5:P16 |
| `savings` | #FFF6C8 | #FFFBE8 | #FFF2B0 | #7C5512 | #FADA6A | #FFEB8B | Jan!R5:V16 |
| `owed` (bill, debt, subscription) | #FCDAD6 | #FFE9E6 | #F8D7D2 | #A63428 | #FAAAA1 | #FFC7C1 | Jan!B17:P44 |
| `variable` | #FEE4D4 | #FFEFE6 | #FADECE | #91452D | #FDBC9A | #F3A68E | Jan!R17:V44 |

Other surfaces:
- **Month page.** Page #FFFCFA, cards #FFFEFA. Summary card #FAFFFF.
- **Home (the Year's at-a-glance band).**
  - Canvas #ECF1F5 and #EDF2F4, white cards; greeting Helvetica Neue 25 #343434, which the system sans stands in for.
  - Home pie: #D4F8E8, #FFDCE1, #FFECD9, #36976E, #D66375, #FFD05C.
  - Top-3 doughnuts: #FFAC9E, #A9D4D4 and #DEC894 on #F3F5F6.
  - Debt chart: #9171D7 and #C8B6EB. Savings-goals chart: #EBD15C and #FEEA8D.
  - Not built by default: the 50/30/20 bars (#135D5C, #548E8E, #C3D8D4) and the group bars (#E78557, #DB5354, #29B3CE).
- **Year tables.** #FFFEFA and #FFFDFB, header #456464.
- **Savings screen.** Banner #FEEAA9.
- **Spending doughnut.** 22 slices in 21 distinct steps from #FFE3DE to #4C0B02 (#841809 repeats), plus #FFF3EB (Jan chart13).
- **Income chart.** A stacked column with Goal as the first series (#CCE2DF) and Actual stacked on it (#9ABDB7) (chart12). The app draws Actual over a Goal track instead, a display-only divergence (D8).

**Contrast** (measured, WCAG). Decision 10 A keeps Workbook's fills and replaces every failing text colour, not only the block inks:

| Element | Workbook | Ratio | App | Ratio |
|---|---|---|---|---|
| Month title | #ABBFBD on #F6FDFC | 1.87 | #5B7A75 | 4.54 (Caveat 47 bold, large text) |
| Overspent pill (Jan!V22:V44 conditional format) | #FFFEFA on #DC5454 | 3.83 | #FFFEFA on #B83A3A | 5.62 |
| Negative left to spend (Jan!D13:E14) | #DD766B on #FFEFED | 2.74 | #A33A3A on #FFEFED | 5.84 |
| Summary labels (Jan!C9) | #7B9BBA on #FAFFFF | 2.87 | #4E6E8C | 5.29 |
| Summary values (Jan!D9:D15) | #9ABDB7 on #FAFFFF | 2.01 | #4A7069 | 5.46 |
| Savings "Amount needed" (Savings!B9/F9) | #FAC935 on #FFF7DD | 1.46 | #7C5512 on #FFF7DD; #FAC935 stays as the bar | 6.19 |
| Block accents used as text (#9ABDB7, #FADA6A, #FAAAA1, #FDBC9A on their bands) | — | 1.26–1.89 | the inks above | 4.36–6.09 |

Mapping onto the existing shadcn tokens in `apps/web/src/index.css`:

| shadcn token | Workbook value |
|---|---|
| `--background` | #FFFCFA |
| `--card` | #FFFEFA |
| `--primary` | #2B5D6A (START HERE header) |
| `--muted` | #F7F5EC (Transactions and Bills page) |
| `--spend` | #B83A3A for text-bearing fills; #DC5454 for bars only |
| `--income` | #4F6E69 |
| `--ring` | #9ABDB7 |

**Type.**
- **Month title.** Caveat 47 bold (Jan!B3), a handwritten face.
- **Italic serif.** Workbook's heading images ("Start Here!", "Savings Goals") are an italic serif. The Setup, Savings and Year page titles use `ui-serif` italic, which needs no download. Caveat is not used for Setup.
- **Big numbers** use Comfortaa. Body text stays the system sans, which is close to Helvetica Neue.
- **Fonts are self-hosted.** Caveat and Comfortaa are under the SIL Open Font License. They ship as latin-subset woff2 files in `apps/web/public/fonts`: static files, not npm dependencies, and no request goes to Google. The app has no service worker, so they are cached by the browser like any file. The app does not work offline yet.

**Dark mode.** Workbook has none, and the app follows the phone's setting today. Each group gets a dark variant: the same hue, with the band at about 15% lightness and the ink at about 85%.

**Charts** come from the `chart-specs` package in CAPABILITY-MAP: pure functions returning SVG strings, with no chart library.
- Percentages come from core as `shareBp` (invariant 1).
- Every text node is escaped, with tests using `<` and `&` in a category name, because a category name inside an injected SVG string would otherwise be text rendered as markup.
- S12a gives the package a vitest project, a coverage threshold, eslint purity and weak-assertion blocks, and a depcruise rule. It also makes `.dependency-cruiser.cjs` deny by default (HANDOFF §5 item 5), so no new package is ungoverned.

## 7. Seeding

- **One button.** A "Start from Workbook's list" button appears in Setup when you have few categories. It does one bulk insert, with no migration, and skips names that already exist. The Workbook names are placeholders for you to rename, in START HERE row order:
  - Income: Income 1, Income 2, Side Hustle, Freelance Work, Donations (B8:B12)
  - Savings: your existing goal's name (for example "Flight training"), then Emergency Fund, Travel Fund, Down Payment, Car Repair Fund (H7:H10)
  - Bills: Rent, Electricity Bill, Water Bill, Gas Bill, Phone, Car Insurance, Gym Membership (B18:B24)
  - Debts: Credit Card 1, Credit Card 2, Car Loan, Student Loan (D18:D21). These are for loans you pay from the bank. The Debts card's hint explains why the Rogers card itself gets no monthly amount (§3.3).
  - Subscriptions: Netflix, Spotify, Dropbox (F18:F20)
  - Variable expenses: Restaurants, Groceries, Clothing, Gas, Movie Theater, Game Night (H17:H22), plus the app-only **Card interest & fees**
  - Not spending (app-only): **Card payments**
- **What carries over from Workbook:** the list structure, headings and order, the names as placeholders, and the look (palette, fonts, the block layout), plus a few help sentences from Workbook's cell notes.
- **What does not carry over:** any amount. The sample owner's budgets, bills, balances, debts and transactions are the template's sample. That sample lives only inside the golden fixtures and is never shown to you. Also left behind: the slot limits, Spending Tracker's 12 extra groups, and the 503020 tags.
- **Your existing categories** keep their names and start in Variable expenses until you move them.

## 8. Build order

Every slice follows the same rules:
- **Green before commit.** Each commit is green on `./scripts/gates.sh full`.
- **Commit size.** One logical change per commit, and at most 300 changed lines excluding lockfile and migrations. **Fixture JSON and test files count.** A failing golden test cannot land alone, so it shares a commit with its engine code. That is why the engine slices are split below.
- **Tests before code.** Golden assertions are written first and observed failing.
- **Decisions before code.** Formula and divergence entries go in before the code that depends on them.
- **Migrations before the code that reads them.** A code commit that reads a new column lands only after you confirm the matching sitting.

Line counts below are estimates.

| # | Slice | Migration | Engine and golden | Screen | What you see afterwards | ~lines |
|---|---|---|---|---|---|---|
| S0 | Decisions on paper (several docs commits) | — | — | — | Nothing in the app. ROADMAP, CAPABILITY-MAP, F3–F14, D5–D16 and a corrected D3 record your answers; also ADR 0003 (hand-rolled `nav.ts`). | docs |
| P1 | Unreadable lines shown (HANDOFF §5 item 2) | — | — | Review lists each unreadable line with its reason | A line the reader could not read shows up for you instead of vanishing (CLAUDE.md requires it) | 200 |
| P2 | Tests that bite (HANDOFF §5 item 4) | — | Pin the exact dedupe digest; a test that fails if `parsed` is recomputed from accepted + rejected | — | Nothing | 80 |
| P3 | React Testing Library (decision 12) | — | — | Fake Supabase client; `.tsx` measured by coverage | Nothing | 150 + lockfile |
| **Sitting A** | 0005 `category_kinds`, 0006 `recategorise`, 0007 `statement_periods`, each its own commit with its schema-assertion additions | ✓ | — | — | **You paste 0003–0007 once.** | tests ~100 each |
| S1 | Workbook's look | — | — | Tokens, self-hosted fonts, Caveat month title, readable inks | The app in Workbook's colours and handwritten titles | 150 |
| S2a | Lists in the data layer | uses 0005 | — | Categories load with their list. Every "new category" asks which list. Review and Add pickers are grouped by list. | Pickers grouped under Workbook's headings | 250 |
| S2b | Setup screen | — | — | Setup (from Settings for now): six lists plus Not spending; rename, reorder, move; Setup messages | Your categories sorted into Workbook's lists | 280 |
| S3a | Starter lists | — | — | "Start from Workbook's list" button | Workbook's names ready to rename, plus Card payments and Card interest & fees | 150 |
| S3b | Week counts by list | — | `weeklySummary` by kind (hand-derived tests) | — | Card payments and savings moves stop showing as spending or money in on Week | 200 |
| S4a | Period engine: spending, income, savings | — | `periodSheet` over real rows; `workbook-period` part 1 | — | Nothing new. This proves the numbers against Workbook before any screen shows them. | 280 |
| S4b | Period engine: bills, debts, subscriptions; transfers; `monthSheet` | — | `workbook-period` part 2; `importedThrough` | — | Nothing new (proof step) | 220 |
| S4c | Statement period and whole-month reads | uses 0007 | — | The import records the statement period. Ledger reads page with an exact count and refuse a partial read. | Nothing visible | 180 |
| S5a | Navigation | — | — | Month · Week · Add · Review · More; period addresses | The new bottom bar | 200 |
| **S5b ★** | **First Workbook month filled from your statement** | — | — | Month screen: title, ‹ ›, six blocks with Actuals, card-payment footnote, review banner, "Statement imported up to" | **Your Rogers charges in Workbook's month blocks** | 290 |
| S6 | Fix a row from the month | uses 0006 | — | Tap a row, see its charges, "Move to…" | Correct a mis-filed charge where you see it | 220 |
| **Sitting B** | `category_budgets`, `category_plans`, plus `month_balances` if decision 6 = B | ✓ | — | — | **You paste these once.** | tests ~100 each |
| S7 | Budget engine | — | Resolution (`'only'` over `'onward'`), Remaining, Difference, Left to spend; `workbook-month` part 1 plus hand-derived multi-row tests | — | Nothing new (proof step) | 280 |
| S8 | Budgets on the month, shown and typed | uses budgets | — | Budgeted and Goal columns. Tap a cell: "from this month on" or "just this month". | Workbook's budget columns, typed the way you would on a month tab | 280 |
| S9 | Bills set-up | uses plans | `billsTotals`; `workbook-bills` | Setup: Day paid and Monthly amount (from a month on), three total tiles | Workbook's Bills tab | 250 |
| S10 | Planned versus real | — | D5 rule, Spent; `workbook-month` part 2 | "planned" label, Total spent | Rent counted every month without a statement line; card-paid bills counted once | 250 |
| S11 | Summary card | uses `month_balances` | Ending balance; `workbook-month` part 3 | Workbook's four-number card and a typed start balance | Workbook's summary | 220 |
| S12a | Chart package | — | `chart-specs` scaffolding, its vitest project, coverage, eslint and depcruise rules; deny-by-default boundaries | — | Nothing | 150 |
| S12b | Month charts | — | `shareBp` from core | Income bars, variable-expenses doughnut | Workbook's chart panel | 280 |
| S13a | Year engine: months | — | `yearSheet` rows, gate, totals, balances; `workbook-year` part 1 | — | Nothing new (proof step) | 280 |
| S13b | Year engine: at a glance | — | Biggest, top 3, best savings month, Left over; `workbook-year` part 2 | — | Nothing new (proof step) | 250 |
| S14a | Year screen | — | — | Start-month picker, at a glance in Home's palette, twelve-month tables | Workbook's Annual Budget and Home | 290 |
| S14b | Year charts | — | — | Annual's three charts; Home's pie and top-3 doughnuts | Workbook's Year charts | 250 |
| S15 | Week in Workbook's shape | — | Week on `periodSheet`; `workbook-week` | Week screen as Workbook blocks | Workbook's Weekly Budget | 250 |
| S15b | Paycheck | uses `pay_schedules` | `payPeriod` (engine) after F15 is answered; Paycheck window over `periodSheet`; golden from Paycheck Budget cells that hold under D5 (§5.4) | Paycheck screen, lavender band (#F1F3FF) | Workbook's Paycheck Budget | 2 slices |
| S15c | Bill calendar | uses `pay_schedules`, plans | `billCalendar` (engine): day grid, bills by due day with real charges replacing plans (D5), paydays, week and month totals; golden from Bill Calendar cells that hold under D5 | Calendar screen | Workbook's Bill Calendar | 2 slices |
| **Sitting C** | `savings_funds` (and later `debts`) | ✓ | — | — | **You paste once for each.** | tests |
| S16a/b | Savings funds | uses `savings_funds` | `savingsFundPlan`, `monthsBetween`; `workbook-savings` | Yellow fund cards | Workbook's Savings tab with your flight fund | 280 × 2 |
| S17 | Debts | uses `debts` | `debtStatus`; extended debt fixture | Debt cards and doughnuts | Workbook's Debt Calculator | 2–3 slices |
| ~~S18~~ | ~~50/30/20~~ | — | — | — | Not chosen (§9a) | — |

## 9a. The owner's answers (2026-09-22)

Asked in chat, with the recommended option first. Where a question was not put
as a question, the recommended option was stated to the owner as what would be
done "unless you say otherwise", and they did not object.

| # | Answer | How it was settled |
|---|---|---|
| 1 | **A — Month opens first** | Owner chose |
| 2 | **Build:** Month, Setup and Bills, Year and Home, Week, Savings, Debts, **plus Paycheck Budget and Bill Calendar**. **Not built:** 50/30/20, Net Worth, Financial Freedom, Spending Tracker's 12 extra groups | Owner chose the two extras from a list offering Paycheck Budget, Bill Calendar, 50/30/20 and Net Worth |
| 3 | **A — the real charge replaces the plan** ($17.99, not $35.98) | Owner chose |
| 4 | **A — card payments are neither spending nor income** | Stated to the owner; no objection |
| 5 | **A — "from this month on" is the default**, "just this month" on offer | Engineering default (both remain available) |
| 6 | **B — type the starting bank balance once a month** | Owner chose |
| 7 | **B — type it once, then recorded transfers add to it** | Owner chose (asked 2026-09-23) |
| 8 | **A — pay is typed** | Stated to the owner; no objection |
| 9 | **A — Workbook's arithmetic mistakes are fixed and recorded** | Stated to the owner; no objection |
| 10 | **A — Workbook's fills, darker readable text** | Stated to the owner; no objection |
| 11 | **A — Workbook's names as placeholders** | Stated to the owner; no objection |
| 12 | **Yes — React Testing Library**, each package in its own commit | Stated to the owner as "unless you say no"; no objection |
| 13 | **A — Workbook first** | Follows from the owner's request |
| 14 | **A — "Card interest & fees" under Variable expenses** | Stated to the owner; no objection |
| 15 | **A — "Left over"** | Falls under decision 9 |

**New open question, F15 (Paycheck), to put to the owner at S15b before any code.**
Workbook's Paycheck tab takes a typed start and end date and halves a monthly bill
with a fixed ÷2 that ignores the pay frequency (Paycheck!E22; START HERE!E8).
Options: A — copy it (typed dates, ÷2); B — find the period from the Income
row's pay schedule and divide by the pay frequency (4.333 / 2.1667 / 1);
C — find the period from the pay schedule and divide by the number of paydays
that actually fall in that month. **Answered 2026-09-23: B** (owner chose;
recorded in F15). The rounding rule is settled with the Paycheck engine.

## 9. Decisions for you

| # | Question | Options | Recommended | Needed by |
|---|---|---|---|---|
| 1 | Which screen opens first? Workbook's first tab is Home, a year dashboard. Its month tabs are where your money lands. | A: Month · B: Week (as today) · C: Year (Workbook's Home is at its top) | **A.** Your statement fills the month first. The bar becomes Month · Week · Add · Review · More. | S5a |
| 2 | Which Workbook tabs do you want? | Tick any | **Build:** Month, Setup and Bills, Year and Home, Week, Savings, Debts. **Skip for now:** Paycheck, Net Worth, Financial Freedom, Bill Calendar, 50/30/20, Spending Tracker's 12 extra groups. If you skip them, Home loses its net-worth tile, 50/30/20 bars and three spending-group bars. | S0 |
| 3 | A bill is set up at $17.99 and your statement shows the $17.99 charge. What should the month show? | A: $17.99, the real charge replaces the plan · B: $35.98, Workbook adds both | **A.** Workbook's own note on Bills!Q5 treats the log as being for bills without a fixed amount. | S10 |
| 4 | Paying off your Rogers card ("PAYMENT, THANK YOU") | A: not spending and not income; shown as a note · B: counted as a debt payment, as Workbook's sample does, which double-counts what you bought | **A** (recorded as D9) | S3a |
| 5 | When you change a budget, how far should it apply? | A: this month and later months · B: this month only (both remain on offer) | **A** as the default | S8 |
| 6 | Type your starting bank balance each month to see Workbook's projected month-end balance (Jan!D9/D15) and the Year's starting and ending balance? | A: not for now · B: yes, one number a month, as in Workbook | **B.** Rent counts from its planned amount and pay is typed (decision 8), so the projection is meaningful. Like Workbook's, it treats card purchases as money already gone. | S11 |
| 7 | Savings fund balance | A: you type it, as Workbook and the app do today · B: type it once, then transfers you record add to it | **B** (recorded as D16) | S16 |
| 8 | How your pay gets in | A: type each paycheque (Add → Type it → received) · B: set expected pay once and count it automatically | **A.** An assumed paycheque can hide a missed one. | S7 |
| 9 | Workbook has a few arithmetic mistakes (listed in §5.2) | A: fix them, recorded · B: copy them | **A** | S9 |
| 10 | Colours | A: Workbook's fills with darker, readable text (§6.6 table) · B: Workbook's exact pale text | **A** | S1 |
| 11 | Start with Workbook's example names to rename, or with empty lists? | A: Workbook's names · B: empty | **A** | S3a |
| 12 | Can I add one testing tool (React Testing Library) so the new screens are checked automatically? Project rules say I must ask before adding one. | Yes or no | **Yes** | P3 |
| 13 | Workbook screens before the savings coach? | A: Workbook first · B: coach first | **A.** It is what you asked for. | S0 |
| 14 | Where do Rogers interest and fees go? | A: Variable expenses, as "Card interest & fees" · B: a Debts row with no monthly amount | **A.** Workbook's Debts column means payments you make. Interest is a charge, and a monthly amount on the card's row would count your purchases twice. | S3a |
| 15 | Workbook's Year "Left To Spend" box reads an empty cell. What should Year show? | A: income − spending − savings, called "Left over" · B: Workbook's literal result (income − spending; savings ignored) · C: leave the box off | **A.** The Month's "Left to spend" keeps its own meaning (budget remaining). | S13b |

## 10. Risks and open questions

1. **Money outside the card is invisible.** Only the card is imported. Rent, pay and savings moves are planned or typed, so a month is only as complete as Setup plus your typing. The import path could later take a bank CSV (the `card_csv` path already exists). The card payment would then appear on both statements, and both would be filed as transfers.
2. **Statement periods are not calendar months.** A statement runs Aug 8 – Sep 7 (F1), so a month is incomplete until the next statement is imported. The Month screen shows "Statement imported up to Sep 7", taken from the statement period (0007), so a low total is not mistaken for low spending.
3. **The cost of rule D5.** A typed *extra* debt payment replaces the planned payment instead of adding to it. The workaround is to type the regular payment as well. Revisit if it bothers you.
4. **Yearly bills.** Workbook's note on Bills!D5 suggests entering a yearly bill as a monthly amount ($100/year = $8.34/mo). If that bill is also charged once a year on the card, the charge month shows $100 and the other eleven show $8.34, so the year counts it about twice. For a card-charged yearly bill, leave the monthly amount blank.
5. **The first import is about 80 taps** (HANDOFF §4). Workbook's lists add a list choice per *category*, not per row.
6. **Migrations and deploys.** 0003 and 0004 are still unapplied, and everything after depends on them. `main` deploys itself, so code that reads a new column is held until you confirm each sitting. A-B-C is three sittings. Running `db push` from CI would remove them, but it would put a database credential in GitHub; that is not proposed now.
7. **Screens are untested** (N5). `.tsx` files are unmeasured by coverage, and about fifteen new screen commits would widen that gap. That is why P3 (decision 12) comes before S5b.
8. **Month-level oracles are indirect.** They come from typed-window tabs and Paycheck's "Actual This Month" block (§5.5). The optional second Google export closes the gap for spending, income and savings rows.
9. **Scope.** S1–S15 delay the coach (roadmap Phase 3) and pull parts of Phases 5–7 ahead of it. The roadmap says so in S0, not by staying silent.
10. **Bundle size.** It is already 606 KB (N7). Fonts ship as static files, charts are hand-built SVG, and Year and Setup should be code-split.
11. **Unique names.** A name can live in one list only (D11). Workbook resolves a name that appears in several recurring lists to the first match (Bills!T7's `COUNTIF` chain). Changing a list is refused while a category has a monthly amount in effect; Setup says "remove the monthly amount first".
12. **Card balance and accounts.** The Rogers statement already prints its New Balance, which reconciliation parses, so it could feed the Debts screen with no typing. Typed pay and savings moves currently land in the single "Main Card" account (`app-data.tsx`). A "Bank / cash" account must exist before any per-account figure is built. Both are settled at S17.
13. **Open: final-month interest.** The Debt Calculator's final-month handling must be settled before any payment-column golden test (S17). The workbook forgives interest in that month; the engine charges it.
14. **Open: notes.** Workbook has a Notes column (Transactions!E, Bills!R). Typed entries already carry a description. A note on imported rows needs a `transactions.memo` column. It is not scheduled until you ask for it.
15. **Pre-existing gaps.** P1 and P2 close HANDOFF §5 items 2 and 4 before S5b, and S12a closes item 5. Items 3 and 6–11 stay open: receipt accuracy, CSV column guessing, the bidi guard in Postgres, the bucket, the bundle, typed-plus-imported duplicates, and the `posted_on` name.

## Critique points not taken (or taken only in part)

- **Fidelity 1, assert Annual!K9 = 0, W9 = 0, W30 = 0.** Not taken. Under the fixture F11 needs (no Transactions rows), those zeros hold for any engine, including one that ignores the ledger. They are listed in §5.4 with their correct-year values (2600, 2000, 235). The rest of the point is taken: Q11 is dropped, F11 is recorded, and the J9 coincidence is covered by a hand-derived test.
- **Fidelity 4, "15 flattened chart images, not six".** Taken with a correction. Home does have 15 flattened scorecard images, including the $191 net-worth tile. But the pie, the debt, savings and top-3 charts, the 50/30/20 bars and the group bars the critique lists are 11 *native* charts whose Hidden sources are intact (checked with `ws._charts`). The plan now says both.
- **Fidelity 11, re-exporting would make Jan!K22 and K24 differ under D5.** Only K22 differs (250 versus 200). K24 is Car Loan (`=Bills!H9+SUMIFS(…)`), and Bills!H9 is blank, so both rules give 100. The rest of the point is taken: a second export, keeping this file as the oracle.
- **Fidelity 18, the Notes column needs a memo field.** The notes are verified (Transactions!E7, Bills!R7). The memo is recorded as open item 14, not scheduled, because typed entries already carry a description and no Workbook figure depends on notes.
- **Engineering 1, "add a CHECK that forbids a monthly amount on the card's category".** Not taken as a CHECK. The schema has no link from a category to a card or account, so no constraint can say which category is "the card's". It is handled by decision 14, the seed, and the Setup warning. The rest of the point (the double count, the D-entry) is taken.
- **Engineering 2, "or repair the CLI history and run `db push` from CI".** Not taken for now. It would put a production database credential into CI, which is a bigger trust change than three manual sittings. The split-and-hold part of the point is taken.
- **Engineering 8, "an engine that sums only the first row passes all of S7".** Taken, with one correction: Jan!O9 = 19400 already sums five typed goals (O10:O14), so S7 had one multi-row cached sum. The added subtraction cells and hand-derived tests are still needed.
- **Engineering 14, "put the `?? ZERO_CENTS` in NOTICED-NOT-TOUCHING".** Handled differently. S3b rewrites that function in `week.ts`, so the fallback is removed there instead of being noted.