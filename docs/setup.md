# One-time setup

Settings that live in the Supabase and Netlify dashboards rather than in this
repository. They are recorded here because a setting nobody wrote down is
found again by hitting the same wall twice.

## Supabase: database migrations, in order

Run each file in `supabase/migrations/` once, in filename order, in
**SQL Editor → New query → paste → Run**. Each ends in "Success. No rows
returned." Running one twice is refused rather than applied twice.

| File | What it adds |
|---|---|
| `0001_initial_schema.sql` | Tables, row-level security, private receipts bucket |
| `0002_unreadable_lines.sql` | A record of statement lines that could not be read |
| `0003_save_import_atomically.sql` | Saving an import as one transaction |
| `0004_one_path_into_the_ledger.sql` | Approval, rules that learn, budgets, the goal, PDF imports |
| `0005_category_kinds.sql` | Which of Workbook's lists each category is on. Your existing categories go under Variable expenses until the Setup screen lets you move them |
| `0006_recategorise.sql` | Moving a charge that is already saved to a different category |
| `0007_statement_periods.sql` | Remembering which dates each imported statement covered |

After `0005` runs, and until the app update that asks which list a new
category goes on, making a *new* category from Review, Add or Settings fails
with a code in brackets. Picking an existing category keeps working.

The app expects all of them. A missing one shows up as an import or approval
that fails with a code in brackets.

## Receipt photos: Gemini (optional)

Needed only for the Photo option on the Add screen. Everything else works
without it. Chosen in docs/adr/0002-gemini-free-tier-for-receipts.md.

1. **Get a key.** Go to https://aistudio.google.com/apikey, sign in with a
   Google account, and choose **Create API key**. Copy it.
2. **Add the function.** In Supabase: **Edge Functions → Deploy a new function
   → Via Editor**. Name it exactly `read-receipt`, replace the sample code with
   the whole of `supabase/functions/read-receipt/index.ts`, and deploy. Leave
   **Enforce JWT verification** on — it is what stops strangers using your key.
3. **Add the key.** **Edge Functions → Secrets → Add new secret**: name
   `GEMINI_API_KEY`, value the key from step 1.

If a photo ever reports that the model has been retired, add a second secret,
`GEMINI_MODEL`, set to a current model name from Google's list (for example
`gemini-2.5-flash`). No redeploy is needed for secrets.

The key is a password to your Google account's quota. It goes only in that
Supabase secret — never in the app, never in this repository.

## iPhone: install it

Open the site in **Safari**, tap **Share → Add to Home Screen**. It then opens
full-screen from its own icon, with no browser bar.

## Supabase: making the one user account

There is no sign-up screen, deliberately. This app holds one person's
financial history and lives at a public URL, so the only way an account
exists is if someone makes it in the dashboard.

**Authentication → Users → Add user → Create new user**, with **Auto Confirm
User** ticked. Without that tick the user is created but cannot sign in until
a confirmation email — the same rate-limited mailer — is delivered and opened.

To give an existing user a password instead: **Authentication → Users**, the
`⋯` menu on the row, **Reset password**.

## Supabase: the emailed-link path is rate limited

The built-in mail sender allows a few messages an hour **across the whole
project**, not per address. Two sign-in attempts while testing can exhaust it,
and the error reads `email rate limit exceeded` — which looks like a bug in
the app and is not one. This is why password is the default sign-in method.

Lifting it means configuring a real SMTP sender under **Authentication →
Emails → SMTP Settings**. Not needed while one person uses this.

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
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `10` |
| `VITE_SUPABASE_URL` | `https://bnodrfghxbavlopxkgju.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the publishable key — the same value as in `netlify.toml` |

These two `VITE_` values are public by design and are compiled into the site
at build time: changing them later needs a new deploy (**Deployments → Retry
deployment**), not just a save.

Security headers come from `apps/web/public/_headers`; nothing to set.

**After it deploys:**

1. In Supabase, **Authentication → URL Configuration**: set Site URL to
   `https://aaron-budget-app.pages.dev` and add
   `https://aaron-budget-app.pages.dev/**` to Redirect URLs.
2. If Cloudflare gave the project a different address (the name was taken),
   add it to the receipt function: **Edge Functions → Secrets →**
   `EXTRA_ORIGINS` = `https://<the-address>.pages.dev`. Same for a custom domain.
3. Once the Cloudflare site works, remove the Netlify site so there are not
   two live copies: Netlify → Site configuration → **Delete this site**.

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
