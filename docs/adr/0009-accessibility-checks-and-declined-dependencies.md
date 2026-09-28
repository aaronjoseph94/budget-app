# ADR 0009 — axe in the screen tests; web-vitals and a slimmer Supabase client declined

**Date:** 2026-09-28 · **Decided by:** the engineer under the owner's
2026-09-24 instruction to proceed without questions · **Status:** accepted
**Plan:** `docs/ai-first-plan.md` slice A28 · **Settles:** N61.1, N61.2,
N60.2 (`NOTICED-NOT-TOUCHING.md`)

## Context

The frontend audit (2026-09-24) left three things undone because each
needed a new dependency, and CLAUDE.md puts every new npm dependency on
the "Ask first" list:

1. **N61.1, axe in the screen tests.** The audit asked for automatic
   accessibility checks as regression tests. Its fixes were pinned by
   hand-written role and structure tests instead.
2. **N61.2, field monitoring.** `web-vitals` would report the owner's real
   loading and responsiveness figures from the phone.
3. **N60.2, a slimmer Supabase client.** Swapping `@supabase/supabase-js`
   for `@supabase/postgrest-js` and `@supabase/auth-js` would drop about
   82 KB of realtime and storage code the app never calls.

On 2026-09-24 the owner wrote "do the below without asking me questions",
and later "keep going and push to main when done". That instruction does
not name dependencies, so each is decided here on its merits, and the rule
behind "Ask first" (that nothing ships to the phone that nobody chose) is
kept.

## Decisions

**N61.1: option A, add axe-core.** `axe-core` 4.13.0, pinned, as a
devDependency of `@budget/app-client` only. It has no dependencies of its
own. It is imported only by `apps/web/test/axe.ts`, and a
dependency-cruiser rule allows it from `apps/web/test/` alone, so the
purity gate fails if anything in `apps/web/src` reaches it: it can never
be in the site. Every screen test file calls `expectNoAxeViolations()`
at least once, on the whole document so the sheets drawn beside a screen
are checked too.

- **What it checks.** axe's WCAG 2.0, 2.1 and 2.2 A and AA rules. Its
  best-practice rules judge a whole page (one main landmark, one top
  heading), and a test draws one screen without the app's shell; heading
  order already has its own test.
- **Light and dark.** No screen test draws the dark theme: the theme is a
  CSS media query, and jsdom neither applies media queries nor computes
  colours, so axe's colour-contrast rule could only answer "can't tell"
  and is switched off. `contrast.test.ts` already checks every colour
  token in `index.css`, light and dark, at 4.5:1 or better, and A28's
  click-through looked at every screen in both themes in a real browser.
- **Rejected:** `jest-axe` or `vitest-axe`, which wrap the same engine in a
  second dependency for what is a ten-line helper here; and more
  hand-written role tests alone, which find only what someone thought to
  write.

**N61.2: option B, no web-vitals.** The app has one user. The synthetic
first-load budget (`scripts/check-bundle.mjs`, 200 KB gzipped, run by every
full gate) already stops the page growing, and a field report would need
somewhere to send its figures, which is a new endpoint and a new place
for data to go, for one phone's numbers. If the owner ever says the app
feels slow, the Safari developer tools on a Mac read the same figures
from the phone directly.

**N60.2: option B, keep `@supabase/supabase-js`.** The unused code is in
chunks the first load does not need, and the first load is 184.34 KB of
the 200 KB budget with the gate holding it there. Replacing the client
touches sign-in, every read and every write, and trades one maintained
package for two lower-level ones whose sign-in handling the app would then
have to wire itself, for one user who is inside the budget today. If the
budget is ever reached, this is the first saving to take, and N60 says
how.

## Consequences

- One dev dependency is added; nothing new reaches the phone.
- A screen change that drops a label, names a button with nothing, or
  breaks a list's structure now fails `vitest run`, in every gate run.
- The first axe run found one real problem: the Income, Spent and Saved
  list on Reports' Overview wrapped its terms twice, which a screen reader
  reads as a broken list. It was fixed in the commit that added the check
  to Reports' tests.
- Field figures are not collected, and the Supabase client stays whole.
  Both are recorded as the engineer's decision, and either can be
  reversed with one dependency commit.
