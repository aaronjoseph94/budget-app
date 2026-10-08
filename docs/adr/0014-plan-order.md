# ADR 0014 — Plan runs Week · Month · Year; Paycheck is a screen of its own

**Date:** 2026-10-08 · **Decided by:** the owner (decision 1 of six, quoted
below) · **Status:** accepted
**Amends:** ADR 0006 (its Month · Week · Pay · Year switch) and ADR 0011
(the Plan group's order). The addresses, the phone bar and the Month as
the opening screen (decision 2: "Month (today)") stay.
**Design:** `docs/design/rework/01-plan-order.md`

## For the owner

- The switch at the top of the Week, the Month and the Year now reads
  **Week · Month · Year**: shortest period first, then longer.
- **Paycheck** is no longer in that switch. It is its own screen under
  **Plan** in the sidebar, beside **Bill calendar**, and under **More** on a
  phone. `#/paycheck` still opens it, and its Help article is unchanged.
- The sidebar's Plan group reads **Week, Month, Year, Paycheck, Bill
  calendar**. The Month still opens first.

## Context

The owner chose, on 2026-10-08, among three options for the Plan screens:

> 1. Plan order: A Week · Month · Year with Paycheck as its own screen

The switch had four segments in the workbook's tab order, Month · Week ·
Pay · Year (ADR 0006). Four segments were the most that fit a 320 px
phone, with "Year" under the edge fade at large text (e2e-plan-11), and
Pay sat among three everyday views although it is a different kind of
thing: a view by payday rather than by calendar, which most owners open
rarely.

## Decision

- The switch holds the three calendar views in order of length, Week ·
  Month · Year, so the order says what each segment is.
- Paycheck leaves the switch but keeps everything else: its screen, its
  address, its Help, and the workbook's Paycheck Budget sheet behind it,
  whose rule the owner chose on 2026-09-23 (`docs/formula-decisions.md`,
  F15). On a phone it lights **More**, as every screen reached through More does.
- The sidebar's Plan group follows the switch, then lists the two screens
  of their own: Paycheck, then Bill calendar.

## Considered

- **B: Week · Month · Pay · Year.** Keeps four segments and only reorders
  them; Pay would still sit among the calendar views, and "Year" would
  still crowd a 320 px phone at large text.
- **C: remove Paycheck.** The workbook has the sheet and the owner chose
  its rule (F15); removing a screen the owner asked for to simplify a
  switch is the wrong trade.

## Consequences

- `PeriodSwitch.tsx` draws three links and takes `current` as one of
  `week`, `month` or `year`. The phone bar lights the Month for the Week
  and the Year, and More for Paycheck.
- Every test, Help article and Mockup A note that named the old order says
  the new one. ADR 0006 and ADR 0011 are left as written: this ADR amends them.
