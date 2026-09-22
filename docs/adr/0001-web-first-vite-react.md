# ADR 0001 — Web-first with Vite + React, replacing Expo

**Date:** 2026-09-21
**Status:** Accepted
**Supersedes:** the Expo decision recorded in CLAUDE.md on 2026-09-21
**Amended by:** ADR 0003 (2026-09-22) — the app never adopted TanStack Router
or TanStack Query; navigation stays the hand-rolled hash in `nav.ts`

## Context

The original stack was Expo + Expo Router targeting iOS and web from one
codebase. That was chosen when a native iOS app seemed desirable.

Three things changed since:

1. Requirements accumulated that land squarely in react-native-web's weakest
   area: a Sankey diagram, a dense 7x52 contribution grid, tabular budget
   screens, and client-side PDF and Excel generation. `docs/ROADMAP.md` already
   carried this as a named risk.
2. The user stated a phone **web** app is sufficient, with two hard
   requirements: take a photo, and chat with the AI.
3. Hosting is Cloudflare Pages on the user's own domain, which serves static
   output ideally and gains nothing from a native build pipeline.

## Decision

Build `app-client` as a web-first installable PWA:

| Concern | Choice |
|---|---|
| Build | **Vite** |
| UI | **React 19 + TypeScript** |
| Routing | **TanStack Router** — typed routes, typed search params |
| Server state | **TanStack Query** — cache persistence gives offline reads and a queued-write path |
| Styling | **Tailwind CSS v4** |
| PWA | **vite-plugin-pwa** (Workbox) — home-screen install, offline shell |
| Charts | `chart-specs` SVG injected directly into the DOM |
| Hosting | **Cloudflare Pages**, static output |

Native remains reachable via Capacitor, wrapping this same build. Not now.

## Why Vite rather than Next.js

Next.js earns its weight through server rendering, routing-level data loading,
and API routes. This application has one user, holds no public pages, gains
nothing from SEO or first-paint server rendering, and already has a server side
in Supabase Edge Functions. Its server would be unused ceremony.

Static output also makes Cloudflare Pages deployment exact rather than adapted.

## Why React rather than Svelte or Solid

Both are faster to render and pleasanter to write. React wins here on ecosystem
for the three libraries this project cannot avoid — `d3-sankey`, SheetJS, and
`pdf-lib` — and on the density of reference material for the Supabase client.
At one user's data volume, framework render performance is not a constraint;
library availability is.

## Consequences

**Gained**

- The Sankey, the contribution grid, and every table become ordinary DOM and
  SVG instead of `FlatList` and `Platform.select` branches.
- PDF and Excel generation run in the browser with well-trodden libraries.
- No Apple Developer account ($99/yr), no EAS build queue, no App Store review.
  A fix ships the moment it is pushed.
- Deployment is a static upload to Cloudflare Pages.

**Lost**

- No App Store listing. Recoverable later via Capacitor with no rewrite.
- Marginally less native feel than React Native. Installed iOS PWAs are close
  enough that the user explicitly accepted this.

**Verified as sufficient for the two hard requirements**

- **Camera** — `<input type="file" accept="image/*" capture="environment">`
  opens the camera directly in mobile Safari and inside an installed PWA.
  `getUserMedia` is available too if live preview is wanted later.
- **Chat** — a streamed response from a Supabase Edge Function. No constraint.

**Cost of the change: one module.** `app-client` is the only module affected.
`money-primitives`, `golden-verification`, `calc-engine`, `chart-specs`,
`schema-contracts`, `persistence-schema`, `statement-parsers`, `llm-providers`,
`ingest-pipeline`, `savings-coach` and `report-export` are untouched — and the
25 existing tests did not change, because none of them ever knew what the UI
was. This is the boundary design in CAPABILITY-MAP.md doing the job it was
drawn for.

`chart-specs` gets simpler: it was already specified to have no react-native
dependency so its SVG could serve screen, PDF and Excel alike. That constraint
now costs nothing at all.
