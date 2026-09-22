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
| Site URL | `https://aaron-budget-app.netlify.app` |
| Redirect URLs | `https://aaron-budget-app.netlify.app/**` |
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

## Netlify

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
