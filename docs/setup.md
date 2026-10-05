# One-time setup

Settings that live in the Supabase, Cloudflare and Netlify dashboards rather
than in this repository. They are recorded here because a setting nobody wrote down is
found again by hitting the same wall twice.

## Supabase: database migrations, in order

Run each file in `supabase/migrations/` once, in filename order, in
**SQL Editor → New query → paste → Run**. `0001` and `0002` were applied
to the hosted project on 2026-09-22, and `0003` to `0014` on 2026-09-24
(the owner: "the pasting to supabase is done"). Anything newer starts at
`0015`. Each ends in "Success. No rows returned." Running one twice does
no harm: it is refused with nothing changed ("is already in; nothing to
do", "already exists" or similar), or, for `0030`, `0031`, `0035` and
`0037`, it runs again to the same result.

| File | What it adds |
|---|---|
| `0001_initial_schema.sql` | Tables, row-level security, private receipts bucket |
| `0002_unreadable_lines.sql` | A record of statement lines that could not be read |
| `0003_save_import_atomically.sql` | Saving an import as one transaction |
| `0004_one_path_into_the_ledger.sql` | Approval, rules that learn, budgets, the goal, PDF imports |
| `0005_category_kinds.sql` | Which of the workbook's lists each category is on. Your existing categories go under Variable expenses until the Setup screen lets you move them |
| `0006_recategorise.sql` | Moving a charge that is already saved to a different category |
| `0007_statement_periods.sql` | Remembering which dates each imported statement covered |
| `0008_category_budgets.sql` | The budgets and goals you type on a month, "from this month on" or "just this month". Needed by the Month as soon as this branch is merged |
| `0009_category_plans.sql` | Each bill's, debt's and subscription's monthly amount and the day it is paid. Needed by Setup's Day paid and Monthly amount, and by the Month, which counts each bill's planned amount, as soon as this branch is merged. Once it runs, a category with a monthly amount stays on its list until you stop the amount (Stop, under it in Setup) |
| `0010_month_balances.sql` | The bank balance you type for the start of each month. Needed by the Month, whose card shows it as Start and projects End of month from it, as soon as this branch is merged |
| `0011_pay_schedules.sql` | When each income source pays: a payday, and weekly, every two weeks or monthly. Needed by Setup's How often and First payday on each Income row, and by Paycheck, as soon as this branch is merged; the Bill Calendar will read it too |
| `0012_dismiss_unreadable_lines.sql` | Dismissing a statement line the app could not read. Needed by Review as soon as this branch is merged |
| `0013_savings_funds.sql` | Linking a savings goal to one of your Savings-list funds, with the date saving started and the date the amount you typed was true, so transfers you record after it can add to it. Your existing goal keeps working as it is. Needed by the Savings screen, and by the Year's savings chart |
| `0014_debts.sql` | Your debts for the Debt Calculator: each one's starting balance, minimum payment, interest rate and start month, and any extra payments by month. Needed by the Debts screen, and by the Year's debt chart |
| `0015_savings_goals_order.sql` | Which of your savings goals is the main one (the one the Coach and the Week show), the order Savings lists them in, and pausing a goal or marking it reached. Your goals stay as they are: the oldest leads until you choose another. Without it, goals are added, edited and shown as before, and only those choices wait |
| `0016_ai_foundation.sql` | Where AI keeps your settings (on or off, the order services are tried, paid services, the daily limit, the coach's tone, sharing shop names), your AI keys, locked so the browser can never read them, and today's use. Without it, AI settings and the AI's words say they need a one-time update, and every screen uses the app's own words |
| `0017_coach_memory.sql` | Where the Coach keeps the AI's checked words (never a digit or a currency sign: the database refuses them), the cards you dismissed, and your check-in answers. Without it, AI words still show but are asked for afresh, ✕ on a card is hidden, and the check-in's questions say they need the update |
| `0018_category_suggestions.sql` | Where Review keeps the category the AI suggested for a row, until you approve or change it. Without it, Review works as before and says suggestions need the update |
| `0019_ai_apps_cannot_write.sql` | Stops an AI app you connect (Claude, ChatGPT) from changing anything itself: the database refuses every write from an AI app's sign-in, and every function that writes says "AI apps cannot do this" to one. Your own sign-in is unaffected. It stops with "Paste 0018 first" if `0018` is not in |
| `0020_ai_apps.sql` | What an AI app may read, and its one way to add something to Review, always waiting for you; the switch in Settings → AI apps, its daily limits, and when each app last asked. Without it, Settings → AI apps says it needs the update. It stops with "Paste 0019 first" if `0019` is not in |
| `0021_category_holds.sql` | Lets you remove a category that only a rejected guess or a charge you removed still names: before it, Setup said it "still has charges". It stops with "Paste 0018 first" if `0018` is not in |
| `0022_removed_charge_waits.sql` | A charge you removed from All transactions waits in Review when its statement comes in again, instead of a learned shop filing it straight back. It stops with "Paste 0021 first" if `0021` is not in |
| `0023_typed_entry_once.sql` | Pressing Add again after an answer that never arrived adds a typed purchase once, not twice |
| `0024_learned_shops_own_category.sql` | A learned shop names only your own categories, and is written only by approving or moving a charge |
| `0025_ingested_text_format_characters.sql` | Stored text refuses hidden format characters, as the app already does |
| `0026_goal_check_on_link.sql` | A goal whose fund moved off the Savings list can still be edited; it is checked only when it is linked |
| `0027_receipt_photo_twice_waits.sql` | A second photo of a receipt already brought in waits in Review, even for a learned shop |
| `0028_ai_words_no_invisible_characters.sql` | The AI's kept words refuse characters that draw as nothing |
| `0029_lookalike_charge_waits.sql` | A charge that looks like one already in the ledger (same card, amount and shop, within three days) waits in Review, so a PDF and a CSV of the same statement do not count it twice. Each of `0023` to `0029` stops with "Paste 00NN first" if the one before is not in |
| `0030_ai_app_gate_live_session.sql` | Stops an AI app the moment you press Disconnect: before it, a copy of the app's sign-in could still reach your budget for up to an hour. Changes nothing you see. It stops with "Paste 0020 first" if `0020` is not in. Numbered from 0030 so it never collides with other updates in preparation |
| `0031_ai_app_hash_own_kind.sql` | Keeps what an AI app adds from ever hiding a real charge: before it, an AI app could add an entry that matched next month's statement line exactly, and the real charge was skipped on import as already waiting. Now both wait in Review. It stops with "Paste 0030 first" if `0030` is not in |
| `0032_ai_rows_teach_no_rule.sql` | Approving or moving something an AI app added no longer teaches the app a shop: before it, one approval could make every later statement charge from that shop file itself into the AI's category without Review. It stops with "Paste 0031 first" if `0031` is not in |
| `0033_ai_search_masked.sql` | An AI app's search sees shop names as it is shown them, with long numbers (card, phone and reference numbers) masked: before it, counting what matched could read a masked number back one digit at a time. It stops with "Paste 0032 first" if `0032` is not in |
| `0034_ai_words_visible.sql` | What an AI app adds may not hold characters that draw as nothing (zero-width spaces and the like): before it, two entries could look the same in Review while being different. It stops with "Paste 0033 first" if `0033` is not in |
| `0035_ai_app_updates_in.sql` | Lets One-time updates see exactly which AI-app safety updates are in. It only reads, needs nothing but `0020`, and is pasted **before** `0030` (One-time updates lists it there) |
| `0036_ai_search_as_shown.sql` | An AI app's searches match shop names only as it is shown them. It stops with "Paste 0035 first" unless `0030` to `0035` are all in |
| `0037_ai_rows_before_the_fixes.sql` | Tidies anything an AI app added before these safety updates. It stops with "Paste 0036 first" if `0036` is not in |
| `0038_intuit_prefix_merchants.sql` | Tidies shop names stored with Intuit's `IN*` prefix, so `IN*ACME` and `ACME` are one shop. **It permanently deletes** a learned shop where two would end up with one name (the one made or used most recently stays), so take a backup first (HANDOFF §3, steps 13 and 15). It stops with "Paste 0029 first" or "Paste 0037 first". Written as `0030` and renumbered at the merge of two lines of updates (2026-10-02) |
| `0039_ai_apps_suggest_changes.sql` | Lets an AI app you connect suggest changes (a budget, a weekly budget, a bill, a goal, a category, a charge's category, a shop always filed somewhere), each waiting in Review under Suggested changes until you apply it; the switch Settings → AI apps → Let AI apps suggest changes; 60 suggestion requests a day, at most 100 waiting, 14 days each (ADR 0013). Deletes nothing. Pasted last, after `0038`: it stops with "Paste 0037 first" if `0037` is not in, and "0039 is already in; nothing to do" if pasted again. Paste the `mcp` server again after it |

**`0015` to `0039` can be pasted after `main-tnlcto` is merged into
`main`.** Nothing the app needs to open depends on them: each new part
says in one line that it needs a one-time update until its file is in
(HANDOFF §3). In the app, **Help → One-time updates** shows which are
missing and has a **Copy** button for each, so GitHub is not needed.
`0001` to `0014` are already in, and the paragraph below is kept as the
record of what each of them does when missing: the app reads what `0005`
to `0014` add. Without `0008`, the Month says "Budgets
need a database update that has not been applied yet" and shows no month.
Without `0009`, Setup says the same of monthly amounts and shows none, and
your lists still work; the Month says it too, and shows no month. Without
`0010`, the Month says starting balances need the update, and shows no
month. Without `0011`, Setup says pay schedules need the update and shows
no How often or First payday, and your lists still work; Paycheck says it too,
and shows no pay period. Without `0012`, Review cannot list the lines an
import could not read and shows a code in brackets instead. Without
`0013`, Savings says savings funds need the update. Without `0014`, Debts
says debts need the update. A file can rely on the ones before it (`0008` and `0009`
point at a key `0005` adds, for example), so keep to the order.

After `0012` runs, Review lists every unreadable line you have not dismissed,
however old, where before it showed only the last six weeks. So lines from
imports more than six weeks old, which Review had stopped showing, show
again. They stay until you dismiss them: tap Dismiss on each once you have
dealt with it.

After `0005` runs, and until the app update that asks which list a new
category goes on, making a *new* category from Review, Add or Settings fails
with a code in brackets. Picking an existing category keeps working.

The app expects all of them. A missing one shows up as an import or approval
that fails with a code in brackets.

**Comments reworded on 2026-09-24.** The comments in `0005`, `0007` to
`0011`, `0013` and `0014` named the workbook's vendor, and on 2026-09-24
they were reworded to say "the workbook", because the owner asked for
that name to go from everything pushed ("remove any mention of … from
any and all github pushes including previous ones"). Only the text after
`--` changed, never the SQL, so the database a file builds is the same
either way. **If you have not pasted a file yet, paste it as the steps
above say**; the new wording changes nothing. **If you pasted it before
2026-09-24, do not paste it again**: your database already matches, and
keeps none of the old wording, which is harmless in any case. None of
the reworded comments was inside a function, and Postgres throws away
every other comment when it runs a file. Applying every migration to an
empty database before and after the change, and dumping the schema each
time, gives byte-identical files. The old wording may still be in the SQL
Editor's history of what you pasted.

## AI: the helper and a free key

Every AI feature (the Coach's words, the check-in, Forecast and Reports
sentences, suggestions in Review, "just type it", receipts and Ask) goes
through one Edge Function, `ai`, called "the AI helper" in the app. Chosen
in `docs/adr/0004-ai-providers-and-keys.md`; the rules that keep numbers
out of the AI's words are `docs/adr/0005-grounded-ai-text.md`. Everything
works without it, in the app's own words. About 15 minutes, once, easiest
on a computer, after `0015` to `0020` above.

1. **Paste the helper.** Supabase → **Edge Functions** → **Deploy a new
   function** → **Via Editor**. Name it exactly `ai`. In the app, Help →
   One-time updates → **Copy** beside "The AI helper" (the file is
   `supabase/functions/ai/index.ts`), paste it over everything in the
   editor, and press **Deploy**. Keep **Enforce JWT verification** on
   while Supabase signs with its old key, and off once it signs with the
   new one (the signing key, under AI apps below); One-time updates says
   which. Since 2026-09-30 the helper checks every caller itself.
2. **One new secret, `OWNER_USER_ID`.** Supabase → **Authentication →
   Users** → your row → copy **User UID**; then **Edge Functions →
   Secrets** (or **Project Settings → Edge Functions → Secrets**) → **Add
   new secret**, name `OWNER_USER_ID`, value that UID → **Save**. The
   helper and read-receipt then refuse every other account; a value that
   is not a user id makes both serve no one, so a typo fails closed. It
   reuses `GEMINI_API_KEY` and `EXTRA_ORIGINS` if they are set for receipt
   photos (below). `AI_KEYS_ROOT` is optional: set to a long random value,
   it lets keys pasted in the app survive a change of Supabase's own keys;
   without it, such a change asks you to paste the key again.
3. **Turn on free AI.** In the app: More → **AI settings** → **Get a free
   key** (Google AI Studio, **Create API key**), paste it, and press
   **Save & test**: "Works · key ending …abcd". A key pasted here is
   encrypted by the helper and stored where the browser cannot read it;
   the app only ever shows its last four characters.

**More services, optional.** AI settings → **More AI services** takes a key
for Groq and OpenRouter (free) and for OpenAI and Anthropic (paid). Paid
services are never asked until **Use paid services** is switched on. The
order they are tried in, a daily limit (40 by default, 10 to 150), the
coach's tone, and whether shop names are shared are set there too. Free
services may keep and read what they are sent (ADR 0002, ADR 0004); for
the Coach and Review the AI is never sent an amount, a balance or a date
(Just type it and receipt photos send what you give them), **Use AI** off
sends nothing at all, and **What the AI sees** lists exactly what each
sends.

**Check it:** One-time updates says "All done", and AI settings says "AI is
on, using free Google Gemini" (or "your receipts key").

## Receipt photos: Gemini (optional)

The AI helper above reads receipts itself, and falls back to this older
function. It is needed only if the helper is not installed.

Needed only for the Photo option on the Add screen. Everything else works
without it. Chosen in docs/adr/0002-gemini-free-tier-for-receipts.md.

1. **Get a key.** Go to https://aistudio.google.com/apikey, sign in with a
   Google account, and choose **Create API key**. Copy it.
2. **Add the function.** In Supabase: **Edge Functions → Deploy a new function
   → Via Editor**. Name it exactly `read-receipt`, replace the sample code with
   the whole of `supabase/functions/read-receipt/index.ts`, and deploy. Set
   **Enforce JWT verification** as for the AI helper. Turning off **Allow
   new users to sign up** (Authentication → Sign In / Providers) is what
   stops strangers: any account on your project can call the helper and
   this function. Setting the `OWNER_USER_ID` secret to your own user id
   (step 2 of the AI helper, above) makes both refuse every other account
   too. The function checks every caller itself, so the JWT switch can
   come off when the signing key changes.
3. **Add the key.** **Edge Functions → Secrets → Add new secret**: name
   `GEMINI_API_KEY`, value the key from step 1.

The function uses `gemini-3.5-flash-lite`, Google's fast, low-cost model
for reading documents, on the free tier. If a photo ever reports that the
model has been retired, add a second secret, `GEMINI_MODEL`, set to a current
model name from Google's list (for example `gemini-3.1-flash-lite`). No
redeploy is needed for secrets.

**If you keep `read-receipt`, paste it again after every update of the
AI helper** (read-receipt has no version One-time updates can always
read): its newest copy reads the **Use AI** switch, so a photo never goes
to Gemini while AI is off, and serves only `OWNER_USER_ID`. Or delete it:
**Edge Functions → read-receipt → ⋯ → Delete**; the app reads receipts
through the helper.

If you pasted `read-receipt` before 2026-09-24, paste its new version the
same way (step 2): the old one used `gemini-2.5-flash`, which Google has
listed for shutdown around 16–20 October 2026. If you set `GEMINI_MODEL` to
`gemini-2.5-flash` yourself, delete that secret too.

The key is a password to your Google account's quota. It goes only in that
Supabase secret — never in the app, never in this repository.

## AI apps: Claude and ChatGPT (MCP)

Lets your own Claude or ChatGPT read your figures, add items to Review,
and suggest changes that wait in Review until you apply them, over MCP.
Chosen in `docs/adr/0012-mcp-server.md` and, for suggestions,
`docs/adr/0013-ai-apps-suggest-changes.md`; the design and every check is
`docs/design/mcp/PLAN.md` and `docs/design/mcp/PROPOSALS.md`. The steps, in order, are
HANDOFF §3 Part F; One-time updates checks each one. What they leave set:

| Where in Supabase | Setting |
|---|---|
| **Authentication → URL Configuration** | Site URL `https://aaron-budget-app.pages.dev`: Supabase sends an AI app's sign-in to Site URL + Authorization Path |
| **Authentication → OAuth Server** | Enabled; Authorization Path `/oauth/consent`; dynamic client registration on |
| **Authentication → Sign In / Providers** | Allow new users to sign up off; Email: Secure email change on |
| **Project Settings → JWT Keys** | The current key is ECC (P-256); the old key not revoked |
| **Edge Functions → `mcp`** | The AI apps server, pasted from One-time updates' **Copy**; **Enforce JWT verification off** |
| **Edge Functions → `ai`, `read-receipt`** | **Enforce JWT verification off** once the key is ECC, and only on their versions of 2026-09-30 or later, which check every caller themselves (`read-receipt`'s older copy relies on the switch alone: paste it again or delete it first) |

`mcp` needs no secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_PUBLISHABLE_KEYS` are provided by Supabase (the publishable key
is used first, so retiring the legacy keys signs no AI app out), and `EXTRA_ORIGINS`, if set for the other
functions, is read the same way. It never holds a service key or an AI
key. Check it at
`https://bnodrfghxbavlopxkgju.supabase.co/functions/v1/mcp/health`:
`{"ok":true,"version":"…","tools":13}`. After `0039`, paste the server
again from One-time updates' **Copy**: its version `2026-10-05.1` brought
the three tools that suggest changes, and the prompt `review_my_budget`;
`2026-10-05.2` also refuses every character that draws as nothing (tag
characters and variation selectors too) and leaves them out of the names
it hands out (testing mcp-01).

**Enforce JWT verification on `mcp` must stay off.** With it on,
Supabase answers Claude and ChatGPT before the server can, without the
pointer to the sign-in, and connecting silently fails. Supabase has been
seen to turn it back on after an update, so check it after every paste.

**Connecting** is Help → **Connect Claude** or **Connect ChatGPT**, each
starting from Settings → AI apps → **Connect a new AI app**, which lets
a new app connect for 15 minutes. The first-connection checks are HANDOFF
§4, 15 to 23.

**Now and then:** Claude registers a new app in **Authentication → OAuth
Apps** each time it connects afresh, and anyone can register one there
(none gets past the connect page without your 15 minutes). Delete any
that Settings → AI apps → **Connected apps** does not list.

**To switch it all off:** Settings → AI apps → turn off **Let AI apps
connect**, which stops every AI app at once; then **Authentication →
OAuth Server** → off, so none can sign in again.

## iPhone: install it

Open the site in **Safari**, tap **Share → Add to Home Screen**. It then opens
full-screen from its own icon, with no browser bar.

## Supabase: making the one user account

There is no sign-up screen, deliberately. This app holds one person's
financial history and lives at a public URL. **Once Allow new users to
sign up is off** (Authentication → Sign In / Providers → Save), the only
way an account exists is if someone makes it in the dashboard. While it
is on, anyone can make one with the public key in the page, whatever the
app shows; One-time updates lists **Sign-ups off** first until it is.

**Before you make the account:** Authentication → Sign In / Providers →
**Email** (older dashboards: Authentication → Providers → Email, or
Authentication → Policies) → **Minimum password length: 16** → **Save**.
Use a password your password manager generates, used nowhere else.
Supabase checks the new minimum only when a password is next set, so if
the account already exists, set a new one now (below).

**Authentication → Users → Add user → Create new user**, with **Auto Confirm
User** ticked. Without that tick the user is created but cannot sign in until
a confirmation email — the same rate-limited mailer — is delivered and opened.

**To change the password:** on the app's sign-in screen, type your email
and choose **Forgot your password?**. Open the emailed link on the same
device, in the same browser, and choose a new password. Only after the
new password works, use Authentication → Users → ⋯ → **Sign out user** if
you want other devices signed out. Links sent from the Supabase dashboard
(Reset password, Send magic link) do not work with this app.

## Supabase: the emailed-link path is rate limited

The built-in mail sender allows a few messages an hour **across the whole
project**, not per address. Two sign-in attempts while testing can exhaust it,
and the error reads `email rate limit exceeded` — which looks like a bug in
the app and is not one. This is why password is the default sign-in method.

Lifting it means configuring a real SMTP sender under **Authentication →
Emails → SMTP Settings**. Not needed while one person uses this.

Turn off **Allow new users to sign up** (Authentication → Sign In /
Providers) **before** setting up your own mail sender or turning off
**Confirm email**. Either change lets a stranger who signs up get a
working account.

## Supabase: where a sign-in link returns to

**Authentication → URL Configuration**

| Field | Value |
|---|---|
| Site URL | `https://aaron-budget-app.pages.dev` (was the Netlify address) |
| Redirect URLs | `https://aaron-budget-app.pages.dev/**` |
| | `http://localhost:5173/**` |

The app asks Supabase to return the user to whatever origin they signed in
from (`emailRedirectTo: window.location.origin`, in `apps/web/src/auth.tsx`).
**Supabase ignores that unless the origin is on this allowlist**, and falls
back to Site URL — whose factory default is `http://localhost:3000`, where
nothing runs. The symptom is a link that authenticates successfully and then
lands on a dead page.

The trailing `/**` matters: without it only the exact root path is allowed.

Nothing else belongs in Redirect URLs. Remove an entry before giving up
the site it names: an address left listed after its site is gone could be
registered by anyone, and Supabase would send your sign-in links there.

The localhost entry is what lets the same sign-in work against a dev server.
Port 5173 is Vite's default and is pinned in `apps/web/vite.config.ts`.

## Supabase: the two public values

**Project Settings → API.** The project URL and the publishable key are in
`netlify.toml` under `[build.environment]`, deliberately — see the comment
there. They are compiled into the bundle at build time, so changing them
means a rebuild, not just a redeploy of the existing build.

`service_role` belongs to none of this. It bypasses every row-level security
policy in `supabase/migrations` and must never reach the browser.

## Cloudflare Pages — where the site is hosted

CLAUDE.md names Cloudflare Pages as the host; Netlify was a stopgap. Cloudflare
builds the site from GitHub on every push, like Netlify did.

**Workers & Pages → Create → Pages → Connect to Git**, pick
`aaronjoseph94/budget-app`, then:

| Setting | Value |
|---|---|
| Project name | `aaron-budget-app` (gives `https://aaron-budget-app.pages.dev`) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `pnpm --filter @budget/app-client build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(leave empty)* |

**Environment variables** (same screen, before the first deploy):

| Name | Value |
|---|---|
| `NODE_VERSION` | `24` (or rely on `.nvmrc`) |
| `PNPM_VERSION` | `10.34.6`, as `packageManager` in package.json |
| `VITE_SUPABASE_URL` | `https://bnodrfghxbavlopxkgju.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the publishable key — the same value as in `netlify.toml` |

These two `VITE_` values are public by design and are compiled into the site
at build time: changing them later needs a new deploy (**Deployments → Retry
deployment**), not just a save.

`VITE_SUPABASE_ANON_KEY` is the publishable key (`sb_publishable_…`), never
a secret or `service_role` key; the build now stops if it is one. If a
secret or `service_role` key was ever deployed, rotate it at once
(Supabase → **Project Settings → API Keys** → the key's ⋯ → **Roll** /
**Revoke**), because each earlier Cloudflare deployment stays reachable at
its own `<hash>.aaron-budget-app.pages.dev` address.

Security headers come from `apps/web/public/_headers`; nothing to set.

**After it deploys:**

1. In Supabase, **Authentication → URL Configuration**: set Site URL to
   `https://aaron-budget-app.pages.dev` and add
   `https://aaron-budget-app.pages.dev/**` to Redirect URLs.
2. If Cloudflare gave the project a different address (the name was taken),
   add it to the receipt function: **Edge Functions → Secrets →**
   `EXTRA_ORIGINS` = `https://<the-address>.pages.dev`. Same for a custom domain.
3. Sign in once on the pages.dev site to check it works.
4. Supabase → **Authentication → URL Configuration**: delete
   `https://aaron-budget-app.netlify.app/**` from Redirect URLs (the bin
   icon on its row) → **Save**, and check Site URL is
   `https://aaron-budget-app.pages.dev`. Sign in once more on the pages.dev
   site to check it still works.
5. Only then stop Netlify, keeping the site: Netlify → your site → **Site
   configuration → Build & deploy → Continuous deployment → Stop builds**.
   **Do not choose Delete this site**: deleting frees the
   `aaron-budget-app.netlify.app` name for anyone to register, and a
   still-listed redirect would send your sign-in links to them. (The next
   agent then takes the netlify.app origin out of the functions and
   deletes `netlify.toml`, N151.)

**Publishing, once `main` is protected.** GitHub → the repository →
**Settings → Branches** → protect `main` with the `gates` check
(HANDOFF §3). From then on: push to `main-tnlcto` first, wait for the
green **gates** run, then push that same commit to `main`. Cloudflare
Pages builds `main`, so only a commit that passed every gate reaches the
site.

## Netlify (being replaced by Cloudflare)

Site `aaron-budget-app`, built from branch `main-tnlcto` per `netlify.toml`.

Its environment-variable API silently accepted writes without storing them
(2026-09-22), which is why the values are in `netlify.toml` instead. If that
is ever fixed, moving them there is strictly better: the key would leave git
history, and rotating it would stop needing a commit.

## If a sign-in link goes somewhere unexpected

Everything after the `#` in that URL is a live credential — an access token
and a refresh token. Revoke it at **Authentication → Users → Sign out user**
rather than waiting for it to expire; the refresh token does not expire on
its own.
