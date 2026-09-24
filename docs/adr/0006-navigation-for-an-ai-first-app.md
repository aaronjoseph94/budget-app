# ADR 0006 — Navigation for an AI-first app

**Date:** 2026-09-24 · **Decided by:** the engineer under the owner's
2026-09-24 instruction to proceed without questions · **Status:** accepted
**Extends:** ADR 0003 (hand-rolled hash navigation), which stays: no router
library, addresses in the `#hash`, anything unreadable opens the Month
**Plan:** `docs/ai-first-plan.md` §2.1 and slice A05

## Context

On 2026-09-24 the owner asked for the app to be "Ai first", with forecasting,
reports, help and an expanded setup (items 2, 3, 5 and 6), and for it to be
mobile friendly (item 9). The plan adds seven places to go: the Coach, the
Sunday check-in, Forecast, Reports, Ask, Help and Getting started, plus AI
settings.

The phone's bottom bar has five tabs today: Month · Week · Add · Review ·
More. Five is what fits at 320 px with 44 px targets and a word under each
icon. The wide bar has eleven. Adding seven more to either does not fit, and
More's flat list of eight would become a list of fifteen.

ADR 0003's parser knows one kind of period per screen: a month (`YYYY-MM`)
on the Month, Year and Bill calendar, and a day (`YYYY-MM-DD`) on the
Paycheck. The new places need a report's month, a help topic, and the
check-in under the Coach; the Week has no address for its week at all, so a
refresh returns to this week.

**Fixed, and not reopened:** the Month opens first. The owner chose that on
2026-09-22 (`docs/workbook-views-plan.md` §9a, decision 1).

## Options

| Question | Options | Chosen |
|---|---|---|
| What leaves the phone bar for the Coach | Week; Review; Add | **Week** |
| How the Week stays close | An item in More; **a switch under the title** | The switch |
| The switch's items | Month · Week · Year; **Month · Week · Pay · Year** | Four |
| More | One long list; **four groups** | Groups |
| The address's second segment | A second field per kind; **one `param`, read per screen** | One `param` |

## Decision

**The phone bar** is Month · Coach · Add · Review · More. The Coach takes
the Week's place; Review keeps its count; Add stays in the middle within
thumb reach.

**The wide bar** (icons with small words from 768 px, words beside them from
1280 px) is Month · Week · Coach · Forecast · Reports · Savings · Debts ·
Review · Add · More. Paycheck and Year are in the switch; the Bill calendar
and Setup are in More.

**A switch, Month · Week · Pay · Year,** sits under the title of those four
screens, as four links to their own addresses. Each opens that view as it
opens from anywhere else (this month, this week, this pay period, this
year); a switch is one tap to the other view, not a way to carry a date
across views, which would need rules for which week a month means. Four
segments are about 72 px each at 320 px and 44 px tall.

**The Bill calendar** gets a calendar button in the Month's header, and an
item in More.

**More has four groups:**
- **Plan:** Paycheck, Bill calendar, Year, Savings, Debts, Forecast.
- **Understand:** Reports, Ask.
- **Set up and help:** Getting started, Setup, AI settings, Settings, Help.
- **Records:** All transactions.

**Addresses.** `nav.ts`'s `period` becomes `param`, whose meaning is the
screen's:

| Address | Param |
|---|---|
| `#/month/2026-09`, `#/year/2026-01`, `#/calendar/2026-09`, `#/reports/2026-08` | a month, `YYYY-MM` |
| `#/paycheck/2026-09-11` | a real day of a pay period |
| `#/week/2026-09-21` | a real day that is a Monday (N46) |
| `#/help/updates` | one of the committed help topic ids (`apps/web/src/help/topics.ts`) |
| `#/coach/checkin` | the word `checkin` alone |
| `#/coach`, `#/forecast`, `#/ask`, `#/help`, `#/start`, `#/ai`, and every other screen | none |

A bare `#/week` still opens this week, and a bare `#/reports` the month the
screen chooses. Anything the parser cannot read in full (an unknown screen,
a topic that is not committed, a Tuesday on the Week, a param on a screen
that takes none, a third segment) opens the Month, as ADR 0003 says.

**Until a screen is built,** its address still parses, and it opens one
line saying the screen is on its way, with a link back to the Month. The
bars and More list only the screens that exist, in their planned places, so
no tab leads to nothing: Forecast and Reports join the wide bar with their
slices (A13, A15), and More's Understand group appears with Reports.

**The Coach screen** is its own chunk. Its first version is the flight
card: a ring from `goalProgress`'s basis points, the hours saved of the
hours the target buys (each `timeEquivalent(...).hours`, whole hours, the
rule F33 writes down for A08), and the amount saved of the target. The
amount saved is the goal fund's balance when the goal is a fund's (D16), as
on the Week and Savings, else the amount typed.

## Why

- **The Week is what the owner uses least of the four views on a phone**:
  the Month opens first and holds the same blocks, and the Coach is the new
  thing the owner asked for. Review cannot move: it is the one human step
  every imported row waits for. Add cannot move: it is the most used action.
- **A switch keeps the Week one tap from the Month**, which a More item
  would not (two taps, and hidden). It also gives the Paycheck and Year a
  place on a phone that is not More.
- **Groups** turn fifteen items into four short lists a non-engineer can
  scan by what they want to do.
- **One param** keeps ADR 0003's parser: one segment, read by a rule per
  screen, with the same fallback.
- **Hiding unbuilt screens** keeps the bars honest while the phase is built
  slice by slice: every commit leaves the app usable, and no tab opens a
  promise.

## Consequences

**The owner will notice:** Week leaves the phone's bottom bar for the
switch under the Month's title; on a wide screen, Paycheck and Year move into
that switch, and the Bill calendar and Setup into More; a new Coach tab.
HANDOFF says so when it is rewritten (A28).

**Gained:** a refresh on the Week keeps its week; every new screen has an
address a link, the back gesture and the home screen can reopen.

**Lost:** the wide bar no longer shows every screen at once. The Bill
calendar is two taps on a wide screen instead of one.

**Revisit** if the owner misses the Week on the phone bar: the Coach and
the Week can trade places in one line of `App.tsx`.
