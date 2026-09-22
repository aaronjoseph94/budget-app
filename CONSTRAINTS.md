# Constraints

Last reviewed: 2026-09-21

This file is the project's quality bar.

**Every row in "Enforced now" names a command that exists and runs in this
repository.** A dimension with a number and no runnable command is an
aspiration, not a constraint — it belongs in "Pending", below, where it is
honest about not being checked yet.

**This file does not get weakened to make a change pass.** Tightening may be
silent. Loosening requires its own commit, separate from the change that was
failing.

Run everything: `./scripts/gates.sh` — it **fails closed**. A required gate
whose tool is missing reports `MISCONFIGURED` and exits 2. A check that cannot
run is never reported as green.

## Floor — always enforced

- No new suppression comments: `@ts-ignore`, `eslint-disable`, `as any`, `as unknown as`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`
- No skipped or deleted tests without a reason in the commit message
- No secrets in source
- No silent numeric fallbacks on money, date, or category paths: no `?? 0`,
  no `|| 0`. A $0 balance, a 0% APR, and a 0-month term are legitimate values;
  missing data fails loudly into the review queue instead.

## Enforced now

| Dimension | Rule | Command | Runs at |
|---|---|---|---|
| Types | Zero type errors | `tsc --build` | every edit |
| Lint | Zero errors | `eslint .` | every edit |
| Engine purity | `packages/core` imports only `money-primitives`; no ambient clock, randomness, or env | `depcruise --validate` + `eslint` | every edit |
| Float money | No `toFixed` / `parseFloat` in the engine; `Cents` brand enforced by the type system | `eslint` + `tsc --build` | every edit |
| Weak assertions | No `toBeCloseTo`, no snapshots, no `vi.mock` under `packages/core` | `eslint` | every edit |
| Secrets | Zero findings | `gitleaks detect --redact --no-banner` | every edit |
| Golden replay | 100% exact match, zero tolerance | `vitest run` | every edit |
| Dependencies | Nothing high or above | `pnpm audit --audit-level high` | CI |

Verified to bite: injecting `Date.now()` and `toFixed()` into `packages/core`
turns the gate run `RED`. A gate never seen to fail has not been tested.

## Pending — agreed, not yet checkable

Each names the module whose existence activates it. Moving a row up requires
the command to actually run.

| Dimension | Rule | Activated by |
|---|---|---|
| Coverage | ≥80% changed-line in `packages/core`, `packages/schema` | `schema-contracts` |
| Extraction accuracy | ≥90% zod-valid, ≥98% exact amounts over ≥20 labeled samples; no live provider calls in CI | `llm-providers` |
| Ingest idempotency | Re-import yields 0 new rows; double-approve yields 1 transaction | `ingest-pipeline` |
| RLS coverage | `pg_tables WHERE NOT rowsecurity` returns 0 | `persistence-schema` |
| Migration replay | Applies cleanly to an empty database, zero drift | `persistence-schema` |
| Web entry bundle | ≤700 KB gzipped, ≤115% of baseline; SheetJS and charts out of the entry chunk | `app-client` |
| Engine speed | Full recompute over 5,000 transactions ≤50 ms | `calc-engine` rollups |
| Feedback loop | `gates.sh fast` ≤5s · full ≤90s · CI ≤5 min | CI setup |

## Check classes

Not every check is worth the same. Ranked by whether the agent can make it pass
by writing code that does not work:

- **External** — an opinion the agent did not author. `gitleaks`; the golden
  fixtures, because they were extracted from the workbook's own cached Excel
  values, not generated from this engine. **At least one external check is
  required at all times.**
- **Project** — rules written once and applied mechanically: `eslint`,
  `depcruise`, `tsc`.
- **Suite** — tests the agent wrote. The only genuinely circular class.

A golden fixture regenerated from the engine rather than from the workbook
silently demotes itself from External to Suite and becomes a tautology that
passes either way. Fixtures are regenerated **only** from the source workbook.

## The approval invariant

Every ingested row — CSV, photo, or typed — becomes an `ingest_candidates` row
first. There is exactly one path into `transactions`.

A candidate auto-approves **only** on an exact `merchant_rules` match: a
deterministic lookup, not a judgment. **A candidate whose category came from a
model is never auto-approved.** Auto-approved rows are stamped
`auto_approved_at` and surfaced in the dashboard's recently-added strip.

## Measured, not yet enforced

| Metric | Today | Direction |
|---|---|---|
| Golden assertion count | 9 | must not fall |
| Total tests | 25 | must not fall |

## Exceptions

| ID | Rule | Path | Reason | Expires |
|----|------|------|--------|---------|
| — | none | | | |
