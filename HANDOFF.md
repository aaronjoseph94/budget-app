# Handoff — read this first

Rewritten 2026-09-23, when the Workbook build (`docs/workbook-plan.md`) was
finished on branch `main-tnlcto`. It tells the owner and the next agent what
exists, what the owner has to do before using it, how to check it worked,
what is still open, and what is left to build.

**The owner is not a software engineer.** Explain in plain language. Do not ask
them to judge engineering choices — make the call, say what you chose and why,
and only raise what they would actually notice.

---

## 1. Before changing any code

Read, in order: `CLAUDE.md` (the rules), `CONSTRAINTS.md` (what the checks
enforce), `CAPABILITY-MAP.md` (module boundaries), then this file.
The rules in `CLAUDE.md` are binding. The three that matter most:

1. **All arithmetic lives in `packages/core`.** Screens format numbers; they
   never compute totals, percentages or "remaining". A dependency rule enforces
   this for money functions (`.dependency-cruiser.cjs`, `ui-never-computes-money`).
2. **Money is integer cents**, `bigint` in Postgres. Never a float.
3. **Nothing a model reads reaches the ledger unreviewed.** Only an exact
   learned merchant-rule match approves without a person. The database enforces
   this since migration 0004 — keep it that way.

**Before every commit run `./scripts/gates.sh full`** and commit only when it
prints `status=GREEN`. It needs `gitleaks` (`scripts/install-gitleaks.sh`) and a
local PostgreSQL install for the `schema` gate. If a tool is missing it reports
`MISCONFIGURED` and exits 2 — install the tool, do not remove the gate.
CI (`.github/workflows/gates.yml`) runs the same gates on every push.

**Never:** commit a key or `.env` file; put `service_role` or the Gemini key
anywhere in `apps/web`; edit a migration that is already applied (write a new
one); commit a real bank statement or receipt (fixtures are invented — see
`packages/statement-parsers/test/pdf/make-pdf.ts`); lower a coverage threshold
or delete a test to make a check pass.

## 2. What exists

pnpm monorepo: Vite + React 19 + TypeScript + Tailwind v4, Supabase
(Postgres, auth, one Edge Function), Vitest. **Everything below is on
branch `main-tnlcto`.** Branch `main` is what the live site deploys, and it
has none of the Workbook screens until `main-tnlcto` is merged into it (§3).

**The app, screen by screen** (phone bar: Month · Week · Add · Review ·
More; a wide screen puts them all on the top bar):

| Screen | What it is | Workbook tab |
|---|---|---|
| Month | Opens first. Summary card (Start, Spent, Left to spend, End of month), the six lists as blocks with Budgeted, Actual and Left, the two charts. Tap a row to see its charges and move one ("Move to…"); tap a budget to type it "from this month on" or "just this month" | Jan–Dec |
| Week | The same blocks for Monday to Sunday, with weekly budgets typed in the row, and the savings goal | Weekly Budget |
| Paycheck | The same blocks for one pay period, found from your pay schedule | Paycheck Budget |
| Bill calendar | Each bill on the day it is due, paydays, and each week's total | Bill Calendar |
| Year | Twelve months from any start month, Home's "at a glance" cards and charts | Annual Budget, Home |
| Savings | One card per savings fund: goal, what is saved, what to save a month | Savings |
| Debts | One card per debt, when it is paid off, and minimums against snowball and avalanche | Debt Calculator |
| Setup | Your name, the six lists, when each income pays, each bill's day and monthly amount | START HERE, Bills |
| Add | A Rogers statement PDF (or a CSV), a receipt photo, or one entry typed by hand (cash, pay, savings moves) | Transactions |
| Review | Every imported row waits here for a category, and every line the reader could not read | — |
| All transactions | Every approved row, a month at a time, with search and remove | — |
| Settings | Weekly budgets, the goal's hours, sign out | — |

**Underneath:** all arithmetic is in `packages/core`, checked against the
workbook's own cached values (121 golden tests); the charts are drawn by
`packages/chart-specs`; the statement readers are in
`packages/statement-parsers`; the database is `supabase/migrations/0001` to
`0014`. Decisions are recorded in `docs/formula-decisions.md` (F1–F23) and
`docs/divergences.md` (every place the app departs from Workbook, and why).

Key decisions, already made by the owner (do not reopen): dates are the
purchase date (F1); receipt photos use Gemini's free tier
(`docs/adr/0002-gemini-free-tier-for-receipts.md`); the answers in
`docs/workbook-plan.md` §9a (Month first, a real charge replaces a planned
bill, card payments are not spending, a starting balance typed each month,
savings kept by transfers, pay periods from the pay schedule).

