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

---

# §2 — One Settings screen with four tabs; Getting started from Help

**Date:** 2026-10-08 · **Decided by:** the owner (decisions 3 and 6 of six)
· **Status:** accepted
**Amends:** ADR 0011 (the sidebar's Setup group) and the Settings and
Setup screens of plan §8.
**Design:** `docs/design/rework/02-one-settings.md`

## For the owner

- **Settings** is one screen with four tabs: **Lists** (what Setup was:
  your name, your lists, bills and pay days), **Budgets & goals**, **AI**
  (what AI settings was) and **Account** (shops filed by themselves, AI
  apps, Sign out). The tab you are on is in the address, so a refresh and
  the back gesture keep it; the sidebar's Settings opens the tab you last
  saw.
- Old links still work: `#/setup` opens Settings › Lists and `#/ai` opens
  Settings › AI.
- The sidebar's last group is **More**: Settings and Help.
- **Getting started** opens by itself on the first run, and otherwise
  from Help's **Start here**, which says how many steps are done. It is no
  longer on Settings or More.

## Context

> 3. One Settings screen with four tabs: Lists · Budgets & goals · AI ·
>    Account. The Setup screen and name go away. Sidebar group "Setup"
>    becomes "More": Settings, Help.
> 6. Getting started stays as a guide for first run only, opened from Help
>    and on first run; no Settings card for it.

Three screens set the app up (Setup, Settings, AI settings), plus a guide,
under a sidebar group also called Setup, and Settings held three cards
that only linked to the others. They read as the same thing.

## Decision

- One `SettingsScreen` with a tab bar drawn as Reports draws its own
  (`role=tablist`, arrow keys, one tab stop). The tab is the address's
  param (`#/settings/<tab>`), read only as one of the four ids
  (`settings/tab.ts`); a bare `#/settings` opens the tab last seen on this
  device, kept as Reports keeps its tab.
- `#/setup` and `#/ai` read as their tabs (`OLD` in `nav.ts`), and the new
  address is written over the old one. `setup` leaves the screen ids.
- `ai` stays a screen id that is never drawn, because `ai/LineLink.tsx`
  and `AiSettingsScreen.tsx`, the AI tree's files until the two merge,
  still name it; the AI tab draws `AiSettingsScreen` through
  `settings/AiTab.tsx`, which hides its title row and "← Settings" by
  their place. Both go with the merge, when the screen takes an
  `embedded` prop.
- Settings' `?` opens the showing tab's article (`SETTINGS_TAB_HELP`).
- The sidebar group is **More**; a phone's More screen groups the same
  two as **Settings and help**, since a group called More inside More
  would say nothing.
- Getting started's parent is Help: its crumb reads Help › Getting
  started, Help lights in the sidebar, and Help's Start here carries
  **Open Getting started** with the progress line More and Settings once
  showed. The first run still opens it by itself (`FirstRun`).
- "Lists", not "Setup", in every sentence that points there; "Open
  Lists" on the Month, Paycheck, Bill calendar, Savings and the Year.

## Considered

- **B: keep two screens and rename Setup to Lists.** Two screens for one
  job, and Settings' link cards would stay.
- **The tab in local state alone, as Reports.** A refresh and the back
  gesture would lose it, and a link could not open a tab; the address is
  the one source of truth here.
- **A plain redirect that leaves `#/setup` in the address bar.** A
  bookmark made after would keep an address nothing else uses; the
  rewrite costs one effect.

## Consequences

- `SettingsScreen` takes `tab`; Lists and AI are lazy parts of it, so
  opening Account or Budgets fetches neither. `ListsTab`'s band is an h2
  and has no `?` or "‹ More" of its own.
- Every test, Help article, Mockup A note, `HANDOFF.md` and
  `docs/setup.md` that named Setup, AI settings or the Setup group says
  the new names. The AI articles' first steps changed in both trees
  (`Open **Settings**, then **AI**` here); the merge keeps one.
