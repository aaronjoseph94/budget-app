# One-time setup

Settings that live in the Supabase and Netlify dashboards rather than in this
repository. They are recorded here because a setting nobody wrote down is
found again by hitting the same wall twice.

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
