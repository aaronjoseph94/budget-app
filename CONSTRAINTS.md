# Constraints

Last reviewed: 2026-09-28

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
| Engine purity | `packages/core` imports only `money-primitives`; no ambient clock, randomness, env, locale, time zone, network, timer or storage, in `core` and in the pure packages (`statement-parsers`, `chart-specs`, `savings-coach`, `report-export`), whose dedupe hash alone may use `crypto` | `depcruise` + `eslint` (`no-restricted-globals`, `NO_AMBIENT_STATE`) | every edit |
| Float money | No `toFixed` / `parseFloat` in the engine; `Cents` brand enforced by the type system | `eslint` + `tsc --build` | every edit |
| Weak assertions | No `toBeCloseTo`, no snapshots, no `vi.mock` under `packages/core` | `eslint` | every edit |
| Secrets | Zero findings in the working tree (local `.env` files allowed there only) | `gitleaks dir --config .gitleaks-tree.toml --redact --no-banner` | every edit |
| Tracked env files | No `.env` file is tracked but `.env.example` | `git ls-files` (`no_env_files` in `scripts/gates.sh`) | every edit |
| Secret history | Zero findings in committed history, `.env` files included | `gitleaks detect --config .gitleaks.toml --redact --no-banner` | CI |
| Golden replay | 100% exact match, zero tolerance | `vitest run` (at full level, the same run as Coverage) | every edit |
| Coverage | ≥80% lines and functions, ≥75% branches, per module | `vitest run --coverage` (gate `golden+coverage`: the suite runs once at full level) | CI |
| Migration replay | Applies cleanly to an empty database | `scripts/verify-migrations.sh` | CI |
| RLS coverage | `pg_tables WHERE NOT rowsecurity` returns 0; every public table has an all-commands `user_id = auth.uid()` policy (`pg_policies`), and it is the only permissive policy on the table, so policies isolate; no SECURITY DEFINER function is callable by `anon` | `scripts/verify-migrations.sh` | CI |
| Dependencies | Nothing high or above | `pnpm audit --audit-level high` | CI |
| Web first load | The JavaScript a phone loads before the first screen (the entry and the chunks it preloads) ≤200 KB gzipped | `node scripts/check-bundle.mjs` | CI |
| Edge Functions | Every `supabase/functions/*/index.ts` type-checks; imports zod alone, so it can be pasted as one file (its tests: the function, vitest, Node and `packages/schema`); uses `console` only inside its one `log(code, counts)` helper; and is tested to ≥80% lines and functions, ≥75% branches | `tsc --build` + `depcruise` + `eslint` + `vitest run --coverage` | every edit (coverage: CI) |
| AI apps server | `packages/ai-apps` (ADR 0012) imports only `core`, `money-primitives`, `statement-parsers`, `schema`, zod and the official MCP SDK, and never the app; uses `console` only in `src/log.ts`, whose `log(code, counts)` takes a fixed code and numbers; and is tested to ≥80% lines and functions, ≥75% branches. The file built from it, `setup/mcp-function.ts`, imports only `npm:zod@4.6.5` and `npm:@modelcontextprotocol/server@2.2.0` and names no service key or AI host; only `apps/web/setup-files.ts` may import the package | `depcruise` + `eslint` + `vitest run --coverage` (`mcp-bundle.test.ts`) + `node scripts/check-bundle.mjs` | every edit (coverage, bundle: CI) |
| Browser holds no AI key | No AI service's API host (`generativelanguage.googleapis.com`, `api.groq.com`, `openrouter.ai/api`, `api.openai.com`, `api.anthropic.com`) and no `SERVICE_ROLE` in `apps/web/src` or the built JavaScript (`/setup/` left out: it is the AI helper's own source, never run by the page); `connect-src` is `'self'` and the Supabase project alone | `vitest run` (`no-provider-hosts.test.ts`, `headers.test.ts`) + `node scripts/check-bundle.mjs` | every edit (bundle: CI) |
| Model text carries no numbers | Every string a model writes is held to ADR 0005's text rule (`ModelProse`: NFKC, then no invisible character (`\p{Cf}`, `\p{Co}`, `\p{Cn}`, or a control but a line end or tab), no `\p{N}` or `\p{Sc}`, no markup or link characters, no number word but "one", no product or investing words, at most two line breaks, each field within its length) before it is drawn or kept; the database refuses any digit, in five scripts, and `$ ＄ % ％ € £ ¥ ¢ ₹` in the AI's kept words, and the bidi, zero-width and private-use characters (`ai_text_is_clean`, 0017, 0028); each filled blank is drawn in its own `<bdi>` | `vitest run` (`model-prose.test.ts`; `templates.test.ts` holds the app's own words to the same rule) + `scripts/verify-migrations.sh` | every edit (schema: CI) |
| Brand | The workbook vendor's name is in no tracked or new (not ignored) file's text or path, in any letter case | `git grep -niI --untracked -e "w[i]nky"` + `git ls-files --cached --others --exclude-standard` | every edit |
| Source data | No statement, export or receipt photo (`.pdf .csv .xls(x) .ofx .qfx .qif .numbers .ods .heic .heif .jp(e)g .webp`) is tracked or waiting unstaged, but reduced fixtures under `packages/*/test/fixtures` | `git ls-files --cached --others --exclude-standard` (`no_source_data` in `scripts/gates.sh`) | every edit |
| Phone width | No class in `apps/web/src` fixes a width, minimum width, size or basis over 320 px outside a breakpoint; every grid has a column for a phone; every band that bleeds to the screen's edge takes back the 12 px gutter below 360 px; a link inside a sentence takes its 44 px from padding (`SENTENCE_LINK`), and a button drawn as underlined words from `LINE_BUTTON`; a date beside another field stacks below 360 px; every chart is held to a width (A26) | `vitest run` (`width-guard.test.ts`) | every edit |

The web first-load row replaced the pending "≤700 KB gzipped" entry-bundle
row on 2026-09-24, tighter: the entry had grown from 192.83 to 214.62 KB
gzipped with nothing firing (PERF-8), and splitting the screens out brought
it to 180.7. Verified by lowering the budget below that and observing FAIL.

The Edge Functions row was added on 2026-09-24. `read-receipt` holds a
provider key and no gate had ever compiled, linted or run it; the folder is
now a private workspace package, `@budget/functions`, so every gate reaches
it, while each function still imports zod by Deno's pinned URL
(`npm:zod@4.6.5`), aliased to the package's own zod for `tsc`, vitest and
`depcruise`. Each part was seen `RED` once: a type error in the function
(`tsc`), `console.error` outside the log helper (`eslint`), the function
importing `packages/schema` and its test importing the engine (`depcruise`),
and its tests moved away (coverage at 0% against 80). Its built file's checks
(M3) were seen `RED` by a third import and by a service key's name planted
in the source (`check-bundle.mjs` and the bundle test), and an import of
the package from `apps/web/src` (`depcruise`).

The AI apps server row was added on 2026-09-30 (MCP plan M2a). The server
sees the owner's token, an AI app's arguments and the owner's rows, so its
boundary and its log rule are the Edge Functions' own, applied to a package
that is built into one pasteable file rather than written as one. Seen
`RED` by a `console.log` in a new file beside `log.ts` (`eslint`), an
import of the app's `format.ts` from `src/deno.ts` (`depcruise`), and its
tests moved away (coverage at 0% against 80).

The "browser holds no AI key" row was added on 2026-09-25 (plan A09).
Every AI call goes through the `ai` Edge Function on the Supabase
project, so the page never needs a provider's address, and a key or its
name in the browser's code would be a leak waiting for a mistake. Seen
`RED` by planting `api.OpenAI.com` in a comment and
`SUPABASE_SERVICE_ROLE_KEY` in a screen's source (the test), and
`api.groq.com` and `SERVICE_ROLE` in strings the app ships (the bundle
check). The lowercase word `service_role` stays allowed: sign-in tells
the owner never to paste that key.

The "model text carries no numbers" row was added on 2026-09-25 (plan
A12). A figure in the AI's words could only be one it made up, since the
app fills every figure from the engine into a blank (ADR 0005). Seen `RED`
by matching `\d` and `$` instead of `\p{N}` and `\p{Sc}` (six rows:
Arabic-Indic, Extended Arabic-Indic and Devanagari digits, and €, ₹ and
¢; NFKC had already made fullwidth digits ASCII) and by dropping the letter boundary before a number word
("often", "tenth"); the database's half was seen `RED` by removing each
of its digit ranges and signs in turn (0017's commit).

The brand row was added on 2026-09-24, when the owner asked for the
workbook vendor's name to go from everything in the repository. It checks
the files as they stand, not history: commit messages and older versions of
files are rewritten separately. The pattern writes the name's second letter
as a character class, so `gates.sh` cannot match itself. A git grep that
errors is `RED`, not clean. Verified by staging a file with the name in
capitals, and another with it only in its file name, and observing `RED`
each time.

Verified to bite: injecting `Date.now()` and `toFixed()` into `packages/core`
turns the gate run `RED`. A gate never seen to fail has not been tested.

The purity rule caught only four spellings until 2026-10-01
(architecture-a-03): `Date()`, `globalThis.Date.now()`, `performance.now()`,
`crypto.randomUUID()`, a bare `localeCompare`, `new Intl.DateTimeFormat()`,
`fetch`, `setTimeout`, `process.versions` and `toLocaleString()` all linted
clean in `packages/core/src`, and `statement-parsers`, whose dedupe hash
must read a file the same way every time, had no such rule at all. Each of
those ten spellings was then planted in `core`, `statement-parsers`,
`chart-specs`, `savings-coach` and `report-export` and seen `RED` in every
one; `localeCompare` with a named locale stays allowed, `Intl` only in
core's `order.ts` (F52), `crypto` only in `dedupe.ts`. In `money-primitives`,
which keeps `Date` for its UTC calendar, a local getter, `Date()` and a
parsed date string were seen `RED`. `packages/core` still type-checks with
Node's types visible to `src`: its tsconfig builds `src` and `test` as one
project that the other packages reference, and the lint rule names the
same globals.

Every module has a coverage floor. `statement-parsers` and
`golden-verification` had none: thresholds apply only to files a glob matches,
so those two were measured into the printed summary and never checked. The
highest-stakes module on the branch could have had its tests deleted with CI
still green. Verified by deleting them and observing `RED`.

The schema gate applies the migrations verbatim to a throwaway PostgreSQL
cluster and then attempts every write the schema promises to refuse, raising if
one succeeds. Verified by deleting the constraint that stops a model-categorised
candidate auto-approving and observing the run go `RED` — a schema is a set of
claims about what cannot happen, and an unattempted refusal is an assumption.

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

Module boundaries are deny by default (2026-09-23). The rules used to name
only what each listed package could not reach, so `golden-verification` and
any new package were governed by nothing, and an import resolving into a
library's `dist/` was dropped from the graph entirely by an unanchored
exclude, so no rule could see supabase-js, vitest or vite. Every arrow must
now match an `allowed` line in `.dependency-cruiser.cjs`. Verified by
importing the engine from `golden-verification`, and `vitest` from an app
source file: both passed the old rules and turn the purity gate `RED`.

## Pending — agreed, not yet checkable

Each names the module whose existence activates it. Moving a row up requires
the command to actually run.

| Dimension | Rule | Activated by |
|---|---|---|
| Extraction accuracy | ≥90% zod-valid, ≥98% exact amounts over ≥20 labeled samples; no live provider calls in CI | `llm-providers`, and 20 labelled receipts that may be committed (see below) |
| Ingest idempotency | Re-import yields 0 new rows; double-approve yields 1 transaction | `ingest-pipeline` |
| Web entry charts | Chart code out of the entry chunk (N39: the Month draws its charts on every open, so this is still open) | a lazy MonthCharts, measured |
| Engine speed | Full recompute over 5,000 transactions ≤50 ms | `calc-engine` rollups |
| Feedback loop | `gates.sh fast` ≤5s · full ≤90s · CI ≤5 min | CI setup |
| Mobile sweep | Every screen and every fail-soft state, at 320 and 390 px, with text at 100% and 200%: `scrollWidth ≤ innerWidth`, the phone's bottom bar on screen and uncovered, every control in `main` 44 px tall on a touch screen, every field's text 16 px or more | a Playwright dev dependency, approved (A26: the sweep runs from the preview harness in the scratchpad until then) |

**Why Extraction accuracy stays pending** (2026-09-24). `llm-providers`
exists now, as `read-receipt` and, from plan A09, the `ai` helper, so the
module named as its trigger is here, and the row still cannot run. It
measures a real model reading real receipts, and none can be committed: no
labelled receipts exist; the owner's own receipts and statements must never
enter the repository (CLAUDE.md); and receipts invented here would measure
nothing about the real model, only how well it reads what this code chose
to draw. CI also makes no live provider calls, so the only honest version
is a recorded set of real model replies to redacted receipts, replayed
through `parseReceiptReply`. What is checked meanwhile is the part that
does not need the model: every reply is parsed by zod before use, and
whatever it reads waits in Review. The row moves up when the owner supplies
20 receipts that may be kept, redacted, as fixtures.

**Why the Mobile sweep is pending** (2026-09-28, A26). It needs a
browser that lays the page out, and jsdom lays out nothing; Playwright is
the tool, and a new dev dependency waits for the owner's approval
(CLAUDE.md). A26 ran it from the preview harness in the scratchpad at 320,
375, 390, 430, 768 and 1280 px, light and dark, and with text at 200%, and
fixed what it found; the part of it that reads source rather than a page is
enforced above, as Phone width. The row moves up with the dependency and a
CI job that starts the preview and runs the sweep.

**Why Engine speed stays pending** (2026-09-24). Its trigger, rollups over
the ledger, exists: the Month recomputes `monthSheet` and
`periodComparison` on every open, and the Coach's digest (plan A07) reads a
year. It still cannot be an enforced row, because a wall-clock limit is not
deterministic: the same code passes on an idle machine and fails on a
shared CI runner, and a gate that fails at random gets ignored. It is
measured instead, once, and recorded here. On 2026-09-24, in vitest on the
build container, `monthSheet` and `periodComparison` together over 5,000
transactions in 40 categories across nine months took 2.4 ms (median of
20 runs; slowest 4.4 ms), against the row's 50 ms. The Coach's
`factsDigest` over 5,000 transactions in 40 categories across nine months
took 9.1 ms, and 10.4 ms (median of 20; slowest 20.9 ms) when re-run in
review. The row moves up if a
deterministic measure is found, such as counting passes over the ledger.

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
| Golden assertion count | 121 (the tests in `packages/core/test/golden`, unchanged, re-counted 2026-09-28) | must not fall |
| Total tests | 2666 in 282 files (`vitest run`, 2026-09-28, A28) | must not fall |
| Screen accessibility | every screen test file runs an axe check (`apps/web/test/axe.ts`, ADR 0009): 91 files and the helper's own test; the 9 that draw nothing are left out; WCAG A and AA, colour contrast left to `contrast.test.ts` | every new screen test file adds one |
| Web first load | 184.33 KB gzipped of the 200 KB budget (2026-09-28) | measured by the bundle gate |

## Exceptions

| ID | Rule | Path | Reason | Expires |
|----|------|------|--------|---------|
| — | none | | | |
