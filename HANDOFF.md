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
- On a computer, a sidebar replaces the old top bar (see Mockup A below).
- **More** is in four groups: Plan, Understand, Set up and help, Records.
  On a computer, More is not needed: every screen is in the sidebar, or
  one tap from Coach (Ask, Check-in) or Settings (AI settings, Getting
  started).

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
  Setup, with the main goal's progress and Sign out at its foot. Plan is
  always open; the other groups fold and remember it. Between 768 and
  1023 px it is a column of icons. The top bar holds the sidebar toggle,
  where you are ("Budget › Month"), **Search or jump to… ⌘K** (opens
  Help's search for now) and **+ Add**. On a phone nothing moved.
- **Week is in the switch** under each title, Month · Week · Pay · Year,
  as before on a phone, and now in the sidebar too.
- **The colours.** The workbook's pastel blocks, teal Setup, slate Year
  and handwritten month title are gone. The app is white cards on a light
  grey with an indigo accent; each list has one colour on every screen
  (orange Variable, sky Bills, violet Subscriptions, rose Debts, green
  Income, amber Savings), and waiting-for-review is always amber. Dark
  mode follows the phone or computer's setting. Every figure lines up in
  columns, and nothing but the sign-in card casts a shadow.

**Left open, none urgent:** chart words are small in the Month's desktop
column (N127); long names are cut in Setup's narrow column (N135) and in
the calendar's payday pills (N131); AI settings has no link on a computer
once AI is on (N136).

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
`docs/adr/` (0001–0011).

Key decisions already made by the owner (do not reopen): dates are the
purchase date (F1); Gemini's free tier, privacy trade-off accepted
(ADR 0002); the answers in `docs/workbook-views-plan.md` §9a (Month first,
a real charge replaces a planned bill, card payments are not spending, a
starting balance typed each month, savings kept by transfers, pay periods
from the pay schedule); the 2026-09-24 list, including "do the below
without asking me questions" (quoted in `docs/ai-first-plan.md` §1).

## 3. What the owner does, in this order

Supabase project ref: `bnodrfghxbavlopxkgju`. More detail for each step is
in `docs/setup.md`.

**Already done (2026-09-24): `0001` to `0014`.** You pasted `0003` to
`0014` ("the pasting to supabase is done"), and `0001` and `0002` before
that. Do not run them again.

**Merging to `main` comes first, and is safe.** `main` deploys itself when
it changes. Nothing the app needs to open depends on the new updates:
until you do the steps below, everything that worked before still
works, and each new part says in one line that it needs a one-time
update, with a link to Help. This was checked screen by screen with each
update missing in turn (A28).

In the app, **Help → One-time updates** walks every step below in this
order, checks each one, and has **Copy** buttons, so there is no need to
open GitHub. Easiest on a computer.

**Part A: the updates and free AI, about 15 minutes, once.**

1. **Paste the new database updates, one at a time.** Supabase →
   **SQL Editor** → **New query**. In the app, Help → One-time updates →
   **Copy** beside `0015_savings_goals_order.sql`. Paste, press **Run**,
   and wait for "Success. No rows returned." Then a new query for
   `0016_ai_foundation.sql`, then `0017_coach_memory.sql`,
   `0018_category_suggestions.sql`, `0019_ai_apps_cannot_write.sql`,
   `0020_ai_apps.sql`, then the review fixes `0021` to `0029` in number
   order, then `0035_ai_app_updates_in.sql` (it only reads, and needs
   nothing but `0020`), then the security fixes `0030` to `0034`, `0036`
   and `0037`, in that order, and last `0038_intuit_prefix_merchants.sql`,
   **after the backup below** (One-time updates lists them in this order
   and names the next). `0019` stops with "Paste 0018 first" if `0018` is
   not in, `0020` with "Paste 0019 first", and each fix with the one
   before it; `0038` asks for both `0029` and `0037`. Pasting one again by
   mistake is harmless: `0022`, `0027`, `0029` and `0032` to `0034` refuse
   ("is not as 0019 left it" or similar) and change nothing. If one says
   anything else, stop there: nothing is lost, the message says which
   line, and the next agent needs that message (MCP plan K10, K11).

   **Before 0038, a backup.** `0038` tidies shop names that begin `IN*`
   (Intuit's prefix) and, where two of your learned shops would end up
   with one name, **permanently deletes** all but the one made or used
   most recently. (Numbering: it was written as `0030` and renumbered
   `0038` when two lines of updates were merged on 2026-10-02.) So,
   before pasting it:
   - On a computer with PostgreSQL's `pg_dump`: Supabase → **Project
     Settings → Database → Connection string** → copy the **Session
     pooler** address and put your database password in it, then run
     `pg_dump "<that address>" --data-only --schema=public -f budget-before-0038.sql`.
     Open the file and check it holds `merchant_rules` with your shops'
     names in it.
   - With no such computer, at least keep the rows it can delete:
     **Table Editor** → `merchant_rules` → **Export → Export table as
     CSV**, and check the file has as many rows as **SQL Editor** →
     `select count(*) from merchant_rules;` says.
   Keep the file somewhere private, never in GitHub: it is your
   financial history. Then paste `0038`.
2. **Paste the AI helper.** Supabase → **Edge Functions** → **Deploy a new
   function** → **Via Editor**. Name it exactly `ai`. In the app, **Copy**
   beside "The AI helper", paste it over everything in the editor. Set
   **Enforce JWT verification** as One-time updates says: on while
   Supabase signs with its old key, off once it signs with the new one
   (step 4). Press **Deploy**. There are no new secrets: `GEMINI_API_KEY`
   and `EXTRA_ORIGINS` are reused if you set them for receipt photos.
   **If Edge Functions also lists `read-receipt`**, paste its new version
   the same way (its **Copy** is beside the helper's) or delete it (its
   `⋯` menu → **Delete**): the helper reads receipts without it, and its
   old copy lets anyone holding the app's public key use your Gemini key.
   One-time updates now checks this too: **read-receipt** shows ✓ once it
   is deleted or its new version is in, and is the next step until then.
3. **Turn on free AI.** In the app: Settings (More on a phone) → **AI settings** → **Get a free
   key**. Google AI Studio opens in a new tab: **Create API key**, copy it,
   come back, paste it, and press **Save & test**. You should see "Works ·
   key ending …abcd". If you set `GEMINI_API_KEY` for receipts earlier,
   the screen already says "AI is on" and there is nothing to paste.

**Part B: Claude and ChatGPT (AI apps), about 20 minutes, once, on a
computer.** Only if you want them; Part A stands alone, but Part B needs
Part A's steps 1 and 2: **Let AI apps connect** will not turn on, and the
connect page offers no **Allow**, until `0019`, `0020`, the AI helper's
new version and read-receipt (deleted or new) are in. It needs the
Cloudflare site live with its Site URL set in Supabase ("Still open from
before", below), because Supabase finds the app's connect page from it.

4. **The signing key**, only if One-time updates shows **Signing key**
   with a ✗ (it reads your own sign-in to tell). ChatGPT cannot sign in
   without it. First, Supabase → **Edge Functions** → `ai` → its
   settings → turn **Enforce JWT verification** off → **Save**; the same
   for `read-receipt` if you kept it, but only once its new version from
   step 2 is in: its older copy relies on that switch alone, and with it
   off anyone could use your Gemini key. Supabase's own guide warns that
   changing the key with that switch on can break a function, and both
   new versions check every caller themselves. Then **Project Settings →
   JWT Keys** → **Rotate keys**, so the current key is the **ECC
   (P-256)** one. Do not revoke the old key. Sign out of the app and back
   in, and press **Check again**.
5. **Sign-in for AI apps.** Supabase → **Authentication → URL
   Configuration**: check **Site URL** is
   `https://aaron-budget-app.pages.dev`. Then **Authentication → OAuth
   Server** → **Enable**; set **Authorization Path** to `/oauth/consent`;
   turn on dynamic client registration (the switch that lets apps register
   themselves); **Save**. Then **Authentication → Sign In / Providers**:
   **Allow new users to sign up** stays off; under **Email**, keep
   **Secure email change** on, and turn on any setting that asks for the
   current password before a password change.
6. **Deploy the AI apps server.** Supabase → **Edge Functions** → **Deploy
   a new function** → **Via Editor**. Name it exactly `mcp`. In the app,
   **Copy** beside "The AI apps server", paste it over everything in the
   editor, turn **Enforce JWT verification off**, and press **Deploy**.
   Off is right for this one: the server checks every caller itself, and
   Claude and ChatGPT find the sign-in only through the server's own
   answer, which that switch would hide. Supabase has been seen to turn
   it back on after an update, so after any later paste, open the
   function's settings and check it is still off.
7. **Check again** on One-time updates says "All done".
8. **Connect Claude**, as **Help → Connect Claude** says: Settings → AI
   apps → turn on **Let AI apps connect** → **Connect a new AI app**, then
   within 15 minutes, on claude.ai, **Customize → Connectors → Add custom
   connector**, name it **Budget**, paste the address, choose **Register
   automatically** (not "Use Claude's published identity"), **Add**,
   **Connect**, and **Allow** on the budget app's page.
9. **Connect ChatGPT**, as **Help → Connect ChatGPT** says (Plus or
   higher, the website only): **Connect a new AI app** first; on
   chatgpt.com, **Settings → Security and login → Developer mode** on;
   then **chatgpt.com/plugins → +**, name **Budget**, paste the address,
   **OAuth** (dynamic registration if asked), **Create**, and **Allow**.

Then work through §4's first-connection checks, 15 to 24, in order.

**Still open from before, if not done yet:**
- **Cloudflare Pages** (replaces Netlify). **Workers & Pages → Create →
  Pages → Connect to Git →** `aaronjoseph94/budget-app`. Project name
  `aaron-budget-app`, production branch `main`, framework preset None,
  build command `pnpm --filter @budget/app-client build`, output directory
  `apps/web/dist`. Environment variables: `NODE_VERSION` = `22`,
  `PNPM_VERSION` = `10.33.0`, `VITE_SUPABASE_URL` =
  `https://bnodrfghxbavlopxkgju.supabase.co`, `VITE_SUPABASE_ANON_KEY` = the
  publishable key in `netlify.toml` (public by design). Then in Supabase →
  **Authentication → URL Configuration**: Site URL
  `https://aaron-budget-app.pages.dev`, and add
  `https://aaron-budget-app.pages.dev/**` to Redirect URLs. Once it works,
  delete the Netlify site; the next agent then removes `netlify.toml`.
  If the Pages project was made earlier with `PNPM_VERSION` `10`, change it
  to `10.33.0` there (N61.3).
- **Your password, and signing out old sessions.** **Authentication →
  Users →** the `⋯` on your row → **Reset password**. Then end every
  old sign-in: **SQL Editor** → **New query** → `delete from
  auth.sessions;` → **Run**, and sign in to the app again. A sign-in link
  with a live token was pasted into a chat earlier. (This is the same line
  as check 18 and Help's emergency steps; the dashboard's "Sign out user"
  was never confirmed to end every session, so it is not used.)
- **Stop strangers registering.** **Authentication → Sign In / Providers**
  → turn **Allow new users to sign up** off → **Save**. The app already
  asks Supabase never to make an account, but the public key in the web
  page lets anyone ask Supabase directly; only this switch refuses them.
  Then look in **Authentication → Users** and delete any row that is not
  you. Add people later with **Add user** on that page.
- **iPhone.** In Safari open the site → **Share → Add to Home Screen**.
  Remove an icon added before 2026-09-23 first (N24).

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
3. **AI settings** says "AI is on, using free Google Gemini" (or "your
   receipts key"), and under More AI services, "Today: 0 of 40".
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
13. **With AI off** (AI settings → the switch), every screen above still
    works, in the app's own words.
14. **iPhone:** open the Month, the Coach and the Forecast in Safari, and
    look at the ring, the tables and the 30-day line. Then make the text
    larger (**aA** in Safari) and look again: nothing should need scrolling
    sideways. Only Chromium could be checked here (N41); tell the next
    agent which screen if anything is squashed or cut off.
**AI apps, the first connection** (MCP plan `docs/design/mcp/PLAN.md`
§2.14, K1 to K13). None of this could run here: it needs the live
project. Do them in order, and stop at the first that fails: each says
what to do, and reporting the words on the screen is enough.

15. **The server answers** (K4, K6). In a browser tab, open
    `https://bnodrfghxbavlopxkgju.supabase.co/functions/v1/mcp/health`.
    Expect `{"ok":true,"version":"…","tools":10}`. A 401 means **Enforce
    JWT verification** is on for `mcp`: turn it off. Anything else, or
    `"tools":0`, means the server did not start: report what it shows.
16. **Sign-in starts** (K3, K8). After **Connect a new AI app** and
    **Connect** in Claude, the browser opens the budget app's **Connect an
    AI app** page. If Claude shows an error before that, report it word
    for word. If nothing happens at all, check **Enforce JWT
    verification** is still off for `mcp` (step 6).
17. **The page** (K7, K12). Its address starts
    `aaron-budget-app.pages.dev/oauth/consent?authorization_id=`, and it
    says **claude.ai** in bold above **Allow**. If the address is not
    found, or the page says "This isn't a connection request", stop and
    report it: nothing has been connected.
18. **The first question** (K1, the one that matters most). Ask Claude
    "list my categories". It should list yours. **If it says the budget
    app did not recognise this sign-in as an AI app's, at once, in this
    order: Settings → AI apps → Disconnect beside Claude; turn off Let AI
    apps connect; Supabase → SQL Editor → run `delete from auth.sessions;`
    (it signs you out too: sign in again after); then Supabase →
    Authentication → OAuth Server → turn it off; and report it.** Turning
    the OAuth Server off first would leave nothing in the app to
    disconnect, and the switch alone does not end the AI app's sign-in. That answer would mean
    the database cannot tell an AI app's sign-in from your own: the server
    turns the AI app away, but its sign-in, used without the server, could
    change your records. One-time updates then lists **Sign-in for AI
    apps** as not in: leave it off until the next agent says otherwise. If
    instead every question gets "Something went wrong in the budget app's
    server", turn off **Let AI apps connect** and report that. **If every
    question says "This connection to the budget app has ended"** right
    after you connected, report it: `0030` could not see the sign-in as
    live (the token carries no `session_id`, or the database may not read
    Supabase's sign-ins table). Nothing is at risk; the AI app is only
    refused.
19. **Your figures** (K11). Ask "How is my month going?": the figures match
    the Month. If every answer says the app could not read your records,
    turn off **Let AI apps connect** and report it.
20. **An addition.** Ask "add a test coffee for $1.00 today". **Review**
    shows it, with "Added by Claude"; press **✕** on it.
21. **Disconnect** (K2). **Settings → AI apps → Connected apps** lists
    Claude, "Last asked" today. First, in Supabase's **SQL Editor**, run
    `select count(*) from auth.sessions;` and note the number. Press
    **Disconnect**, then **Yes, disconnect**, and ask Claude something: it
    can no longer reach your budget. Run the same line again: the number
    should be one lower. If it is not, report it: Disconnect then ends the
    server's access but not, for up to an hour, a copy of the token used
    another way (`0030` relies on that row going). Connect it again with
    **Connect a new AI app** if you want it.
22. **ChatGPT** (K3, K8, K9). Its connect page says **chatgpt.com** in
    bold, with **Allow**. If it says instead "This app would send you to
    chatgpt.com, which is not Claude or ChatGPT", press **Deny** and
    report it: ChatGPT used a callback address the app does not know yet,
    and adding it is a one-line change. If sign-in fails before the page,
    check step 4's signing key.
23. **One-time updates** (K13). If **Signing key** or **Sign-in for AI
    apps** still says "Could not check" after you did them, look at the
    setting in Supabase by eye and report it; nothing else depends on it.

24. **What an AI app's sign-in can do to your account** (K5, MCP plan
    risk 2, security review mcp-2-03). Not yours to check alone: with the
    next agent, on the live project, send an AI app's token to Supabase's
    `PUT /auth/v1/user` asking to change the password, the email and the
    profile data, with and without a second sign-in factor (MFA), with
    **Secure password change** on. Record what Supabase allowed in ADR
    0012. If a password change goes through, turn on a second factor and
    test again, or adopt the Custom Access Token hook (PLAN risk 3). The
    consent page, Settings and Help already say the sign-in reaches the
    account until **Disconnect**. Until this is done, connect only from
    your own computer, and **Disconnect** any app you stop using.

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
  and end with an axe check (`apps/web/test/axe.ts`). The preview harness
  that drives them in a browser lives in the agent's scratchpad, not here.
