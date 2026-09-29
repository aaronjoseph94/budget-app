# ADR 0011 — A sidebar from 1024px, a rail from 768px, the phone bar below

**Date:** 2026-09-29 · **Decided by:** the engineer under the owner's
2026-09-29 instruction (quoted in ADR 0010) · **Status:** accepted
**Amends:** ADR 0006, whose wide bar this replaces; its phone bar, its
Month · Week · Pay · Year switch, its More groups and its addresses stay
**Design:** `docs/design/mockup-a/Sidebar.dc.html`, `Topbar.dc.html`, and
`design-review.md` P1 items 1, 2 and 4

## Context

ADR 0006 gave a wide screen one bar across the top: Month · Week · Coach ·
Forecast · Reports · Savings · Debts · Review · Add · More, with Paycheck,
Year, the Bill calendar and Setup reached through the switch or More.

Mockup A, which the owner asked for on 2026-09-29, puts a 248px sidebar
on the left instead, grouped Plan · Money · Coach · Inbox · Setup, with
the main goal and the owner's name and Sign out at its foot, and a top
bar in the white panel holding a sidebar toggle, a breadcrumb, a "Search
or jump to… ⌘K" box and a primary "+ Add".

The design review found three things to settle first:

1. **Sixteen items do not fit.** At 900px tall three groups scroll out of
   sight. It offers two fixes: Plan open and the other groups as
   disclosures that remember their state, or All transactions and Help
   moved into a menu under the user's name.
2. **Ask, the check-in and AI settings have no item.** They light Coach
   or Settings, and their only way back is the breadcrumb.
3. **The Review count** is orange in the sidebar and amber on the banner.

## Decision

**Three widths.**
- **From 1024px, the sidebar** (248px): the brand, the five groups, the
  main-goal card and the user row with Sign out.
- **From 768 to 1023px, a rail** (72px): the same sixteen items as icons,
  each with its name as its accessible name and tooltip, the groups
  separated by a rule. The sidebar toggle folds the sidebar to this rail
  on a wide screen too, remembered on the device.
- **Below 768px, the phone bar** of ADR 0006, Month · Coach · Add ·
  Review · More, unchanged. No sidebar is built for a phone.

**The groups**, as the mockup draws them:
Plan (Month, Week, Paycheck, Bill calendar, Year) · Money (Savings, Debts,
All transactions) · Coach (Coach, Forecast, Reports) · Inbox (Review,
Add) · Setup (Setup, Settings, Help).

**P1 item 1, the first of the review's two fixes: Plan open, the others
disclosures.** Each of Money, Coach, Inbox and Setup is a button that
opens and closes its list and says which it is (`aria-expanded`). Its
state is remembered on the device, in browser storage read and written
inside try/catch, so a private window or blocked storage just forgets.
Until the owner chooses, a group starts open when it holds the screen
showing, so the lit item is never hidden. A closed Inbox carries the
Review count on its own button. Why this rather than the user menu:
every screen keeps a named place in the sidebar, one click from the
group; a menu would hide All transactions and Help behind a click that
names neither, and the owner reads the ledger often.

**P1 item 2.** Ask and the check-in light Coach, and AI settings and
Getting started light Settings (which links to it). The breadcrumb names
the parent, "Coach › Ask", "Coach › Check-in", "Settings › AI settings";
every other screen reads "Budget › Month" and so on. Ask gains the
"← Coach" line the check-in already has, and AI settings a "← Settings"
line, so the way back is on the page, not only in the bar.

**P1 item 4.** The Review count is waiting's amber (ADR 0010), #92400E on
#FEF3C7, in the sidebar, the rail and the phone bar alike; orange stays
Variable's alone.

**The sidebar's icons** are grey, and the lit item's is the accent. The
mockup colours each icon (orange Week, Setup and Settings; sky Forecast
and Reports; teal Bill calendar and Year); ADR 0010 gives orange, sky
and the rest one meaning each, a list, so the icons do not borrow them.

**Search or jump to… ⌘K** is a button that, for now, opens Help with its
search box focused. ⌘K on a Mac and Ctrl+K elsewhere do the same from
any screen. **+ Add** opens Add.

**The main-goal card** is the main goal Coach and Week show: its name,
its percentage from core's `goalProgress`, a bar drawn from those basis
points, and the saved amount of the target, the saved amount being the
goal's fund balance as on the Week (D16). It links to Savings. It is read
only on a screen 1024px wide or more, so a phone fetches nothing for it.

## Why

- The owner asked for the mockup, and the sidebar is its one navigation
  change (README: "a restyle plus one navigation change").
- The rail keeps every screen one tap away on a tablet, where the top
  bar's ten words only fitted small and stacked (FE-1).
- The phone bar was chosen for thumbs (ADR 0006) and nothing in the
  mockup reaches below 768px.

## Consequences

**The owner will notice:** on a computer, the bar of tabs across the top
becomes a sidebar on the left, grouped like More; More itself is no
longer in it, since every screen More lists is in the sidebar or lights
its parent. On an iPad-sized window, a column of icons. On the phone,
nothing changes but the Review count's colour.

**Gained:** Paycheck, Year, the Bill calendar and Setup are one click on a
computer again, where ADR 0006 had moved them into the switch or More.

**Lost:** the bar's width for the screen; the panel is 248px narrower on
a computer, and the folding toggle is how to get it back.

**Revisit** if the owner opens the groups every time: they can start open.
