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

The tools those gates name are installed by `.claude/hooks/session-start.sh`
before each Claude Code web session: `pnpm install` against the committed
lockfile, and a pinned, checksum-verified `gitleaks`. Without it a fresh
container has neither, and every session opens `MISCONFIGURED`.

The rows marked **CI** run in `.github/workflows/gates.yml`, on every push and
pull request. It runs the same `gates.sh` and installs gitleaks from the same
pinned script the session hook uses, so a session and CI cannot disagree about
whether a commit is clean.

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
| Engine purity | `packages/core` imports only `money-primitives`; no ambient clock, randomness, or env | `depcruise` + `eslint` | every edit |
| Float money | No `toFixed` / `parseFloat` in the engine; `Cents` brand enforced by the type system | `eslint` + `tsc --build` | every edit |
| Weak assertions | No `toBeCloseTo`, no snapshots, no `vi.mock` under `packages/core` | `eslint` | every edit |
| Secrets | Zero findings in the working tree | `gitleaks dir --redact --no-banner` | every edit |
| Secret history | Zero findings in committed history | `gitleaks detect --redact --no-banner` | CI |
| Golden replay | 100% exact match, zero tolerance | `vitest run` | every edit |
| Coverage | ≥80% lines and functions, ≥75% branches, per module | `vitest run --coverage` | CI |
| Dependencies | Nothing high or above | `pnpm audit --audit-level high` | CI |

Verified to bite: injecting `Date.now()` and `toFixed()` into `packages/core`
turns the gate run `RED`. A gate never seen to fail has not been tested.

Every module has a coverage floor. `statement-parsers` and
`golden-verification` had none: thresholds apply only to files a glob matches,
so those two were measured into the printed summary and never checked. The
highest-stakes module on the branch could have had its tests deleted with CI
still green. Verified by deleting them and observing `RED`.

Coverage is verified by raising its thresholds above the measured figure and
observing the gate go `RED`. It is aggregated per module, not per changed line
as this row originally promised: vitest measures whole files, and a per-file
rule reads a re-export barrel as 0% covered however well its exports are
tested. Compiled `dist/` output is excluded — `tsc --build` emits a copy of
every module that no test imports, and counting it reported 36% while the
source the tests exercise was above 90%.

The secrets gate previously ran `gitleaks detect`, which walks commits rather
than the working tree — so it was structurally blind to the edit it was being
run on, while this table listed it under "every edit". A live-looking key in a
source file scanned clean and exit 0. It now runs `gitleaks dir` on the tree,
with the history scan kept as its own gate, and was verified by putting a
credential in a source file and observing `RED`.

Inline `eslint-disable` comments are inert (`noInlineConfig`) and writing one
is itself an error. The Floor below forbids them, but nothing enforced that:
every gate whose mechanism is eslint — Engine purity, Float money, Weak
assertions — could be switched off for a whole file by one comment while the
gate still reported PASS. Verified by hiding `Date.now()` in the amortization
schedule behind a disable comment and observing `RED`.

Engine purity is verified separately, by injecting a forbidden import in each
direction the rule guards — `core` importing zod, and `money-primitives`
importing anything — and observing `depcruise` report each one. Both were
previously unproven: the gate invoked `depcruise --validate`, which is not a
flag, so it printed usage and exited 0 on every run. Only the eslint half of
the row was ever biting. **A gate whose failure has not been observed is an
assumption, not a check** — including one this file already claims is verified.

## Pending — agreed, not yet checkable

Each names the module whose existence activates it. Moving a row up requires
the command to actually run.

| Dimension | Rule | Activated by |
|---|---|---|
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
| Total tests | 241 | must not fall |

## Exceptions

| ID | Rule | Path | Reason | Expires |
|----|------|------|--------|---------|
| — | none | | | |