## 3. The owner's setup — do these in this order

Supabase project ref: `bnodrfghxbavlopxkgju`. More detail for each step is
in `docs/setup.md`.

**Step 1 — paste the database updates, before anything else.** Supabase
dashboard → **SQL Editor** → **New query**. Open the first file below on
GitHub (branch `main-tnlcto`, folder `supabase/migrations`), copy all of it,
paste, press **Run**, and wait for "Success. No rows returned." Then a new
query for the next file. **One at a time, in this order, all twelve:**

| # | File | What it adds |
|---|---|---|
| 1 | `0003_save_import_atomically.sql` | Saving an import in one go |
| 2 | `0004_one_path_into_the_ledger.sql` | Approving, rules that learn, budgets, the goal, PDF imports |
| 3 | `0005_category_kinds.sql` | Which of Workbook's lists each category is on |
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
`PNPM_VERSION` = `10`, `VITE_SUPABASE_URL` =
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

## 4. How to check it worked

Nothing has been run against the real Supabase or Gemini yet — the previous
environment could not reach either. Walk through this with the owner:

1. Sign in with the password.
2. Settings → the goal is prefilled ($30,000 flight training, $275/hour). Save it.
3. Add → Statement → the owner's Rogers Bank PDF. Expect **"80 transactions ·
   Matches your statement"** for the Aug 8 – Sep 7 2026 statement, then
   Import. Expected result: "80 waiting for review" (no rules learned yet).
4. Review → pick a category for a few rows → Approve. Each approval teaches a
   rule for that merchant.
5. Import the **same PDF again**: expect "… you already had" and **no** new rows
   in Review. If Review doubles, dedupe is broken — fix the hash, never the UI
   (CLAUDE.md).
6. Week screen shows spending against budgets; set a weekly budget in Settings
   and watch it update.
7. Add → Photo → a cash receipt. Fields should prefill; send to Review.

Any failure shows a sentence ending in a code like `(code 23514)` — that code
names the cause (`apps/web/src/format.ts`, `describeWriteFailure`).

## 5. What is left, most important first

From two review passes (a write-path audit and an architecture review); details
in `NOTICED-NOT-TOUCHING.md` (N1–N7).

1. **No tests for the screens** (N5). The coverage gate reads `*.ts` only, so
   every `.tsx` is unmeasured. Add React Testing Library (one dependency, its
   own commit, justified), a fake Supabase client, include `.tsx`, raise app
   thresholds.
2. **Unreadable lines are saved but never shown** (`ingest_unreadable_lines`
   has no screen). CLAUDE.md requires every failure to be visible in the queue.
3. **Receipt accuracy is unmeasured** (N6). CONSTRAINTS.md wants ≥20 labelled
   receipts, ≥90% valid, ≥98% exact amounts, no live calls in CI.
4. **Tests that do not bite** (proved by mutation): swapping two fields in the
   dedupe key passes every test — pin the exact digest in a test
   (`packages/statement-parsers/src/dedupe.ts`); replacing `parsed = data.length`
   with `accepted.length + rejected.length` in `read.ts` passes every test —
   add a test that fails on it.
5. **Boundary rules are per-package**: a new package, and
   `packages/golden-verification`, are governed by no dependency rule. Make
   `.dependency-cruiser.cjs` deny by default. *(Settled 2026-09-23, S12a:
   every import must match an `allowed` line; see CONSTRAINTS.md.)*
6. **CSV column guessing** (`apps/web/src/ImportScreen.tsx`): it can pick a
   card-number column as the amount, or a category column as the description.
   The dedupe hash also depends on the sign/date choices made on that screen,
   so a different choice on a second import re-keys every charge.
7. `packages/schema` validates model and statement text, but the Postgres
   `ingested_text` domain does not refuse bidi/C1 characters as zod does.
8. The receipts bucket (0001) does not force an existing bucket private.
9. Bundle is ~606 KB (N7) — load the PDF reader only on the Add screen.
10. Typed and photo entries use a random dedupe hash on purpose; a card
    purchase entered that way AND imported from a statement counts twice. The
    screens say "for cash". A real fix is matching on date and amount.
11. `transactions.posted_on` holds the purchase date (F1), despite the name.
    Rename it the next time that table is migrated for another reason.

Roadmap beyond this (`docs/ROADMAP.md`): Phase 3 is the savings coach; Phases
5–7 are bills/reminders, charts and export, and the rest of the workbook
(snowball/avalanche debt payoff — the engine for it already exists in
`packages/core/src/debt.ts`).

## 6. Things to know about how this code is written

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
