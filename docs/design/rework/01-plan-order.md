# PRD 01 — Plan order: Week · Month · Year, Paycheck a screen of its own

2026-10-08. Owner decision 1 of six (binding): "Plan order: A Week · Month ·
Year with Paycheck as its own screen". Decision 2: the opening screen stays
the Month. Recorded as ADR 0014.

## Problem statement

The switch at the top of the Month read Month · Week · Pay · Year: four
segments in the workbook's tab order, crowding a 320 px phone at large
text, with Pay (a view by payday) sitting among three calendar views. The
sidebar's Plan group ran in yet another order (Month, Week, Paycheck, Bill
calendar, Year), so the same five screens were listed two ways.

## Solution

One order everywhere, shortest period first. The switch reads Week · Month
· Year. Paycheck leaves the switch and is a screen of its own under Plan,
beside Bill calendar; it keeps its address, screen and Help. The sidebar's
Plan group reads Week, Month, Year, Paycheck, Bill calendar, and More's Plan
group follows it. The Month still opens first.

## User stories

1. As the owner, I want the switch to read Week · Month · Year, so that its
   order tells me what each segment is.
2. As the owner, I want Paycheck in the sidebar beside Bill calendar, so that
   I find it where the other screens of their own are.
3. As the owner, I want `#/paycheck` and its Help article to keep working, so
   that nothing I bookmarked or learned is lost.
4. As a keyboard user, I want the arrow keys, Home and End to move along the
   three segments in the order shown, wrapping at each end.
5. As a phone user, I want the Month lit for the Week and the Year, and More
   lit for Paycheck, so that the bottom bar says where I came from.
6. As a screen-reader user, I want the switch still named "Views" with the
   showing view marked `aria-current="page"`.

## Implementation decisions

- The switch's items are a list of three; `current` is one of the three.
  No new seam: the switch stays a `nav` of links to bare addresses.
- Paycheck's screen drops the switch and nothing else; its header already
  names it.
- The sidebar's Plan group and More's Plan group are reordered in their
  tables; the phone bar's "lit tab" rule treats Paycheck as reached through
  More.
- ADR 0006 and ADR 0011 are not edited; ADR 0014 amends them.

## Testing decisions

- Tests run through the shell at the addresses (`period-switch.test.tsx`,
  `shell.test.tsx`), as the existing ones do: what is drawn, in what order,
  what each link names, which tab is lit. No test reaches into a component.
- The Help search test keeps asserting the article titles the index shows.

## Out of scope

- The Settings rework (PRD 02), the copy cut and the Help rewrite (later waves).
- Any change to what Paycheck shows or counts (F15 stands).

## Done when

- `./scripts/gates.sh full` prints `status=GREEN`.
- At 390 px the three segments fit without the edge fade; at 1440 px the
  sidebar's Plan group reads Week, Month, Year, Paycheck, Bill calendar.
- No test, Help article or Mockup A note names the old order.
