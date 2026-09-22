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
| `chart-specs` | Chart layout and SVG generation as pure functions: Sankey flows, the contribution grid, category bars, trend lines. No React, no DOM. | `money-primitives`, `calc-engine` |
| `schema-contracts` | Every zod schema and the DB row types. The executed contract between client, Edge Functions, and Postgres. | `money-primitives` |
| `persistence-schema` | Migrations, RLS policies, the dedupe unique index, private Storage bucket policies, seed fixtures. | `schema-contracts` |
| `statement-parsers` | Deterministic CSV/XLSX parsing, merchant normalization, the dedupe hash. Bytes in, validated rows out. | `money-primitives`, `schema-contracts` |
| `llm-providers` | One interface over GLM / Gemini / Qwen / DeepSeek / Ollama, the failover router, the hardcoded endpoint allowlist, prompt templates paired with their schemas. | `schema-contracts` |
| `ingest-pipeline` | The candidate lifecycle: creation, merchant-rule lookup and learning, review-queue state machine, guarded promotion to `transactions`. | `schema-contracts`, `persistence-schema`, `statement-parsers`, `llm-providers` |
| `savings-coach` | Weekly limits and streaks, savings-capacity analysis, goal tracking and tradeoff conversion, the spend-interrogation loop and the answers it learns from, and the surfacing of insights: ranking, dismissal state, cadence and narration. The behavioural layer; every number it shows and every detector that fires comes from `calc-engine`. | `calc-engine`, `schema-contracts`, `persistence-schema`, `ingest-pipeline`, `llm-providers` |
| `report-export` | Excel workbook and PDF report generation. Formats engine output and embeds `chart-specs` SVG; computes nothing. Dynamically imported, runs on the client. | `calc-engine`, `chart-specs`, `schema-contracts` |
| `reminders-scheduler` | pg_cron bill reminders plus the heartbeat row that proves the job is still firing. | `persistence-schema`, `calc-engine` |
| `app-client` | Vite + React PWA: routes, magic-link auth, the Supabase/TanStack Query data layer, design tokens, and every screen. Renders engine output. Computes nothing. | `calc-engine`, `schema-contracts`, `ingest-pipeline` |

**Build order**

```
money-primitives → golden-verification → calc-engine → chart-specs
  → schema-contracts → persistence-schema → statement-parsers → llm-providers
  → ingest-pipeline → savings-coach → report-export → reminders-scheduler
  → app-client
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

**`chart-specs` produces SVG strings, not components.** A chart built as a
React component can only be drawn on a screen. As a pure function it serves
three destinations — the app as inline SVG, the PDF directly, and Excel
after rasterisation — so a figure cannot look right on the phone and wrong in
the export. It also makes chart layout golden-testable, which a component is
not. See docs/ideas/export.md.

**`app-client` is one module, not several**, because splitting screens from the
data layer would produce a task list rather than a boundary.

## Slice order for delivery

Modules are the dependency structure, not the delivery plan. Work ships as
vertical slices, each leaving the app usable.

**Month opens first; Week is one tap away** *(changed 2026-09-22)*. This
section first said: "Weekly is the primary lens. The workbook is month-first
with a weekly tab bolted on; the user thinks in weeks. Weekly is the default
screen and the unit limits, streaks, and goals are expressed in. Monthly is the
summary view." Since then the owner asked for the app to look and work like
their Workbook workbook, whose money lands on month tabs, and when asked which
screen should open first they chose Month (`docs/workbook-plan.md` §9a, decision
1). Weekly limits and streaks, when the coach is built, are still weekly.

Slices 1 and 2 of the original order are built (the Week screen; statement
import into the review queue), and most of 3: photo capture and a typed-entry
form, but not natural-language entry. The rest now runs in the
Workbook plan's order (§8), ahead of the coach (§9a, decision 13):

1. Pre-work: unreadable statement lines shown in Review, dedupe tests that
   bite, React Testing Library for the screens
2. Schema sitting A: category lists (`kind`), recategorising a posted row,
   statement periods
3. Workbook's look; categories sorted into Workbook's lists; the Setup screen;
   starter lists; Week counts by list
4. The period engine, proven against the workbook before any screen shows it
5. Navigation (Month · Week · Add · Review · More, with period addresses), then
   **the first Workbook month filled from a statement**, then fixing a row from
   the month
6. Schema sitting B: budgets, planned bills, monthly starting balances, pay
   schedules
7. Budgets on the month; bills set-up; planned versus real; the summary card
8. `chart-specs` and the month charts
9. The Year engine and screen, including Workbook's Home at its top
10. Week in Workbook's shape; Paycheck; Bill Calendar
11. Schema sitting C: savings funds, then debts. Savings funds; Debts
12. Savings coach: weekly limits, the streak grid, interrogation, goal tradeoffs
13. Natural-language entry, the unbuilt rest of the original slice 3
14. Due reminders and the forecast
15. Sankey flow view: income sources -> categories -> savings, from the ledger
16. Export: Excel workbook and PDF report, with the same figures as the screen

Net worth, retirement and 50/30/20 are not scheduled (docs/ROADMAP.md).

Slices 1–2 of the original order were what replaced the spreadsheet's daily
use. Everything after is addition, not replacement.
