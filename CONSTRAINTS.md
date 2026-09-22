# Constraints

Last reviewed: 2026-09-21

This file is the project's quality bar. Every row names the command that
produces the verdict — a number with no command is an aspiration, not a
constraint.

**This file does not get weakened to make a change pass.** Tightening may be
silent. Loosening requires its own commit, separate from the change that was
failing.

## Floor — always enforced

- No new suppression comments: `@ts-ignore`, `eslint-disable`, `as any`, `as unknown as`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`
- No skipped or deleted tests without a reason in the commit message
- No secrets in source
- No silent numeric fallbacks on money, date, or category paths: no `?? 0`,
  no `|| 0`. A $0 balance, a 0% APR, and a 0-month term are all legitimate
  values — missing data fails loudly into the review queue instead.

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|---|---|---|---|
| Types | Zero type errors | `tsc --noEmit` | every edit |
| Lint | Zero errors | `eslint .` | every edit |
| Secrets | Zero findings | `gitleaks detect --redact --no-banner` | every edit |
| Golden replay | 100% exact match, zero tolerance | `pnpm -F core test:golden` | every edit + CI |
| Engine purity | Zero forbidden imports or ambient state | `depcruise --validate` | every edit |
| Float money | Zero `toFixed`/`parseFloat` on monetary values | `tsc --noEmit` (branded type) + eslint | every edit |
| Coverage | ≥80% of changed lines in `packages/core` and `packages/schema` | `vitest run --coverage` | task end + CI |
| No engine mocks | Zero `vi.mock` under `packages/core` | grep in CI | CI |
| Extraction accuracy | ≥90% zod-valid, ≥98% exact amount match, over ≥20 labeled samples | `pnpm -F ingest test:extraction` (replays committed responses; no live calls) | CI |
| Ingest idempotency | Re-import yields 0 new rows; double-approve yields 1 transaction | integration test vs local Supabase | CI |
| RLS coverage | `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` = 0 | SQL assertion in migration replay | CI |
| Migration replay | Every migration applies cleanly to an empty database, zero schema drift | dedicated CI job | CI |
| Web entry bundle | ≤700 KB gzipped, ≤115% of recorded baseline; SheetJS and charts absent from entry chunk | `size-limit` + entry-chunk grep | CI |
| Engine speed | Full dashboard recompute over 5,000 transactions ≤50 ms | `performance.now()` assertion | task end |
| Feedback loop | `check:fast` ≤5s · `check:task` ≤90s · CI ≤5 min | `timeout-minutes: 5` | CI |

If the pipeline exceeds its time budget, fix the pipeline. Never trim a gate.

## Engine purity, specifically

`packages/core` may not import: `react`, `react-native`, `expo*`,
`@supabase/*`, `node:*`, `zod`, or anything that performs `fetch`.
Its only runtime dependency is the `money-primitives` workspace package.

It may not contain: `Date.now()`, zero-argument `new Date()`, `Math.random()`,
or `process.env`. Time enters as an explicit `asOf` parameter.

This is what makes the golden replay trustworthy and `git bisect run` usable at
any commit.

## The approval invariant

Every ingested row — CSV, photo, or typed — becomes an `ingest_candidates` row
first. There is exactly one path into `transactions`.

A candidate is auto-approved **only** when it matches a confirmed
`merchant_rules` entry by exact normalized merchant string. That is a
deterministic lookup, not a judgment call.

**A candidate whose category came from a model is never auto-approved.** Model
output reaches the ledger only after the user approves it. Auto-approved rows
are stamped with `auto_approved_at` and surfaced in the dashboard's
recently-added strip so the path stays visible.

## Measured, not yet enforced

| Metric | Today | Direction |
|---|---|---|
| Golden assertion count | 0 | must not fall |
| Web entry bundle | not yet built | must not grow |

## Exceptions

| ID | Rule | Path | Reason | Expires |
|----|------|------|--------|---------|
| — | none yet | | | |
