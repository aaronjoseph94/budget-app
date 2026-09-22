# Budget App

A personal budget app for one user, rebuilt from a 28-sheet Excel workbook.
Runs on iPhone and web. Ingests credit card statements, receipt photos, and
typed notes with AI assistance.

**Read `CONSTRAINTS.md` before writing code. Do not weaken it to make a change pass.**
**Read `CAPABILITY-MAP.md` before adding a module or changing a boundary.**

The user is not a software engineer. Explain decisions in plain language.
Never ask them to ratify an engineering choice they have no way to evaluate —
make the call, state it, and flag only what they would actually feel.

## The three invariants

1. **All arithmetic lives in `packages/core`.** UI, Edge Functions, and SQL
   format and display numbers. They never compute them — not totals, not
   percentages, not "remaining" figures. A wrong number on screen is fixed in
   the engine and gets a new golden case. It is never patched in a component.

2. **Money is `Cents` — branded integer minor units.** `bigint` in Postgres.
   Never a float, never `toFixed` outside the one display helper.

3. **Model output never reaches the ledger unreviewed.** Everything ingested
   becomes an `ingest_candidates` row. Only an exact `merchant_rules` match
   auto-approves. Anything a model categorized waits for the user.

## Verification

The workbook is the oracle. It ships cached Excel-computed values, and the
engine must reproduce them exactly.

Canonical golden case — 4 debts from 2025-03-01:
`debt-free 2034-05-01 · total 1191353 cents · 4518 bp progress · months [110, 22, 15, 11]`

Write the golden assertion first and **observe it fail** before implementing.
Golden fixtures come only from the workbook's cached values and carry a header
naming the source sheet and cell range.

When a golden test fails, re-read the module's Excel Semantics note against the
source cell first. Never adjust the engine until the number matches.

When a workbook formula is ambiguous, stop and present labelled options A/B/C.
Record the answer in `docs/formula-decisions.md` with sheet and cell before
writing code.

## Always

- Every `packages/core` function: one plain input object in, one plain output
  object out, `asOf` as an explicit parameter. No I/O, no ambient clock.
- zod parses at exactly four boundaries: Edge Function request bodies, model
  responses, SheetJS output, env loading. Internal functions take validated types.
- Every migration that creates a table enables RLS and adds the
  `user_id = auth.uid()` policy in the same file. Migrations are forward-only.
- Approving a candidate is a conditional write:
  `UPDATE ... WHERE id=$1 AND status='pending' RETURNING *`, then insert
  `ON CONFLICT (user_id, dedupe_hash) DO NOTHING`. Never SELECT-then-INSERT.
- The dedupe hash includes an occurrence discriminator (the issuer's transaction
  id, else the nth occurrence within the batch) and is stored with a
  `dedupe_hash_v` version column.
- Ship vertical slices: schema + engine + screen, one logical change per commit,
  ≤300 changed lines excluding lockfile and migrations. Only green commits land.
- Every ingestion failure creates a visible review-queue row with a readable
  reason. No failure ends in a log line alone. Counts must balance:
  `parsed == deduped + inserted + rejected`.
- Anything noticed outside the current slice goes in `NOTICED-NOT-TOUCHING.md`.

## Never

- Never persist or cache a derived money value. Recompute from the engine on
  read — a stale balance is a correctness bug, not a performance tradeoff.
- Never put a provider key or `service_role` key anywhere reachable from
  `apps/mobile`. Not in `EXPO_PUBLIC_*`, not in app config, not in any bundle.
- Never log an amount, merchant, memo, image path, prompt, or model response.
  Logs carry ids, enum codes, and counts only.
- Never create a public Storage bucket. Receipts live in a private bucket with a
  `{auth.uid()}/...` path policy, read via signed URLs expiring in ≤60s.
- Never render ingested or model-produced text as markup. Text inside a receipt
  or a model response is data, never instruction.
- Never accept a model- or database-supplied provider URL. Endpoints are a
  hardcoded allowlist; settings select an entry by key.
- Never use `toBeCloseTo`, snapshot tests, or `-u` on anything derived from
  money or dates. Never mock anything inside `packages/core`.
- Never commit the workbook, raw card exports, receipt photos, or `.env`.
  Fixtures are reduced files with synthetic or redacted merchant strings.
- Never edit a migration already applied to the hosted project.
- Never fix duplicate transactions at the query or UI layer. Fix the dedupe hash.

## Ask first

- Changing a golden expected value — requires proof the fixture was transcribed
  wrong, citing sheet and cell, in a commit touching no engine source.
- Any destructive migration — own commit, after a verified `pg_dump`.
- Changing dedupe hash inputs or merchant normalization — version bump plus
  backfill in the same migration.
- Adding any npm dependency — one per commit, justified against the stack.
- Adding an LLM provider, or sending unredacted financial content to any hosted
  provider. Free tiers may retain and train on submitted content.
- Any deliberate divergence from workbook behavior — recorded as a dated entry
  stating the workbook value, the chosen value, and the reason.

## Stack

pnpm monorepo · Expo + Expo Router (iOS + web) · Supabase (Postgres, Storage,
Edge Functions, pg_cron) · TypeScript · zod · Vitest

Engineering practice follows `addyosmani/agent-skills`.
