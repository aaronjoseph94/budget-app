# ADR 0003 — Keep the hand-rolled hash navigation, and give it period addresses

**Date:** 2026-09-22 · **Decided by:** engineering, not put to the account
holder (nothing they would see differs) · **Status:** accepted
**Amends:** ADR 0001's Routing and Server state rows, which named TanStack
Router and TanStack Query

## Context

ADR 0001 and CLAUDE.md's stack line name TanStack Router for routing and
TanStack Query for server state. The app was built without either, and
`apps/web/package.json` depends on neither:

- **Navigation** is `apps/web/src/nav.ts`, about thirty lines. The screen is
  kept in the URL's hash (`#/week`, `#/review`, …) and read with
  `useSyncExternalStore` on `hashchange`, so a refresh, the back gesture and
  reopening from the iPhone home screen land where the user was. It knows five
  fixed destinations and nothing else.
- **Data** is `apps/web/src/app-data.tsx`: one context loads the account,
  categories, goal and review-queue count, and `refresh()` reloads them after
  any write and bumps a `version` that each screen's own load depends on. Each
  screen loads its own rows. Nothing derived is held; every total is computed
  by `packages/core` when the screen renders.

The workbook views plan (`docs/workbook-views-plan.md` §6.1) needs more of navigation than five
names. A month or year has to be part of the address — `#/month/2026-09`,
`#/year/2026-01` (the start month, formula decision F14) — so that a refresh
or the back gesture returns to the same month. Today the Week screen keeps its
week in component state, and a refresh returns to the current week.

## Options

| Option | What it costs |
|---|---|
| **A — extend `nav.ts`** with a period segment per screen | A small hand-written parser for `YYYY-MM` and a week's date, with tests |
| **B — adopt TanStack Router** | A new dependency, route definitions for every screen, and moving five screens onto it |
| **C — adopt TanStack Router and Query** | B, plus moving every screen's loading onto query keys and deciding what the cache may hold |

## Decision

**A.** `nav.ts` gains addresses of the form `#/<screen>` and
`#/<screen>/<period>`. An address it cannot read — an unknown screen, a
month that is not `YYYY-MM`, a month 13 — falls back to the default screen and
period rather than guessing. Reading a period out of an address is not
arithmetic, so it may live in the app; stepping a month or week back and
forth stays with `shiftMonth` and `shiftWeek` in `packages/core`.

## Why

- **The need is small.** Six or seven destinations, each with at most one
  period. What a router library adds — nested layouts, typed search params,
  loaders, code-split route trees — has nothing to attach to here.
- **Hash addresses suit the hosting.** Cloudflare Pages serves static files.
  A hash never reaches the server, so a deep link to `#/month/2026-09` needs no
  rewrite rule there; `apps/web/public/_headers` stays its only hosting file.
  (The Netlify preview's `netlify.toml` already sends every path to
  `index.html`, so nothing changes there either.)
- **The data layer would fight CLAUDE.md.** TanStack Query's reason to exist
  is a cache of server responses, and ADR 0001 chose it for cache persistence
  and offline reads. CLAUDE.md forbids persisting or caching a derived money
  value, and a month read from an offline cache is the stale balance it warns
  about. The app does not work offline and has no service worker; the reason
  Query was chosen does not apply yet.
- **Each dependency is asked for.** CLAUDE.md requires every npm dependency to
  be justified in its own commit, and the bundle is already 606 KB
  (NOTICED-NOT-TOUCHING N7). Two libraries to replace a thirty-line file do
  not pass that test.

## Consequences

**Gained**

- No new dependency, and no screen has to move.
- The Month, Year and Week screens get addresses a refresh keeps.

**Lost**

- No typed routes. A period segment is parsed by hand, so its parser needs its
  own tests: malformed, out-of-range and missing periods.
- No shared request cache. Two screens that need the same rows load them
  twice. At one user's volume that is milliseconds.

**Revisit** if the app needs offline reads (a service worker, and then a
decision about what may be cached), nested screens with their own
sub-navigation, or more than one parameter per address.

CLAUDE.md's stack line still names TanStack Router, TanStack Query and
vite-plugin-pwa. Changing CLAUDE.md is the owner's to approve, so the mismatch
is recorded in NOTICED-NOT-TOUCHING (N8) rather than edited here.
