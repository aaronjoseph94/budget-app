# Handoff — read this first

Rewritten 2026-09-28, when the AI-first build (`docs/ai-first-plan.md`,
the owner's list of 2026-09-24) was finished on branch `main-tnlcto`. It
tells the owner and the next agent what is new, what the owner does after
it reaches `main`, how to check each screen, and what is still open.

**The owner is not a software engineer.** Explain in plain language. Do not ask
them to judge engineering choices — make the call, say what you chose and why,
and only raise what they would actually notice.

---

## 1. Before changing any code

Read, in order: `CLAUDE.md` (the rules), `CONSTRAINTS.md` (what the checks
enforce), `CAPABILITY-MAP.md` (module boundaries), then this file. The
plan for this phase, and every choice made in it, is
`docs/ai-first-plan.md`; the AI's rules are ADRs 0004 and 0005.
The rules in `CLAUDE.md` are binding. The three that matter most:

1. **All arithmetic lives in `packages/core`.** Screens format numbers; they
   never compute totals, percentages or "remaining". A dependency rule enforces
   this for money functions (`.dependency-cruiser.cjs`, `ui-never-computes-money`).
2. **Money is integer cents**, `bigint` in Postgres. Never a float.
3. **Nothing a model reads reaches the ledger unreviewed.** Only an exact
   learned merchant-rule match approves without a person. The database enforces
   this since migration 0004 — keep it that way. A category the AI suggests
   in Review waits for the owner's tap like any other.

And one this phase adds: **the AI never supplies a number.** It writes
around blanks, and the app fills each blank from the engine (ADR 0005).

**Before every commit run `./scripts/gates.sh full`** and commit only when it
prints `status=GREEN`. It needs `gitleaks` (`scripts/install-gitleaks.sh`) and a
local PostgreSQL install for the `schema` gate. If a tool is missing it reports
`MISCONFIGURED` and exits 2 — install the tool, do not remove the gate.
CI (`.github/workflows/gates.yml`) runs the same gates on every push.

**Never:** commit a key or `.env` file; put `service_role` or any AI key
anywhere in `apps/web`; edit a migration that is already applied (write a new
one); commit a real bank statement or receipt (fixtures are invented — see
`packages/statement-parsers/test/pdf/make-pdf.ts`); lower a coverage threshold
or delete a test to make a check pass; write the workbook vendor's name
anywhere (the `brand` gate).

## 2. What is new, in plain words

Everything below is on branch `main-tnlcto` and reaches the live site when
it is merged into `main` (§3).

- **AI throughout, on a free Google Gemini key.** A Coach that says how the
  month is going, what changed, what to cut and when you will reach your
  goals; a Sunday check-in; words on the Month, the Forecast and Reports;
  suggested categories in Review; "just type it" on Add; receipts; and Ask.
  Every figure is the app's own. With AI off, not set up or resting, every
  one of them shows the app's own words instead, and says why in one line.
- **Paid services too, only if you choose.** Groq and OpenRouter (free),
  OpenAI and Anthropic (paid, off until you switch **Use paid services**
  on). AI settings has the order they are tried in and a daily limit.
- **Forecast:** safe to spend a day, where the month will end, the next
  30 days, when you will reach each goal, what-ifs, the next three months.
- **Reports:** the month in review, trends, shops and subscriptions,
  habits; Save as PDF and Download CSV.
- **Last month beside this month** on the Month, Week, Paycheck, Year,
  Savings and Debts.
- **Savings goals, plural:** add goals, choose the main one, reorder,
  pause, mark reached.
- **Help** on every screen (the **?** by each title), **One-time updates**
  that checks what is installed and has Copy buttons, and **Getting
  started**, nine short steps.
- **Phone first:** checked at 320 and 390 px wide, light and dark, and with
  text at 200%; touch targets 44 px; an offline line.
- **A critical review of the whole app** fixed rows that opened nothing
  (Week, Paycheck, Bill calendar, Not spending), added learned shops with
  **Forget** in Settings, and made every "needs an update" message point
  to Help.

**What moved, which you will notice:**
- The phone bar is **Month · Coach · Add · Review · More**. **Week left the
  bar**: it is the **Week** in the **Month · Week · Pay · Year** switch under
  the Month's title, and `#/week` still works.
- On a wide screen the top bar is Month, Week, Coach, Forecast, Reports,
  Savings, Debts, Review, Add, More. Year and Paycheck are in the switch;
  the Bill calendar and Setup are in More.
- **More** is in four groups: Plan, Understand, Set up and help, Records.

**The app, screen by screen:**

| Screen | What it is |
|---|---|
| Month | Opens first. The coach line, the summary (Start, Spent, Left to spend, End of month, and a labelled Forecast line), last month's same days beside it, the six lists as blocks, the charts. Tap a row for its charges |
| Week, Paycheck, Year | The switch under the Month's title. The same blocks for a week, a pay period, twelve months, each beside the one before |
| Bill calendar | Each bill on its day, paydays, each week's total. A bill opens its charges |
| Coach | The day's line, your main goal and the others, at most three cards, the check-in, a quote or tip, and Ask |
| Check-in (`#/coach/checkin`) | From Sunday: last week, a win, one thing to try, a few questions, a one-tap weekly limit |
| Forecast | Safe to spend, the month's end, the next 30 days, goal dates and what-ifs, three months ahead, the debt-free date |
| Reports | Overview, Trends, Shops, Habits; Save as PDF, Download CSV |
| Ask | A question about your money in your own words; the answer's figure is the engine's |
| Savings, Debts | Every goal in your order; every debt and when it is paid off |
| Add, Review | A statement, a photo, one typed or "just typed"; everything waits in Review, with suggested categories |
| Setup, Settings, AI settings | Your lists and bills; weekly budgets, learned shops, sign out; AI on or off, keys, services, limit, tone |
| Help, Getting started | An article per screen and One-time updates; nine steps to set up |

**Underneath:** all arithmetic is in `packages/core`, checked against the
workbook's own cached values (121 golden tests, unchanged); the coach's
words and checks are in `packages/savings-coach`; the CSV writer is
`packages/report-export`; the AI helper is `supabase/functions/ai`; the
database is `supabase/migrations/0001` to `0018`. Decisions are recorded in
`docs/formula-decisions.md` (F1–F49), `docs/divergences.md` and
`docs/adr/` (0001–0009).

Key decisions already made by the owner (do not reopen): dates are the
purchase date (F1); Gemini's free tier, privacy trade-off accepted
(ADR 0002); the answers in `docs/workbook-views-plan.md` §9a (Month first,
a real charge replaces a planned bill, card payments are not spending, a
starting balance typed each month, savings kept by transfers, pay periods
from the pay schedule); the 2026-09-24 list, and "do not wait for my
approval" on the plan.

## 3. The owner's setup — do these in this order

Supabase project ref: `bnodrfghxbavlopxkgju`. More detail for each step is
in `docs/setup.md`.

**Step 1 — done 2026-09-24.** The owner pasted `0003` to `0014` ("the
pasting to supabase is done"). Kept below as the record, and for rebuilding
the project from scratch.

Supabase
dashboard → **SQL Editor** → **New query**. Open the first file below on
GitHub (branch `main-tnlcto`, folder `supabase/migrations`), copy all of it,
paste, press **Run**, and wait for "Success. No rows returned." Then a new
query for the next file. **One at a time, in this order, all twelve:**

| # | File | What it adds |
|---|---|---|
| 1 | `0003_save_import_atomically.sql` | Saving an import in one go |
| 2 | `0004_one_path_into_the_ledger.sql` | Approving, rules that learn, budgets, the goal, PDF imports |
| 3 | `0005_category_kinds.sql` | Which of the workbook's lists each category is on |
| 4 | `0006_recategorise.sql` | Moving a saved charge to another category |
| 5 | `0007_statement_periods.sql` | The dates each statement covered |
| 6 | `0008_category_budgets.sql` | Budgets and goals typed on the Month |
| 7 | `0009_category_plans.sql` | Each bill's monthly amount and day paid |
| 8 | `0010_month_balances.sql` | Each month's starting bank balance |
| 9 | `0011_pay_schedules.sql` | When each income pays |
| 10 | `0012_dismiss_unreadable_lines.sql` | Dismissing a line the reader could not read |
| 11 | `0013_savings_funds.sql` | Savings funds and their balances |
| 12 | `0014_debts.sql` | Debts and extra payments |

`0001` and `0002` are already applied; do not run them again. If one says
something other than "Success", stop there and do not merge: nothing is
lost, and the message says which line. Do not use `supabase db push` unless
you first run `supabase migration repair --status applied 0001 0002
--project-ref bnodrfghxbavlopxkgju` (the CLI does not know 0001 and 0002
were applied by hand).

**Step 2 — merge `main-tnlcto` into `main`, only after Step 1.** On GitHub:
**Pull requests → New pull request**, base `main`, compare `main-tnlcto`,
**Create pull request**, wait for the green check, then **Merge**. `main`
deploys itself, so merging before Step 1 would put a site live that asks
for tables that do not exist yet.

**Step 3 — Cloudflare Pages** (replaces Netlify). **Workers & Pages →
Create → Pages → Connect to Git →** `aaronjoseph94/budget-app`. Project name
`aaron-budget-app`, production branch `main`, framework preset None, build
command `pnpm --filter @budget/app-client build`, output directory
`apps/web/dist`. Environment variables: `NODE_VERSION` = `22`,
`PNPM_VERSION` = `10.33.0` (as `packageManager` in package.json), `VITE_SUPABASE_URL` =
`https://bnodrfghxbavlopxkgju.supabase.co`, `VITE_SUPABASE_ANON_KEY` = the
publishable key in `netlify.toml` (public by design). Then in Supabase →
**Authentication → URL Configuration**: Site URL
`https://aaron-budget-app.pages.dev`, and add
`https://aaron-budget-app.pages.dev/**` to Redirect URLs (use the address
Cloudflare gave, if different). Once it works, delete the Netlify site
(Site configuration → Delete this site); the next agent then removes
`netlify.toml` in a commit.

**Step 4 — receipt photos (optional).** Get a key at
https://aistudio.google.com/apikey. Supabase → **Edge Functions → Deploy a
new function → Via Editor**, name exactly `read-receipt`, paste
`supabase/functions/read-receipt/index.ts`, deploy with **Enforce JWT
verification** on. Then **Edge Functions → Secrets**: `GEMINI_API_KEY` =
the key. If the site's address is not `aaron-budget-app.pages.dev`, also
set `EXTRA_ORIGINS` = `https://<the address>`. The key goes only there.

**Step 5 — your password, and sign out old sessions.** **Authentication →
Users →** the `⋯` on your row → **Reset password** (there is no sign-up
screen, deliberately). Then the same menu → **Sign out user**, once: a
sign-in link with a live token was pasted into a chat earlier.

**Step 6 — iPhone.** In Safari open the new address → **Share → Add to
Home Screen**. If you added the old site to your home screen before, remove
that icon first: it keeps opening the old Week screen (N24).

## 4. How to check it worked, screen by screen

Nothing has been run against the real Supabase yet: this environment cannot
reach it. The whole walk below was run in a stand-in (the screen tests' fake
database) with invented data, and the owner's statement was read by the app
in memory; the real run is the owner's. Any failure shows a sentence, often
ending in a code like `(code 23514)` that names the cause (`format.ts`); a
sentence saying "a database update that has not been applied yet (00NN …)"
means that file from Step 1 was missed.

1. **Sign in** with the password from Step 5. The **Month** opens on this
   month and, with no lists yet, says "Start in Setup".
2. **Setup.** Type your name. Press **Use the starter list**: the workbook's
   names appear under Income, Savings, Bills, Debts, Subscriptions and
   Variable expenses, plus Card payments under Not spending. Rename or
   remove what does not fit. On your pay row pick how often it pays and the
   first payday. On each bill type the day paid and the monthly amount;
   "Fixed monthly bills" adds them up.
3. **Add → Statement →** the Rogers PDF. Expect "80 transactions · Matches
   your statement" for Aug 8 – Sep 7 2026, then **Import**: "80 waiting for
   review".
4. **Review.** Pick a category for each row and **Approve**. Each shop is
   learned: the next statement files it without asking. File "PAYMENT, THANK
   YOU" under Card payments and interest under Card interest & fees.
   Import the same PDF again: nothing new appears (if Review doubles, the
   dedupe hash is broken; fix the hash, never the screen).
5. **Month (August).** Your charges sit in their blocks; rent shows
   "planned" until a real rent charge exists. Tap **Type your starting bank
   balance** and End of month appears. Tap a pencil to type a budget. Tap a
   row to see its charges and **Move to…** another category. The card
   payment is a line under the blocks, never spending.
6. **Add → Type it**, "I received": your pay, under your income. It shows
   on the Month's Income block, and on Paycheck.
7. **Week, Paycheck, Bill calendar, Year** (More on a phone): the same
   charges in a week, a pay period, a calendar and twelve months. A weekly
   budget is typed in the Week's row.
8. **Savings.** **Add a goal**, or pick a fund → **Set a goal**. Transfers typed to that fund
   afterwards add to it.
9. **Debts.** **Add a debt**: balance, month, minimum, rate. The card shows
   when it is paid off, and the three ways to pay compare.
10. **All transactions** and **Settings** (More): every approved row;
    weekly budgets, where your savings goals are, sign out.
11. **Add → Photo** (after Step 4): a cash receipt fills the form; it goes
    to Review like everything else.
12. **iPhone:** open the Month, the Coach and the Forecast in Safari, and
    look at the ring chart, the tables and the 30-day line. Then make the
    text larger (Settings → Display & Brightness → Text Size, or **aA** in
    Safari) and look again: nothing should need scrolling sideways. If
    anything is squashed or cut off, tell the next agent which screen (N41:
    only Chromium was checked here, at 320 to 1280 px and at 200% text).

## 5. Questions for the owner

Each has a default already in use, so nothing waits on the answer. Answer
any of them and the next agent records it and builds it.

1. **Week and Paycheck: starting and ending balance (N45).** The workbook's Weekly
   and Paycheck tabs show a starting and an ending bank balance. The app
   stores a starting balance per month only. **In use: A — not shown.**
   B — work each week's start out from the month's typed start and that
   month's rows before the week. C — type a start for every week (needs a
   database update).
2. **Do payments you record move a debt's balance? (N53)** The workbook's Debt
   Calculator takes balances from its payoff schedule alone. **In use:
   A — the schedule only, as in the workbook.** B — link a debt to a Debts-list
   category and let recorded payments replace the schedule's. C — show
   recorded payments beside the schedule without changing it. B or C
   needs a database update.
3. **The Year's "Biggest expense" and "Top 3" (F18).** An engineering
   default, told here so it is not a surprise. **In use: each category's
   real total over the Year's months, a real charge replacing a planned
   bill, planned bills counted only from the month they were set up and
   only up to this month.** The workbook instead counts twelve times each monthly
   amount plus everything logged, so a bill set up in October counts all
   year and a card-paid bill counts twice. Say if you want the workbook's measure,
   or planned bills counted for the whole year.

Things to know, which follow the workbook or a recorded choice (details in the
N-entries named): with no starting balance typed there is no End of month,
where the workbook counts from $0 (D17, N37; say if you would rather have
the workbook's $0); End of month reads low until pay is typed (N37); a negative
End of month shows its minus sign but is not coloured, as the workbook colours
only Left to spend (N37); the Year opens on January of this year (N43);
"Best savings month" with nothing saved shows January at $0.00 (N43); the
Year's column chart stacks expenses on top of income, as the workbook's does, so
a column's full height means nothing on its own (N43); Debts' "Paid this
month" is what the payoff schedule pays, not what you recorded (N57); the
Year's debt chart shows today's balances (N57); snowball and avalanche
assume no extra money (N57); a bill charged just
after a month ends can count planned in one month and twice in the next
(N36, a question if it happens); a fund's monthly figure falls as it fills
(N54); a fund past its goal shows a negative monthly figure (N55).

## 6. What is left, most important first

Details in `NOTICED-NOT-TOUCHING.md`; each entry says what would settle it.

1. **The owner's real run** (§3 and §4). Until then nothing has touched the
   hosted database.
2. **Receipt accuracy is unmeasured** (N6): ≥20 labelled receipts, ≥90%
   valid, ≥98% exact amounts, no live calls in CI.
3. **The rest of the plan's order** (`CAPABILITY-MAP.md`): the savings
   coach (weekly limits, streaks, the flight goal's tradeoffs), then
   natural-language entry, reminders and the forecast, the Sankey, export.
4. **Week, Paycheck and the Bill calendar open nothing on a tap** (N46,
   N48, N51): moving a charge is done from the Month. The Week has no
   address of its own and no charts.
5. **Coverage is thin on sign-in, the CSV screen and the photo path** (N5).
6. **A statement's first days of a month** (N23): August says "imported up
   to 7 Sep" while August 1–7 came from a statement not imported.
7. **"Always file" moves the shop's rule, not its other charges** (N25); a
   charge filed under Not spending cannot be opened from the Month (N26);
   a learned shop has no screen to forget it (N17).
8. **Small:** CSV column guessing can pick the wrong column (the CSV screen);
   the Postgres `ingested_text` check is looser than zod's; the receipts
   bucket is not forced private if it already existed; the bundle is 758 kB
   (213 kB gzipped, N7); a card purchase typed by hand and also imported
   counts twice (the screen says so); `transactions.posted_on` holds the
   purchase date (F1) despite its name; CI actions are pinned to tags (N1);
   CLAUDE.md's stack line names three libraries the app does not use (N8,
   the owner's file).
9. **Not built, by the owner's choice:** 50/30/20, Net Worth, Financial
   Freedom, the Spending Tracker's extra groups (`docs/workbook-views-plan.md` §9a).

## 7. Things to know about how this code is written

- Comments explain *why*, often with the bug that motivated them. Keep that.
  If code changes, change the comment — a comment that lies is worse than none.
- Commits are small and each one passes the gates on its own. The
  previous agent checked this by stashing everything else and re-running the
  gates before each commit.
- Tailwind classes are joined with a plain `cn()` (no tailwind-merge). A base
  component must never set a style a caller would override — use a prop
  (see `src/lib/cn.ts`).
- The PDF reader is hand-written on purpose (no pdf.js). A misread cannot pass
  silently because every import is reconciled against the statement's own
  printed totals and refused if they differ. If Rogers changes its layout, the
  column boundaries are in `packages/statement-parsers/src/formats/rogers.ts`.
