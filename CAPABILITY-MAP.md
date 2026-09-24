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
| `persistence-schema` | Migrations, RLS policies, the dedupe unique index, private Storage bucket policies, seed fixtures. From 0016, the AI tables and the functions only the AI helper may call. | `schema-contracts` |
| `statement-parsers` | Deterministic CSV/XLSX parsing, merchant normalization, the dedupe hash. Bytes in, validated rows out. | `money-primitives`, `schema-contracts` |
| `llm-providers` | One interface over Gemini, Groq and OpenRouter (free) and OpenAI and Anthropic (paid): the hardcoded endpoint and model allowlist, the failover router with its daily limits and cooldowns, each task's prompt paired with its JSON schema, and the encryption of pasted keys. Realised as the `ai` Edge Function, one pasteable file, beside `read-receipt` (ADR 0004). | `schema-contracts` (held to it by contract tests; the file imports only zod), `persistence-schema` |
| `ingest-pipeline` | The candidate lifecycle: creation, merchant-rule lookup and learning, review-queue state machine, guarded promotion to `transactions`. | `schema-contracts`, `persistence-schema`, `statement-parsers`, `llm-providers` |
| `savings-coach` | Weekly limits and streaks, savings-capacity analysis, goal tracking and tradeoff conversion, the spend-interrogation loop and the answers it learns from, and the surfacing of insights: ranking, dismissal state, cadence and narration. The behavioural layer; every number it shows and every detector that fires comes from `calc-engine`. Realised as `packages/savings-coach`: templates and tones, the blank renderer, card ranking, the quotes and tips library, the AI's brief and its signatures, the check of a model's reply, Ask's intents, the check-in's rules (ADR 0005). | `calc-engine`, `schema-contracts` (types), `money-primitives` (types) |
| `report-export` | Excel workbook and PDF report generation. Formats engine output and embeds `chart-specs` SVG; computes nothing. Dynamically imported, runs on the client. Realised in part as `packages/report-export`: a month as CSV, with the formula guard (N4); the PDF is the browser's print of Reports. The Excel workbook is not built. | none for the CSV writer, which takes rows of text; `calc-engine`, `chart-specs`, `schema-contracts` once the Excel workbook is built |
| `reminders-scheduler` | pg_cron bill reminders plus the heartbeat row that proves the job is still firing. | `persistence-schema`, `calc-engine` |
| `app-client` | Vite + React PWA: hash navigation (ADR 0003, ADR 0006), magic-link auth, the Supabase data layer, design tokens, every screen, and the Help and Getting started content. Renders engine output. Computes nothing. Reaches `llm-providers` only by `supabase.functions.invoke('ai')`. | `calc-engine`, `chart-specs`, `schema-contracts`, `persistence-schema` (the coach's tables), `ingest-pipeline`, `llm-providers` (by `functions.invoke('ai')` only, never an import), `savings-coach`, `report-export` (loaded when used) |

*Changed 2026-09-24* (`docs/ai-first-plan.md`, decided by the engineer under
the owner's 2026-09-24 instruction to proceed without questions):
`llm-providers` first named GLM, Qwen, DeepSeek and Ollama; the providers
are now five chosen under the owner's instruction, which asks for free
models like Gemini and the ability to add paid ones (ADR 0004).
`savings-coach` first depended on `persistence-schema`, `ingest-pipeline`
and `llm-providers`; as a package it does no reading, writing or calling,
so those arrows now start at `app-client`, which reads and writes the
coach's tables and calls the helper. `app-client` always drew
`chart-specs`' charts; the arrow was missing.

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

**`llm-providers` is one file, not a package** (2026-09-24). The owner deploys
it by pasting it into the Supabase dashboard, which takes one file, so it
imports nothing but zod and cannot import `schema-contracts`. The
`supabase/functions` folder is a private workspace package,
`@budget/functions`, only so that the gates can compile and test each file;
nothing imports it. Contract tests
hold its request and reply schemas to `schema-contracts` instead, and
`depcruise` checks it imports nothing else. It is the only code that holds a
provider key, so it is under every gate like a package (ADR 0004).

**`savings-coach` is pure, like `chart-specs`** (2026-09-24). It turns
`calc-engine`'s facts into cards, templates and the AI's brief, and checks a
model's reply against what was offered, with no I/O, clock, randomness or
zod; the app reads, writes, hashes and calls. That keeps every rule about
what the AI may say testable without a network, and keeps the arrow from
the coach to the engine one way: the coach may call the engine, never the
reverse (ADR 0005).

## Slice order for delivery

Modules are the dependency structure, not the delivery plan. Work ships as
vertical slices, each leaving the app usable.

**Month opens first; Week is one tap away** *(changed 2026-09-22)*. This
section first said: "Weekly is the primary lens. The workbook is month-first
with a weekly tab bolted on; the user thinks in weeks. Weekly is the default
screen and the unit limits, streaks, and goals are expressed in. Monthly is the
summary view." Since then the owner asked for the app to look and work like
their workbook, whose money lands on month tabs, and when asked which
screen should open first they chose Month (`docs/workbook-views-plan.md` §9a, decision
1). Weekly limits and streaks, when the coach is built, are still weekly.

Slices 1 and 2 of the original order are built (the Week screen; statement
import into the review queue), and most of 3: photo capture and a typed-entry
form, but not natural-language entry. The rest now runs in the
workbook views plan's order (§8), ahead of the coach (§9a, decision 13):

1. Pre-work: unreadable statement lines shown in Review, dedupe tests that
   bite, React Testing Library for the screens
2. Schema sitting A: category lists (`kind`), recategorising a posted row,
   statement periods
3. The workbook's look; categories sorted into the workbook's lists; the Setup screen;
   starter lists; Week counts by list
4. The period engine, proven against the workbook before any screen shows it
5. Navigation (Month · Week · Add · Review · More, with period addresses), then
   **the first workbook month filled from a statement**, then fixing a row from
   the month
6. Schema sitting B: budgets, planned bills, monthly starting balances, pay
   schedules
7. Budgets on the month; bills set-up; planned versus real; the summary card
8. `chart-specs` and the month charts
9. The Year engine and screen, including the workbook's Home at its top
10. Week in the workbook's shape; Paycheck; Bill Calendar
11. Schema sitting C: savings funds, then debts. Savings funds; Debts
12. Savings coach: weekly limits, the streak grid, interrogation, goal tradeoffs
13. Natural-language entry, the unbuilt rest of the original slice 3
14. Due reminders and the forecast
15. Sankey flow view: income sources -> categories -> savings, from the ledger
16. Export: Excel workbook and PDF report, with the same figures as the screen

Net worth, retirement and 50/30/20 are not scheduled (docs/ROADMAP.md).

**The AI-first phase** *(added 2026-09-24)*. The owner's list of 2026-09-24
asks for the app to be AI first, with forecasting, reports and trends,
comparisons with last month, Help and a fuller setup. `docs/ai-first-plan.md`
builds items 12 (the coach, with the check-in), 13 (natural-language entry),
14 in part (the forecast; not the reminders) and 16 in part (Save as PDF and
CSV; not the Excel workbook) of the list above, in its own order (§13,
slices A01–A28), each slice a schema, engine and screen change together.
The Sankey (15) and the due reminders stay unbuilt.

Slices 1–2 of the original order were what replaced the spreadsheet's daily
use. Everything after is addition, not replacement.
