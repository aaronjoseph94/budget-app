# Handoff — read this first

Rewritten 2026-09-28, when the AI-first build (`docs/ai-first-plan.md`,
the owner's list of 2026-09-24) was finished on branch `main-tnlcto`. It
tells the owner and the next agent what is new, what the owner does after
it reaches `main`, how to check each screen, and what is still open.

**The AI apps feature was removed on 2026-11-10** (ADR 0016): the
connection for Claude or ChatGPT, its consent page, its Settings card, and
the suggestions it left in Review. Where this file still names a step by its
old number, the number is kept so references stay true, and says it is gone.
The owner's own AI helper is untouched.

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

**Rework, wave 1 (2026-10-08, the owner's six decisions, ADR 0014):**
- The switch at the top of the Week, the Month and the Year reads **Week ·
  Month · Year**. **Paycheck** is its own screen under Plan, beside Bill
  calendar. The Month still opens first.
- **One Settings screen** with four tabs: **Lists** (what Setup was: your
  name, lists, bills, pay days) · **Budgets & goals** · **AI** (what AI
  settings was) · **Account** (learned shops, sign out). The tab is
  in the address (`#/settings/ai`); `#/setup` and `#/ai` still open theirs.
  The sidebar's last group is **More**: Settings, Help.
- **Getting started** opens on the first run and from Help's **Start
  here** (with "5 of 9 done" and **Open Getting started**); it left More
  and Settings.

**Rework, wave 2 (2026-10-08):**
- **Help is twelve short articles**, and every screen's words were cut to
  one idea a sentence (PRD 03).
- **A browser test suite, `pnpm e2e`**: every screen on a phone (WebKit)
  and a computer (Chromium), at 390 and 320 wide, axe-clean, and the main
  flows by keyboard (`docs/design/rework/04-e2e.md`).
- **A bug bash** fixed four things you might notice: the Coach no longer
  scrolls sideways on the smallest iPhone; dark mode draws scrollbars,
  checkboxes and date pickers dark; the Forecast asks for this month's
  starting balance once, not four times; each debt's **Edit** names its
  debt to a screen reader (`05-bug-bash.md`).
- **The before and after** of the whole rework, measured the same way
  twice, is `docs/design/rework/EVAL.md`.

- **AI throughout, on a free key: OpenRouter, Groq or Google Gemini.** A Coach that says how the
  month is going, what changed, what to cut and when you will reach your
  goals; a Sunday check-in; words on the Month, the Forecast and Reports;
  suggested categories in Review; "just type it" on Add; receipts; and Ask.
  Every figure is the app's own. With AI off, not set up or resting, every
  one of them shows the app's own words instead, and says why in one line.
- **Three free services, the quick ones first: OpenRouter, Groq, Gemini
  (ADR 0015).** Each row of the **Free AI** card on Settings › AI has a
  **Test** that times one call. OpenAI and Anthropic (paid, off until you
  switch **Use paid services** on), the order they are tried in and a
  daily limit are under **Advanced**.
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
  bar**: it is the **Week** in the **Week · Month · Year** switch under
  the Month's title, and `#/week` still works. (Since 2026-10-08 the switch
  runs shortest period first and Paycheck is a screen of its own, ADR 0014.)
- On a computer, a sidebar replaces the old top bar (see Mockup A below).
- **More** is in four groups: Plan, Understand, Settings and help, Records.
  On a computer, More is not needed: every screen is in the sidebar, or
  one tap from Coach (Ask, Check-in) or Help (Getting started).

### Mockup A, the new look (2026-09-29 and 30)

The owner asked on 2026-09-29 for the app to be restyled to Mockup A
(`docs/design/mockup-a/`). It was built in the design's twelve steps, then
swept screen by screen at 320 to 1440 px, light and dark. It is a restyle:
no figure, rule or database table changed. The decisions are ADR 0010
(colours and type), ADR 0011 (the sidebar) and
`docs/design/mockup-a/NOTES.md`, which ends with every deliberate
difference from the mockups.

**What the owner will notice:**
- **A sidebar from 1024 px wide**, grouped Plan · Money · Coach · Inbox ·
  More, with the main goal's progress and Sign out at its foot. Plan is
  always open; the other groups fold and remember it. Between 768 and
  1023 px it is a column of icons. The top bar holds the sidebar toggle,
  where you are ("Budget › Month"), **Search or jump to… ⌘K** (opens
  Help's search for now) and **+ Add**. On a phone nothing moved.
- **Week is in the switch** under each title, Week · Month · Year (ADR
  0014), as before on a phone, and now in the sidebar too.
- **The colours.** The workbook's pastel blocks, teal Setup, slate Year
  and handwritten month title are gone. The app is white cards on a light
  grey with an indigo accent; each list has one colour on every screen
  (orange Variable, sky Bills, violet Subscriptions, rose Debts, green
  Income, amber Savings), and waiting-for-review is always amber. Dark
  mode follows the phone or computer's setting. Every figure lines up in
  columns, and nothing but the sign-in card casts a shadow.

**Left open, none urgent:** chart words are small in the Month's desktop
column (N127); long names are cut in Lists' narrow column (N135) and in
the calendar's payday pills (N131).

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
| Settings | Four tabs (ADR 0014): Lists, your name, lists, bills and pay days; Budgets & goals; AI, on or off, keys, services, limit, tone; Account, learned shops, sign out |
| Help, Getting started | Twelve short articles (PRD 03), the last of them One-time updates and signing in; nine steps to set up, opened from Help's Start here and on the first run |

**Underneath:** all arithmetic is in `packages/core`, checked against the
workbook's own cached values (121 golden tests, unchanged); the coach's
words and checks are in `packages/savings-coach`; the CSV writer is
`packages/report-export`; the AI helper is `supabase/functions/ai`; the
database is `supabase/migrations/0001` to `0018`. Decisions are recorded in
`docs/formula-decisions.md` (F1–F49), `docs/divergences.md` and
`docs/adr/` (0001–0011).

Key decisions already made by the owner (do not reopen): dates are the
purchase date (F1); Gemini's free tier, privacy trade-off accepted
(ADR 0002); the answers in `docs/workbook-views-plan.md` §9a (Month first,
a real charge replaces a planned bill, card payments are not spending, a
starting balance typed each month, savings kept by transfers, pay periods
from the pay schedule); the 2026-09-24 list, including "do the below
without asking me questions" (quoted in `docs/ai-first-plan.md` §1).

## 3. What the owner does, in this order

One list, in the order to do it, rewritten 2026-10-02 after the review
fixes were merged, and trimmed on 2026-11-10 when the AI apps feature was
removed (ADR 0016). Supabase project ref:
`bnodrfghxbavlopxkgju`; "Supabase" below means
supabase.com/dashboard → that project. More detail for each step is in
`docs/setup.md`. In the app, **Help → One-time updates** checks most of
these steps, names the next one, and has a **Copy** button for every file
to paste, so GitHub is not needed. Easiest on a computer.

**Already done (2026-09-24): `0001` to `0014`.** Do not run them again.

**Already done on the hosted project (2026-10-08, by the agent through
the Supabase plugin, each checked afterwards):**
- Part D was done: `0015` to `0041` are in. `schema_level()` answers 41.
  A second paste only says "already in".
  `0042_ai_words_read_one_way.sql` (written for the AI apps) was applied on
  2026-11-10, before the feature was removed. It is harmless and needs
  nothing more (ADR 0016).
- Step 17 was done: the `ai` helper there is `2026-10-08.2` (deploy 9,
  JWT verification on), and it answers a call. This repository's helper
  is `2026-11-09.1` since 2026-11-09, so step 17 is to do again:
  One-time updates says "paste the AI helper's new version" until it is.
  Until then a request that runs out of time before any AI service is
  asked (a receipt photo sent on a weak signal) is still answered "AI
  isn't set up yet", which is untrue; the new copy says the helper
  couldn't finish and to try again.
- Step 18 is done: there is no `read-receipt`.
- Step 19 is done: keys for OpenRouter, Groq and Gemini are saved. Your
  own order, Groq then OpenRouter then Gemini, is kept; 0041 moves only
  an order never chosen. Press **Test** on each row to time it.
- Left for you: step 16 (`OWNER_USER_ID`), and whether the second account
  in **Authentication → Users** stays. If you ever switched on Supabase's
  OAuth server, switch it off (ADR 0016).

**The agent pushes `main` first, and that is safe.** Cloudflare deploys
the site when `main` changes. Netlify, until it is stopped in step 10,
deploys from `main-tnlcto` (`netlify.toml`), so every push there goes
live on the netlify.app site, checked or not.
Nothing the app needs to open depends on the steps below: until each is
done, everything that worked before still works, and each new part says
in one line that it needs a one-time update, with a link to Help (A28).

### Part A: keep strangers out, about 10 minutes, do this first

1. **Turn off sign-ups.** Supabase → **Authentication → Sign In /
   Providers** (older dashboards: **Authentication → Providers → Email**,
   or **Authentication → Settings**) → turn **Allow new users to sign up**
   off → **Save**. While it is on, anyone who finds the site can make an
   account with the public key in the page, and any account can use your
   Gemini key. One-time updates lists **Sign-ups off** first until it is.
2. **Remove anyone who is not you.** Supabase → **Authentication →
   Users** → on any row that is not your email, `⋯` → **Delete user** →
   confirm.
3. **A longer minimum password.** Supabase → **Authentication → Sign In /
   Providers → Email** (older: **Authentication → Policies**) →
   **Minimum password length** → `16` → **Save**. Supabase checks it only
   when a password is next set, so step 9 sets a new one.
4. **Two-step sign-in on the accounts that hold this app.** Each takes a
   minute with an authenticator app:
   - Supabase: your avatar (top right) → **Account preferences** →
     **Security** → **Multi-factor authentication** → **Add new app** →
     scan, type the code → **Verify**.
   - GitHub: your avatar → **Settings → Password and authentication →
     Two-factor authentication → Enable**.
   - Cloudflare: **My Profile → Authentication → Two-Factor
     Authentication → Set up**.
   - Google (your Gemini key): myaccount.google.com → **Security →
     2-Step Verification → Get started**.
   - Netlify: **User settings → Security → Two-factor authentication**.
   If a menu has moved, look for Security in that account's settings.
   The budget app's own sign-in has no second step yet: that is the next
   agent's slice (security-c1-03, in the review notes), not yours.

### Part B: the site on Cloudflare, about 15 minutes, once

Skip 5 if `https://aaron-budget-app.pages.dev` already opens the app.

5. **Cloudflare Pages.** Cloudflare dashboard → **Workers & Pages →
   Create → Pages → Connect to Git** → `aaronjoseph94/budget-app`.
   Project name `aaron-budget-app`, production branch `main`, framework
   preset **None**, build command `pnpm --filter @budget/app-client build`,
   build output directory `apps/web/dist`, root directory empty.
   **Environment variables** (same screen, before the first deploy):
   `NODE_VERSION` = `24`, `PNPM_VERSION` = `10.34.6`,
   `VITE_SUPABASE_URL` = `https://bnodrfghxbavlopxkgju.supabase.co`,
   `VITE_SUPABASE_ANON_KEY` = the **publishable** key (`sb_publishable_…`,
   the same value as in `netlify.toml`), never a secret or `service_role`
   key: the build stops if it is one. **Save and Deploy**. If the project
   was made earlier with `PNPM_VERSION` `10`, change it to `10.33.0`
   (**Settings → Environment variables → Edit**) and **Deployments → Retry
   deployment** (N61.3).
6. **Where sign-in links return.** Supabase → **Authentication → URL
   Configuration**: **Site URL** = `https://aaron-budget-app.pages.dev` →
   **Save**. Under **Redirect URLs** → **Add URL** →
   `https://aaron-budget-app.pages.dev/**` → **Save URLs**. Keep
   `http://localhost:5173/**`. Leave the Netlify entry for now (step 10).
7. **Check the site.** Open `https://aaron-budget-app.pages.dev` and sign
   in with your password.
8. **Only if this pages.dev site is not the one you set up** (Cloudflare
   gave another name, or you use your own domain): Supabase → **Edge
   Functions → Secrets → Add new secret** → `EXTRA_ORIGINS` =
   `https://<that address>` → **Save**.
9. **A new, long password, and every old sign-in ended.** On the
   pages.dev site: sign out → type your email → **Forgot your password?**
   → open the email **on the same device, in the same browser** → paste a
   password-manager-generated password of 20+ characters → **Save
   password**. Links sent from the Supabase dashboard (**Reset password**,
   **Send magic link**) do not work with this app. Then end every older
   sign-in (a sign-in link with a live token was pasted into a chat
   earlier): Supabase → **SQL Editor → New query** →
   `delete from auth.sessions;` → **Run**. It signs you out everywhere:
   sign in again with the new password.
10. **Retire Netlify, keeping its name.** Supabase → **Authentication →
    URL Configuration → Redirect URLs** → on the
    `https://aaron-budget-app.netlify.app/**` row press the bin icon →
    confirm → check **Site URL** still says
    `https://aaron-budget-app.pages.dev`. Sign in once more on the
    pages.dev site. Then Netlify → your site → **Site configuration →
    Build & deploy → Continuous deployment → Stop builds**. **Do not
    choose Delete this site**: deleting frees the
    `aaron-budget-app.netlify.app` name for anyone, and an address left
    in Redirect URLs would send your sign-in links to them. Tell the next
    agent it is done: it then removes the netlify.app origin from the
    functions and `netlify.toml` (N151).
11. **iPhone.** In Safari open the pages.dev site → **Share → Add to Home
    Screen**. Remove an icon added before 2026-09-23 first (N24).

### Part C: GitHub, 5 minutes, once

12. **Only green commits reach the site.** github.com →
    `aaronjoseph94/budget-app` → **Settings → Branches → Add branch
    protection rule** → Branch name pattern `main` → tick **Require status
    checks to pass before merging** → in the search box type `gates` and
    pick **gates** → tick **Do not allow bypassing the above settings** →
    **Create**. (Newer screen: **Settings → Rules → Rulesets → New ruleset
    → New branch ruleset** → name `main` → Enforcement status **Active** →
    **Target branches → Add target → Include by pattern** `main` → tick
    **Require status checks to pass** → **Add checks** → `gates` → tick
    **Block force pushes** → **Create**.) From then on the agent pushes to
    `main-tnlcto` first, waits for the green **gates** run, and only then
    pushes that same commit to `main`.

### Part D: the database updates, 0015 to 0041, about 20 minutes, once

13. **A backup first.** Some of these updates change saved rows, and
    `0038` **permanently deletes** a learned shop where two would end up
    with one name. On a computer with PostgreSQL's `pg_dump`: Supabase →
    **Connect** (top of the project page; older: **Project Settings →
    Database → Connection string**) → **Session pooler** → copy the URI,
    put your database password in place of `[YOUR-PASSWORD]`, then run
    `pg_dump "<that URI>" --data-only --schema=public -f budget-before-0015.sql`.
    Use `pg_dump` 17 or newer: if it says "server version mismatch",
    install the newer client and run it again. The file holds rows only:
    putting them back needs the tables first, from the updates (`0001` up
    to the last one that was in), and the next agent should do that.
    Open the file and check it holds `COPY public.merchant_rules` with
    your shops' names. With no such computer, at least: Supabase → **Table
    Editor** → `merchant_rules` → **Export → Export table as CSV**, and
    check it has as many rows as **SQL Editor** →
    `select count(*) from merchant_rules;` says; the same for
    `transactions` and `ingest_candidates`. Keep the files somewhere
    private, never in GitHub: they are your financial history.
14. **Paste each update, one at a time, in this order.** For each:
    Supabase → **SQL Editor → New query**; in the app, **Help → One-time
    updates → Copy** beside the file it names; paste; **Run**; wait for
    "Success. No rows returned."; **Check again** in the app. The order:
    `0015_savings_goals_order.sql`, `0016_ai_foundation.sql`,
    `0017_coach_memory.sql`, `0018_category_suggestions.sql`,
    `0019_ai_apps_cannot_write.sql`, `0020_ai_apps.sql`, then the review
    fixes `0021_category_holds.sql`, `0022_removed_charge_waits.sql`,
    `0023_typed_entry_once.sql`, `0024_learned_shops_own_category.sql`,
    `0025_ingested_text_format_characters.sql`,
    `0026_goal_check_on_link.sql`, `0027_receipt_photo_twice_waits.sql`,
    `0028_ai_words_no_invisible_characters.sql`,
    `0029_lookalike_charge_waits.sql`, then `0035_ai_app_updates_in.sql`,
    `0030_ai_app_gate_live_session.sql`, `0031_ai_app_hash_own_kind.sql`,
    `0032_ai_rows_teach_no_rule.sql`, `0033_ai_search_masked.sql`,
    `0034_ai_words_visible.sql`, `0036_ai_search_as_shown.sql`,
    `0037_ai_rows_before_the_fixes.sql`.
    `0019`, `0020` and `0030` to `0037` were for the AI apps, which are
    removed (ADR 0016). They do nothing the app uses; they stay in the list
    only because the files after them check for them, so a new, empty
    database still takes them in this order.
15. **Before `0038`, the backup again if you have used the app since step
    13**, the same way, named `budget-before-0038.sql`. Then paste
    `0038_intuit_prefix_merchants.sql`. (It was written as `0030` and
    renumbered `0038` when two lines of updates merged on 2026-10-02;
    neither number was ever applied.) Then paste
    `0039_ai_apps_suggest_changes.sql` and
    `0040_ai_words_every_character_shown.sql` (AI apps only, removed: they
    delete nothing and do nothing the app uses, ADR 0016). Then paste
    `0041_ai_free_order.sql`: the AI services are tried free and quick
    first, OpenRouter, then Groq, then Gemini (ADR 0015); an order you
    never changed follows, one you changed stays. It needs `0038` and
    `0016`, says "Paste 0038 first" or "Paste 0016 first" without them,
    and deletes nothing. `0042_ai_words_read_one_way.sql` is not needed (it was applied on 2026-11-10).

    Each update refuses to run before the one it needs ("Paste 0018
    first", "Paste 0035 first" and so on) and changes nothing then.
    Pasting one again by mistake is harmless: it is refused with nothing
    changed ("is already in; nothing to do", "already exists", "is not as
    0019 left it" or similar), or, for `0030`, `0031`, `0035` and `0037`,
    it runs again to the same result. If one says anything else, stop
    there: nothing is lost, and the next agent needs that message word for
    word.

### Part E: the AI helper and free AI, about 15 minutes, once

16. **Only you may use the helper.** Supabase → **Authentication →
    Users** → click your row → copy **User UID**. Then **Edge Functions →
    Secrets** (or **Project Settings → Edge Functions → Secrets**) → **Add
    new secret** → Name `OWNER_USER_ID`, Value the UID → **Save**. The
    helper and read-receipt then refuse every other account; a typo makes
    them serve no one, so if AI says you are not signed in afterwards,
    check this value.
17. **Paste the AI helper.** Supabase → **Edge Functions → Deploy a new
    function → Via Editor** (if `ai` is already listed: **Edge Functions
    → ai → Code**). Name it exactly `ai`. In the app, **Copy** beside "The
    AI helper", paste it over everything in the editor. **Enforce JWT
    verification**: keep it **on**. **Deploy**.
    One-time updates shows ✓ once version `2026-11-09.1` or later answers
    (the speed test and the free-first order, ADR 0015; and, out of time
    before any service was asked, it says so, not "AI isn't set up").
18. **read-receipt: delete it.** Supabase → **Edge Functions →
    read-receipt** (only if it is listed) → `⋯` → **Delete** → confirm.
    The helper reads receipts without it. (To keep it instead, open its
    code, paste the new version with **Copy** beside read-receipt, and
    **Deploy**: its new copy reads the **Use AI** switch and
    `OWNER_USER_ID`. Paste it again after every helper update.) One-time
    updates shows ✓ once it is deleted or new.
19. **Turn on free AI.** In the app: **Settings** (on a phone, **More**) →
    **AI** → under **Free AI**, the OpenRouter row → **Get a free
    OpenRouter key**. OpenRouter opens: **Create API Key**, copy it, come
    back, paste it, **Save & test**. Expect "Works · key ending …abcd";
    **Test** then says "Last test: 1.2 s on OpenRouter · inkling-small".
    The Groq and Google Gemini rows take a key the same way. If
    `GEMINI_API_KEY` is already set for receipts, Gemini's row already
    says "Already on". To stop all AI later, turn off **Use AI** at the
    top of Settings › AI.

### Part F: removed

Part F (steps 20 to 26) set up Claude and ChatGPT as AI apps. The feature
was removed on 2026-11-10 (ADR 0016), so there is nothing to do. The step
numbers are not reused: Part G still starts at 27. If you ever switched on
Supabase's OAuth server, switch it off (**Authentication → OAuth Server**)
and remove any client listed there; neither is needed for the app to work.

### Part G: your call, no rush

27. **CLAUDE.md's stack line** (N8) names TanStack Router and Query and
    vite-plugin-pwa, which the app has never used. It is your file, so no
    agent changes it. If you agree, replace that line with: "pnpm
    monorepo · Vite + React 19 + TypeScript · hash navigation in nav.ts
    (ADR 0003, 0006, 0011) and a React-context data layer (app-data.tsx)
    · Tailwind v4 · a web manifest, installable, no service worker (camera
    via file capture) · Supabase (Postgres, Storage, Edge Functions,
    pg_cron) · Cloudflare Pages (static, user's own domain) · zod ·
    Vitest", or tell the next agent "change the stack line as N8 says".

## 4. How to check it worked, screen by screen

Nothing has been run against the real Supabase yet: this environment cannot
reach it. Every step below was walked in a stand-in (the screen tests' fake
database and a fake AI) with invented data, at 320 and 390 px, light and
dark, with no errors (A28). The real run is the owner's. Any failure shows
a sentence; one that says it "needs a one-time update" links to Help →
One-time updates, which names what is missing.

1. **Sign in.** With no lists yet, the app opens **Getting started**:
   "Step 1 of 9". Do the steps, or **Do this later** on any.
2. **Help → One-time updates** says "All done" after §3's steps.
3. **Settings → AI** says "AI is on, using free OpenRouter" (or whichever
   free service has a key first), and under **Advanced**, "Today: 0 of
   40".
4. **Add → Statement →** the card statement PDF. Expect "Matches your
   statement", then **Import**: "N waiting for review".
5. **Review → Suggest categories.** Rows show "✨ Suggested", already
   picked. Nothing is filed until you press **Approve**, or **Approve
   these N** and confirm. Each shop is learned. Import the same PDF again:
   nothing new appears.
6. **Month.** The coach line above the summary, "By 24 Sep … · by 24 Aug"
   beside it, and after you type **Start**, End of month and a
   **Forecast** line. Switch a block to **vs last month**.
7. **Coach.** A line saying whose words these are; your main goal with its
   hours and date; at most three cards, each with **Why am I seeing
   this?** and **✕**; a quote with its source; **Ask anything**.
8. **Coach → the check-in** (from Sunday): last week, a win, questions
   about a few charges, and a one-tap weekly limit.
9. **Forecast.** Safe to spend a day, the month's end as a range (or
   "rough" early in a month or with little history), the next 30 days,
   goal dates with **What if** chips, three months ahead.
10. **Reports.** Overview (the month in review, Income, Spent and Saved,
    biggest changes, this month against last), Trends, Shops, Habits;
    **Save as PDF** and **Download CSV**.
11. **Ask.** "How much did I spend eating out this month?" gets the
    engine's figure and "I read that as: …".
12. **Help.** Search "forecast"; each screen's **?** opens its article.
13. **With AI off** (Settings → AI → the switch), every screen above still
    works, in the app's own words.
14. **iPhone:** open the Month, the Coach and the Forecast in Safari, and
    look at the ring, the tables and the 30-day line. Then make the text
    larger (**aA** in Safari) and look again: nothing should need scrolling
    sideways. Only Chromium could be checked here (N41); tell the next
    agent which screen if anything is squashed or cut off.

Steps 15 to 24 were the AI apps' first-connection checks. They were removed
with the feature on 2026-11-10 (ADR 0016); the numbers are not reused.

## 5. Questions for the owner

Each has a default already in use, so nothing waits on the answer. Answer
any of them and the next agent records it and builds it.

1. **Week and Paycheck: starting and ending balance (N45).** The workbook's Weekly
   and Paycheck tabs show a starting and an ending bank balance. The app
   stores a starting balance per month only. **In use: A — not shown.**
   B — work each week's start out from the month's typed start and that
   month's rows before the week. C — type a start for every week (needs a
   one-time update).
2. **Do payments you record move a debt's balance? (N53)** The workbook's Debt
   Calculator takes balances from its payoff schedule alone. **In use:
   A — the schedule only, as in the workbook.** B — link a debt to a Debts-list
   category and let recorded payments replace the schedule's. C — show
   recorded payments beside the schedule without changing it. B or C
   needs a one-time update.
3. **The Year's "Biggest expense" and "Top 3" (F18).** An engineering
   default, told here so it is not a surprise. **In use: each category's
   real total over the Year's months, a real charge replacing a planned
   bill, planned bills counted only from the month they were set up and
   only up to this month.** The workbook instead counts twelve times each monthly
   amount plus everything logged. Say if you want the workbook's measure.

Things to know, which follow the workbook or a recorded choice (details in
the N-entries named): with no starting balance typed there is no End of
month and no forecast balance (D17, N37); End of month reads low until pay
is typed (N37); the Year opens on January of this year (N43); Debts' "Paid
this month" is what the payoff schedule pays (N57); a bill charged just
after a month ends can count planned in one month and twice in the next
(N36); a fund's monthly figure falls as it fills (N54). Your records start
on 8 August 2026, so trends and ranges say "not enough months yet" or
"rough" until about November.

## 6. What is left, most important first

Details in `NOTICED-NOT-TOUCHING.md`; each entry says what would settle it.

1. **The owner's real run** (§3 and §4). Until then nothing has touched the
   hosted database or a real AI service.
2. **The workbook vendor's name in old commits** (N64). It is gone from
   every file; rewriting the history of earlier pushes, which the owner
   asked for, is the step taken when this branch goes to `main`, followed
   by a gate over commit messages and history.
3. **Receipt accuracy is unmeasured** (N6): ≥20 labelled receipts that may
   be kept, redacted, are needed.
4. **Retire `read-receipt`** once the AI helper is live (N107).
5. **Not built:** due reminders, the Sankey, the Excel workbook with
   charts (a new dependency); 50/30/20, Net Worth, Financial Freedom, by
   the owner's choice (`docs/workbook-views-plan.md` §9a).
6. **Tidying with no visible change** (N118): shared loading code for the
   period screens, the Week's and Paycheck's near-copy summaries, and
   splitting `ledger.ts`, AddScreen and MonthScreen.
7. **Small:** vitest's moderate advisory, a major upgrade (N62, by
   2026-12-31); CI actions pinned to tags (N1); `transactions.posted_on`
   holds the purchase date (F1) despite its name; CLAUDE.md's stack line
   names libraries the app does not use (N8, the owner's file).

Settled in A28, the owner's decision delegated to the engineer: axe-core
checks every screen test (N61.1); field monitoring with web-vitals and a
slimmer Supabase client were declined, with reasons (N61.2, N60.2;
ADR 0009).

## 7. Things to know about how this code is written

- Comments explain *why*, often with the bug that motivated them. Keep that.
  If code changes, change the comment — a comment that lies is worse than none.
- Commits are small and each one passes the gates on its own.
- Tailwind classes are joined with a plain `cn()` (no tailwind-merge). A base
  component must never set a style a caller would override — use a prop
  (see `src/lib/cn.ts`).
- The PDF reader is hand-written on purpose (no pdf.js). A misread cannot pass
  silently because every import is reconciled against the statement's own
  printed totals and refused if they differ.
- Every AI surface has the app's own words underneath, and every new read
  fails on its own (plan §3.10): a screen never waits on the AI.
- Screen tests use a fake Supabase client (`apps/web/test/fake-supabase.ts`)
  and end with an axe check (`apps/web/test/axe.ts`). The same fake serves
  the app in a real browser for `pnpm e2e` (`apps/web/e2e`, tests in
  `tests/`); `bash apps/web/e2e/start.sh` serves it by hand on :5275.
