# Capability Map: Budget App

Rebuild of the 28-sheet "Ultimate Annual Budget" workbook as an app that runs on
iPhone and the web, with AI-assisted transaction ingestion.

Module ids are stable and kebab-case. They are chosen once and never renamed.
Dependency arrows point one way only.

| Module id | Responsibility | Depends on |
|---|---|---|
| `money-primitives` | Branded `Cents` type, entity ids, date helpers, the single rounding and sign-convention policy transcribed from the workbook. Zero dependencies, including zod. | — |
| `golden-verification` | Extracts the workbook's cached Excel values into committed fixtures, and the replay harness that asserts a calculator reproduces them exactly. | `money-primitives` |
| `calc-engine` | All arithmetic: budget rollups, debt amortization, future value, 50/30/20, cash-flow forecast, net worth. Pure functions, no I/O, no ambient clock. | `money-primitives`, `golden-verification` |
| `schema-contracts` | Every zod schema and the DB row types. The executed contract between client, Edge Functions, and Postgres. | `money-primitives` |
| `persistence-schema` | Migrations, RLS policies, the dedupe unique index, private Storage bucket policies, seed fixtures. | `schema-contracts` |
| `statement-parsers` | Deterministic CSV/XLSX parsing, merchant normalization, the dedupe hash. Bytes in, validated rows out. | `money-primitives`, `schema-contracts` |
| `llm-providers` | One interface over GLM / Gemini / Qwen / DeepSeek / Ollama, the failover router, the hardcoded endpoint allowlist, prompt templates paired with their schemas. | `schema-contracts` |
| `ingest-pipeline` | The candidate lifecycle: creation, merchant-rule lookup and learning, review-queue state machine, guarded promotion to `transactions`. | `schema-contracts`, `persistence-schema`, `statement-parsers`, `llm-providers` |
| `savings-coach` | Weekly limits and streaks, savings-capacity analysis, goal tracking and tradeoff conversion, the spend-interrogation loop and the answers it learns from. The behavioural layer; every number it shows comes from `calc-engine`. | `calc-engine`, `schema-contracts`, `persistence-schema`, `ingest-pipeline`, `llm-providers` |
| `reminders-scheduler` | pg_cron bill reminders plus the heartbeat row that proves the job is still firing. | `persistence-schema`, `calc-engine` |
| `app-client` | Expo Router screens, auth, data layer, design tokens. Renders engine output. Computes nothing. | `calc-engine`, `schema-contracts`, `ingest-pipeline` |

**Build order**

```
money-primitives → golden-verification → calc-engine → schema-contracts
  → persistence-schema → statement-parsers → llm-providers
  → ingest-pipeline → savings-coach → reminders-scheduler → app-client
```

## Why these boundaries

**`money-primitives` is separate from `schema-contracts`** because `calc-engine`
must not depend on zod and `schema-contracts` must not depend on the engine —
yet both need the money type. Without the split, that arrow becomes a cycle.

**`golden-verification` is separate from `calc-engine`**, and is built first,
using inverted control: the harness accepts a `(input) => output` function
rather than importing the engine. This is what allows the first golden assertion
to be observed failing before any engine code exists. It is also the project's
only external, non-circular correctness check — every other test is the author
grading their own work.

**`statement-parsers` is separate from `ingest-pipeline`** because ~99% of the
user's spend arrives as a card CSV. Splitting it lets the highest-volume path be
built, fixture-tested, and proven idempotent before any LLM or queue machinery
exists, and keeps it cuttable from the photo path entirely.

**`savings-coach` owns behaviour, never arithmetic.** Savings capacity,
historical spending floors, streak counts, and goal-delay conversions are all
functions in `calc-engine`, because invariant 1 admits no exceptions. This
module owns the weekly limit state machine, the goal records, the interrogation
prompts, and the answers the user gives — which are training data for the
impulse detector, not decoration. A coach that invents its own numbers is worse
than no coach: it will confidently propose savings the user does not have.

**`app-client` is one module, not several**, because splitting screens from the
data layer would produce a task list rather than a boundary.

## Slice order for delivery

Modules are the dependency structure, not the delivery plan. Work ships as
vertical slices, each leaving the app usable:

**Weekly is the primary lens.** The workbook is month-first with a weekly tab
bolted on; the user thinks in weeks. Weekly is the default screen and the unit
limits, streaks, and goals are expressed in. Monthly is the summary view.

1. Weekly budget from manually entered transactions
2. Card CSV import → review queue → approved into the ledger
3. Photo capture and natural-language entry
4. Bills, calendar, due reminders
5. Savings funds, debt payoff, net worth, retirement
6. Forecast and reports
7. Savings coach: weekly limits, the streak grid, interrogation, goal tradeoffs

Slices 1–2 are what replace the spreadsheet's daily use. Everything after is
addition, not replacement.
