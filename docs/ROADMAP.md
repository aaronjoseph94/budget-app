# Roadmap

Last revised: 2026-09-21

## What this project is

Not a spreadsheet port. The workbook is the seed data and the test oracle; it
is no longer the specification.

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
| **Paycheck Budget view** | Superseded. Weekly is the primary lens; a third cadence alongside weekly and monthly is a maintenance cost with no new information. |
| **Twelve separate month tabs** | Collapsed into one month view with a period selector. The workbook needed twelve sheets because a spreadsheet cannot filter; a database can. |
| **50/30/20 split** | Demoted to a report page, not a headline. The coach's proven-floor targets are strictly better guidance: derived from what this user has actually achieved rather than a generic ratio. |

Deferring these frees the build order for the ingestion pipeline and the coach,
which is where all the value is concentrated.

## What was added, and why it earns its place

| Added | Why |
|---|---|
| **Savings coach** | The reason the app beats the spreadsheet. A spreadsheet records; this argues. |
| **Weekly as primary** | How the user actually thinks. The workbook's month-first structure was a spreadsheet constraint, not a preference. |
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

**Phase 3 — The coach**
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

**react-native-web and rich output.** Expo's web target is the weakest place to
build a Sankey, a dense contribution grid, and PDF generation. Mitigated by
keeping `chart-specs` free of react-native entirely — the charts are SVG
strings, so only the thin wrapper is platform-specific — and by dynamically
importing the export libraries. Named here so it is monitored rather than
discovered.

**The debt-versus-goal split is unresolved.** The user has debt and a $30,000
goal, and every dollar goes to one or the other. The coach cannot advise on the
split until real balances exist. Open question for Phase 3.

**Free-tier LLM churn.** Providers change terms and limits without notice. The
provider interface is the mitigation; the deterministic path handling ~99% of
volume is the reason an outage is an inconvenience rather than an outage.
