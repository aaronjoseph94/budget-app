# Roadmap

Last revised: 2026-09-22

## What this project is

Not a spreadsheet port. The workbook is the seed data and the test oracle; it
is no longer the specification — **with one exception, added 2026-09-22.** The
owner asked for the app to look and work like their Workbook workbook (the same
28-sheet file), so for the look and behaviour of the Workbook views they chose it
is the specification again: Month, Setup and Bills, Year and Home, Week,
Paycheck, Bill Calendar, Savings and Debts (`docs/workbook-plan.md`). It is still
not the specification for its arithmetic mistakes (divergence D7) or for the
tabs that stay deferred below.

**A system that ingests spending automatically, tells the truth about it weekly,
and applies pressure toward $30,000 of flight training.**

Everything below is judged against that sentence. A feature that does not serve
it is deferred, however faithfully it reproduces a workbook sheet.

## What is deferred, and why

Scope roughly doubled between "rebuild the workbook" and now. Adding without
cutting is how nothing ships. These are deferred, not deleted:

| Deferred | Why |
|---|---|
| **Retirement projection** (Financial Freedom sheet) | A 35-year horizon while the live goal is ~2 years away. The maths is twenty lines; it can return any time. It just should not compete with ingestion for build order. |
| **Net worth monthly snapshots** | Manual data entry twelve times a year, feeding a number no weekly decision depends on. Revisit once ingestion makes it cheap to populate. |
| **Twelve separate month tabs** | Collapsed into one month view with a period selector. The workbook needed twelve sheets because a spreadsheet cannot filter; a database can. To be built that way in the Workbook plan (S5b); not built yet. |
| **50/30/20 split** | Not built. Originally demoted to a report page, because the coach's proven-floor targets are better guidance than a generic ratio. On 2026-09-22 the owner was offered it as a Workbook view and did not choose it. |

The retirement and net-worth deferrals stand after the Workbook plan. Net worth
would need 222 typed numbers a year (17 line items × 13 columns), which
strengthens the case.

**No longer deferred: the Paycheck Budget view.** It was deferred as
"superseded — weekly is the primary lens; a third cadence alongside weekly and
monthly is a maintenance cost with no new information." On 2026-09-22 the owner
chose it, and Workbook's Bill Calendar, from a list of Workbook tabs. Both are now
in the build (Workbook plan S15b and S15c); neither exists yet. How a pay period
is found and a bill split across it is formula decision F15, still open.

Deferring these frees the build order for the ingestion pipeline and the coach,
which is where all the value is concentrated.

## What was added, and why it earns its place

| Added | Why |
|---|---|
| **Savings coach** | The reason the app beats the spreadsheet. A spreadsheet records; this argues. |
| **Weekly as primary** *(changed 2026-09-22)* | First written as "how the user actually thinks; the workbook's month-first structure was a spreadsheet constraint, not a preference." Since then the owner asked for Workbook, whose money lands on month tabs, and when asked which screen should open first they chose **Month**. Week stays one tap away, and weekly limits still belong to the coach. |
| **Snowball / avalanche** | The workbook never rolls a cleared debt's payment forward, so it reports 2034. Redirecting that money is worth years — the single largest number this app can move. |
| **Sankey** | The only chart that shows what is left over as its own band, next to what was spent. |
| **Excel + PDF export** | Data is never trapped. Also the answer to "can I trust this?" — every figure is exportable and checkable. |

## Phases

Each phase ends with something usable. Phases 1-3 are what replace the
spreadsheet; everything after is addition.

**Phase 0 — Foundation** ✅ *done*
Engineering standard, enforced gates, money primitives, golden harness,
debt amortization verified against the workbook, savings-goal maths.

**Phase 1 — Data in** ← *next, and the bottleneck for everything*
Supabase project, schema with RLS, card CSV/XLSX import, dedupe, the review
queue, merchant rules that learn. *Blocked on: a free Supabase account.*
Ends with: a real statement imported and categorised.

**Phase 2 — Weekly truth**
Weekly rollups in the engine, the weekly screen, categories, budget vs. actual,
the contribution grid. Ends with: the real answer to "how am I doing this week".

**Workbook views** ← *next, ahead of the coach (owner's answer, 2026-09-22)*
Month, Setup and Bills, Year and Home, Week in Workbook's shape, Paycheck, Bill
Calendar, Savings funds, Debts — in the order of `docs/workbook-plan.md` §8.
Pulls forward from later phases only what these need: bills and recurring
amounts from Phase 5 (not reminders or the forecast; the Bill Calendar screen
is a Workbook view), charts from Phase 6 (not the Sankey or export), savings
funds and the debt screen from Phase 7 (not net worth or retirement).
The coach is not wasted by waiting: it will read the same month figures.
Ends with: the owner's statement filling Workbook's month, year and setup views.

**Phase 3 — The coach** *(moved behind the Workbook views)*
Weekly limits, proven-floor targets, savings capacity, interrogation loop,
tradeoff framing in flight hours, goal tracking.
Ends with: a Sunday check-in that argues with the user.

**Phase 4 — Photos and natural language**
Provider interface, the picker, failover, receipt capture, typed entry.
Ends with: three ways in, one review queue.

**Phase 5 — Commitments**
Bills, recurring, the calendar, due reminders, forecast.
Ends with: nothing is a surprise.

**Phase 6 — Seeing it**
Sankey, charts, reports, Excel and PDF export.
Ends with: a report worth showing someone.

**Phase 7 — The rest of the workbook**
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
split until real balances exist. Open question for Phase 3.

**Free-tier LLM churn.** Providers change terms and limits without notice. The
provider interface is the mitigation; the deterministic path handling ~99% of
volume is the reason an outage is an inconvenience rather than an outage.
