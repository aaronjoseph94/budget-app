# Roadmap

Last revised: 2026-09-24 (the AI-first phase is planned: `docs/ai-first-plan.md`)

## What this project is

Not a spreadsheet port. The workbook is the seed data and the test oracle; it
is no longer the specification — **with one exception, added 2026-09-22.** The
owner asked for the app to look and work like their workbook (the same
28-sheet file), so for the look and behaviour of the workbook views they chose it
is the specification again: Month, Setup and Bills, Year and Home, Week,
Paycheck, Bill Calendar, Savings and Debts (`docs/workbook-views-plan.md`). It is still
not the specification for its arithmetic mistakes (divergence D7) or for the
tabs that stay deferred below.

**A system that ingests spending automatically, tells the truth about it weekly,
and applies pressure toward $30,000 of flight training.**

Everything below is judged against that sentence. A feature that does not serve
it is deferred, however faithfully it reproduces a workbook sheet.

**AI first (the owner, 2026-09-24).** "AI must be the bedrock of this budget
app... The whole product should be Ai first." The sentence above stands; AI
is how the app tells that truth and applies that pressure, on every screen.
The model writes the words and the engine writes every number (ADR 0005), so
the workbook's arithmetic stays the oracle and every screen still works with
AI switched off.

## What is deferred, and why

Scope roughly doubled between "rebuild the workbook" and now. Adding without
cutting is how nothing ships. These are deferred, not deleted:

| Deferred | Why |
|---|---|
| **Retirement projection** (Financial Freedom sheet) | A 35-year horizon while the live goal is ~2 years away. The maths is twenty lines; it can return any time. It just should not compete with ingestion for build order. |
| **Net worth monthly snapshots** | Manual data entry twelve times a year, feeding a number no weekly decision depends on. Revisit once ingestion makes it cheap to populate. |
| **Twelve separate month tabs** | Collapsed into one month view with a period selector. The workbook needed twelve sheets because a spreadsheet cannot filter; a database can. Built that way: the Month screen, one month at a time with arrows (workbook views plan S5b–S12b). |
| **50/30/20 split** | Not built. Originally demoted to a report page, because the coach's proven-floor targets are better guidance than a generic ratio. On 2026-09-22 the owner was offered it as a workbook view and did not choose it. |

The retirement and net-worth deferrals stand after the workbook views plan. Net worth
would need 222 typed numbers a year (17 line items × 13 columns), which
strengthens the case.

**No longer deferred: the Paycheck Budget view.** It was deferred as
"superseded — weekly is the primary lens; a third cadence alongside weekly and
monthly is a maintenance cost with no new information." On 2026-09-22 the owner
chose it, and the workbook's Bill Calendar, from a list of workbook tabs. Both are now
built (workbook views plan S15b and S15c). How a pay period
is found and a bill split across it is formula decision F15: on 2026-09-23
the owner chose to find the period from the pay schedule and divide a monthly
bill by the pay frequency.

Deferring these frees the build order for the ingestion pipeline and the coach,
which is where all the value is concentrated.

## What was added, and why it earns its place

| Added | Why |
|---|---|
| **Savings coach** | The reason the app beats the spreadsheet. A spreadsheet records; this argues. |
| **Weekly as primary** *(changed 2026-09-22)* | First written as "how the user actually thinks; the workbook's month-first structure was a spreadsheet constraint, not a preference." Since then the owner asked for the workbook, whose money lands on month tabs, and when asked which screen should open first they chose **Month**. Week stays one tap away, and weekly limits still belong to the coach. |
| **Snowball / avalanche** | The workbook never rolls a cleared debt's payment forward, so it reports 2034. Redirecting that money is worth years — the single largest number this app can move. |
| **Sankey** | The only chart that shows what is left over as its own band, next to what was spent. |
| **Excel + PDF export** | Data is never trapped. Also the answer to "can I trust this?" — every figure is exportable and checkable. |
| **AI in every screen** *(2026-09-24)* | The owner's ask. A coach that words the engine's findings, forecasts, reports, Ask, suggestions in Review and typed entry in plain language, on Google Gemini's free tier first (ADR 0004). It never supplies a number (ADR 0005). |
| **Forecasting and comparisons** *(2026-09-24)* | The owner's ask. "Am I going to make it this month?" and "what did I do last month?" are the two questions a monthly sheet cannot answer. |
| **Help and Getting started** *(2026-09-24)* | The owner's ask: setup "without feeling overwhelmed or lost". |

## Phases

Each phase ends with something usable. Phases 1-3 are what replace the
spreadsheet; everything after is addition.

**Phase 0 — Foundation** ✅ *done*
Engineering standard, enforced gates, money primitives, golden harness,
debt amortization verified against the workbook, savings-goal maths.

**Phase 1 — Data in** ✅ *built; ends when the owner runs it*
Supabase project, schema with RLS, card CSV and Rogers PDF import, dedupe,
the review queue, merchant rules that learn. Its "Ends with" waits on the
owner pasting migrations 0003 onwards into the hosted project (HANDOFF.md).
Ends with: a real statement imported and categorised.

