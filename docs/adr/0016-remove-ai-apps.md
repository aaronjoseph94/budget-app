# ADR 0016 — The "connect an AI app" feature is removed; its database objects stay

**Date:** 2026-11-10 · **Decided by:** the engineer, on the owner's request
of 2026-11-10 that the feature be gone completely · **Status:** accepted
**Supersedes:** ADR 0012 and ADR 0013. Both are kept as history, marked
superseded at their top. The parts of ADR 0012 that amended ADR 0004 (the
helper refusing AI apps' tokens) and ADR 0007 (`/setup/` carrying the
server's file) lapse with the server. ADR 0004, 0005, 0008 and 0015 stand.

## For the owner

- The "AI apps" feature is gone: the Claude and ChatGPT connection, its
  consent page, its card in Settings, the suggestions an AI app could leave
  in Review, its Help text and its one-time updates.
- Your own AI helper (Coach words, suggested categories in Review, "just
  type it", receipts, Ask) is not touched. It works as before.
- Nothing you use changes. You never connected an AI app, so you lose
  nothing, and the hosted database held no AI-app rows and no suggestions.
- Two things stay on your side, and you may do them when you like; nothing
  breaks if you do not (below): switch off Supabase's OAuth server, and
  remove any registered OAuth clients.

## Context

- The owner does not use it and asked for it gone completely.
- No AI app was ever connected. The AI apps server (the `mcp` Edge Function)
  was never deployed to the hosted project, so no AI app could have reached
  the budget.
- The hosted database holds zero AI-app rows and zero proposals.
- Keeping it meant keeping a second server, a public sign-in page and a
  long list of safety rules for a feature with no user.

## Decision

Removed from the code:

- the server package (`packages/ai-apps`) and the file built from it;
- the consent page the AI app's sign-in opened;
- the Settings card "AI apps";
- the AI-app suggestions in Review ("Suggested changes");
- the Help text about connecting Claude or ChatGPT; and
- the one-time updates (and their checks) that existed only for it.

The documents are brought into line: the design documents
`docs/design/mcp/` are deleted (git history keeps them); `CONSTRAINTS.md`,
`CAPABILITY-MAP.md`, `HANDOFF.md` and `docs/setup.md` no longer describe it
as present. ADR 0012 and 0013 stay as the record of why it was built.

**Not removed: the database objects.** Migrations `0018` to `0042` created,
for the feature: four tables whose names start `ai_app` (`ai_app_access`,
`ai_app_usage`, `ai_app_last_use`, `ai_app_proposals`), about twenty
functions, and the value `ai_app` as a source of an entry. They stay:

- Migrations are forward-only, and one already applied to the hosted
  project is never edited (CLAUDE.md, "Never").
- Taking those objects out is a destructive migration. CLAUDE.md, "Ask
  first", says such a migration is its own commit, made after a verified
  `pg_dump`. That is a separate decision from removing the code.
- Later migrations check the earlier ones in order ("Paste 0037 first"),
  and the migration replay gate builds an empty database from every file, so
  deleting old files would break the chain.

They do no harm where they are. The tables are empty. Row-level security is
on for each of them. Nothing in the app calls them any more, so they are
unreachable from the app. A few shared functions (importing, approving)
also carry a check that turns an AI app's sign-in away; with no AI app it
never fires.

The owner's own AI helper (`supabase/functions/ai`, ADR 0004 and 0015) is
untouched, and so are its tables and `0016`, `0017`, `0041`.

## Consequences

- One server, one sign-in page and one set of rules fewer to keep safe. The
  rules that existed only for it are removed from `CONSTRAINTS.md`; every
  rule that also guards the AI helper, Storage, logging or secrets stays.
- The database carries about twenty unused functions and four empty tables
  until the cleanup below. They add a little to what a reader of the
  migrations must skim, and nothing to what the app does.
- A fresh database still runs `0018` to `0042` in order, because the chain
  is unbroken. That is deliberate.
- If an AI-app feature is ever wanted again, it is a new decision and a new
  ADR, built on the owner's own subscription and the rules in ADR 0012,
  which stays readable for that.

### A later cleanup, if wanted

A new migration, `0043`, that drops the four tables, the functions and the
`ai_app` source value. It is destructive, so: first a verified `pg_dump`
(CLAUDE.md, "Ask first"), then the migration in its own commit. Recorded as N183 in `NOTICED-NOT-TOUCHING.md`.

### On the owner's side (not done by code)

- **Supabase's OAuth server.** In the dashboard, **Authentication → OAuth
  Server**: switch it off, if it was ever switched on. With the `mcp`
  function never deployed and the consent page gone, nothing answers an AI
  app's sign-in, but the switch is still the owner's to turn off.
- **Registered OAuth clients.** In the same place, remove any client that
  an AI app registered.
- If the `mcp` Edge Function was ever pasted into Supabase by hand,
  delete it: **Edge Functions → `mcp` → ⋯ → Delete**. (The repository
  records it as never deployed.)

None of these three is needed for the app to work.
