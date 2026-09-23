# Handoff — read this first

Written 2026-09-22 when this project moved from Claude Code to Cursor. It tells
the next agent what exists, what the owner still has to set up, how to check
it worked, and what is left to build.

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

pnpm monorepo. Branch **`main`** is the working branch (it is what the
site deploys from). Vite + React 19 + TypeScript + Tailwind v4, Supabase
(Postgres, auth, one Edge Function), Vitest.

| Area | Where | State |
|---|---|---|
| Money types | `packages/money-primitives` | Done |
| Engine | `packages/core` — debt payoff (verified against the workbook), goals, weekly summary vs budget, statement reconciliation | Done, tested |
| Validation | `packages/schema` — zod schemas, receipt-reply parser | Done, tested |
| Statement readers | `packages/statement-parsers` — CSV, **PDF** (hand-written reader), Rogers Bank format, dedupe hash, merchant normalising | Done, tested |
| Database | `supabase/migrations/0001`–`0004` | 0001–0002 applied; **0003–0004 NOT yet applied** |
| Receipt reading | `supabase/functions/read-receipt` — Gemini free tier | Written, **not deployed** |
| App | `apps/web` — screens: Week, Review, Add (Statement / Photo / Type it), Ledger, Settings. shadcn/ui design system copied into `src/components/ui` | Done; live on Netlify, **Cloudflare not set up** |

Key decisions, already made by the owner (do not reopen): dates are the
purchase date, not the settlement date (`docs/formula-decisions.md` F1);
receipt photos use **Gemini's free tier**, privacy trade-off accepted
(`docs/adr/0002-gemini-free-tier-for-receipts.md`); UI is shadcn/ui.

## 3. The owner's setup tasks — do these first, in this order

Full detail is in `docs/setup.md`. Supabase project ref: `bnodrfghxbavlopxkgju`.

**Step 1 — apply migration 0003, then 0004.** Until both run, saving an import
and approving a row fail. Easiest: Supabase dashboard → SQL Editor → New query →
paste the file → Run → expect "Success. No rows returned."

> **Do not run `supabase db push` as-is.** 0001 and 0002 were applied by hand,
> so the CLI's migration history is empty and it would try to re-run 0001 and
> fail. If you want the CLI, first record the applied ones:
> `supabase migration repair --status applied 0001 0002 --project-ref bnodrfghxbavlopxkgju`,
> then `supabase db push`. Check with `supabase migration list` before pushing.

**Step 2 — the owner's password.** Dashboard → Authentication → Users → `⋯` →
Reset password (or Add user with "Auto Confirm User" ticked). There is
deliberately no sign-up screen in the app.
Also sign out all sessions for that user once (Authentication → Users → `⋯` →
Sign out user): a sign-in link with a live token was pasted into a chat earlier.

**Step 3 — Cloudflare Pages** (replaces Netlify). Dashboard → Workers & Pages →
Create → Pages → Connect to Git → `aaronjoseph94/budget-app`:

| Setting | Value |
|---|---|
| Project name | `aaron-budget-app` |
| Production branch | `main` |
| Framework preset | None |
| Build command | `pnpm --filter @budget/app-client build` |
| Build output directory | `apps/web/dist` |
| Env `NODE_VERSION` | `22` |
| Env `PNPM_VERSION` | `10` |
| Env `VITE_SUPABASE_URL` | `https://bnodrfghxbavlopxkgju.supabase.co` |
| Env `VITE_SUPABASE_ANON_KEY` | the publishable key in `netlify.toml` (public by design) |

The `VITE_` values are baked in at build time — changing them needs a redeploy.
Security headers come from `apps/web/public/_headers`.
Then in Supabase → Authentication → URL Configuration: Site URL
`https://aaron-budget-app.pages.dev`, and add `https://aaron-budget-app.pages.dev/**`
to Redirect URLs. If Cloudflare assigned a different address, use that.

**Step 4 — receipt photos (Gemini).** Get a key at
https://aistudio.google.com/apikey. Deploy the function either in the
dashboard (Edge Functions → Deploy a new function → Via Editor, name exactly
`read-receipt`, paste `supabase/functions/read-receipt/index.ts`) or by CLI:

```
supabase functions deploy read-receipt --project-ref bnodrfghxbavlopxkgju
supabase secrets set GEMINI_API_KEY=<key> --project-ref bnodrfghxbavlopxkgju
```

Keep JWT verification ON (the CLI default; do not pass `--no-verify-jwt`).
If the site's address is not `aaron-budget-app.pages.dev` or `.netlify.app`, also
set `EXTRA_ORIGINS=https://<address>` (comma-separated for several). If photos
report the model is retired, set `GEMINI_MODEL` to a current Gemini model name.
The key goes ONLY into Supabase secrets.

**Step 5 — delete the Netlify site** once the Cloudflare one works (Netlify →
Site configuration → Delete this site), then remove `netlify.toml` in a commit.

**Step 6 — iPhone.** Safari → the site → Share → Add to Home Screen.

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