**Phase 2 — Weekly truth** ✅ *built; the contribution grid is Reports → Habits (A18)*
Weekly rollups in the engine, the weekly screen, categories, budget vs. actual,
the contribution grid. Ends with: the real answer to "how am I doing this week".

**Workbook views** ✅ *built 2026-09-23 (owner's answer, 2026-09-22: ahead of the coach)*
Month, Setup and Bills, Year and Home, Week in the workbook's shape, Paycheck, Bill
Calendar, Savings funds, Debts — in the order of `docs/workbook-views-plan.md` §8.
Pulls forward from later phases only what these need: bills and recurring
amounts from Phase 5 (not reminders or the forecast; the Bill Calendar screen
is a workbook view), charts from Phase 6 (not the Sankey or export), savings
funds and the debt screen from Phase 7 (not net worth or retirement).
The coach is not wasted by waiting: it will read the same month figures.
Ends with: the owner's statement filling the workbook's month, year and setup views.

**The AI-first phase** ✅ *built 2026-09-28 (the owner's list of 2026-09-24; `docs/ai-first-plan.md`); ends when the owner runs it (HANDOFF §3)*
Realises the coach (Phase 3) and the reports (Phase 6), with the forecast
from Phase 5 and the provider interface, failover and natural-language entry
from Phase 4. The AI helper and five AI services, free Gemini first (ADR
0004); the Coach tab, its cards in the engine's figures and the AI's words
(ADR 0005), what to cut in weeks sooner to flying, the Sunday check-in with
its questions and one-tap weekly limit, and money quotes from a verified
library; comparisons with last month on every period screen; the Forecast;
Reports with trends, shops, subscriptions, habits, Save as PDF and a CSV;
suggestions in Review, "just type it" and receipts through the helper; Ask;
Help, One-time updates and Getting started; a mobile pass, a critical
review of the whole app, and a full test pass. Not in it: the due reminders,
the Sankey, the Excel workbook.
Ends with: a Coach that argues with the owner in plain words, every figure
from the engine, on a free AI tier, and a report worth showing someone.

**Phase 3 — The coach** ✅ *built by the AI-first phase*
Weekly limits, proven-floor targets, savings capacity, interrogation loop,
tradeoff framing in flight hours, goal tracking.
Ends with: a Sunday check-in that argues with the user.

**Phase 4 — Photos and natural language** ✅ *built by the AI-first phase: the AI helper with five services and failover, "just type it", receipts through the helper; deployed by the owner (HANDOFF §3)*
Provider interface, the picker, failover, receipt capture, typed entry.
Ends with: three ways in, one review queue.

**Phase 5 — Commitments** 🟡 *bills, recurring amounts, the Bill calendar and the forecast built; due reminders not*
Bills, recurring, the calendar, due reminders, forecast.
Ends with: nothing is a surprise.

**Phase 6 — Seeing it** 🟡 *charts, Reports, trends, Save as PDF and CSV built; the Sankey and the Excel workbook not*
Sankey, charts, reports, Excel and PDF export.
Ends with: a report worth showing someone.

**Phase 7 — The rest of the workbook** 🟡 *snowball/avalanche, savings funds and many goals built; net worth and retirement deferred, above*
Snowball/avalanche, sinking funds beyond the flying goal, net worth,
retirement. Ends with: full parity, plus everything the workbook could not do.

## Known risks

~~**react-native-web and rich output.**~~ **Resolved 2026-09-21.** The stack
moved to a web-first Vite + React PWA (ADR 0001). The Sankey, the contribution
grid and the export pipeline are now ordinary DOM and SVG. Cost of the change
was one module — `app-client` — with all 25 tests untouched, because no test
ever knew what the UI was.

**The debt-versus-goal split is unresolved.** The user has debt and a $30,000
goal, and every dollar goes to one or the other. The coach cannot advise on the
split until real balances exist. Open question for Phase 3. *(2026-09-24: the
AI-first phase does not settle it. The coach reports the debt-free date and
the flight date side by side and never advises moving money between them.)*

**Free-tier LLM churn.** Providers change terms and limits without notice. The
provider interface is the mitigation; the deterministic path handling ~99% of
volume is the reason an outage is an inconvenience rather than an outage.
*(2026-09-24: the interface is the `ai` helper, with a fixed list of models,
failover across five services, daily limits and cooldowns (ADR 0004), and
every AI surface has the app's own words underneath. One listed model,
`gemini-2.5-flash`, is due to be shut down in October 2026, which is why
`read-receipt` moves off it first; it now defaults to
`gemini-3.5-flash-lite`.)*

**Thin history.** *(added 2026-09-24)* The owner's records start on
8 August 2026. Baselines, trends and forecast ranges need three to six
complete months, so until about November they say "not enough months yet"
or "rough" rather than inventing a figure (`docs/ai-first-plan.md` F24).
