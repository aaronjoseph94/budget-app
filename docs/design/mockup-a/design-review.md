# Design review — Budget Mockup A (all screens)

Reviewed 2026-09-29 against the screenshot of Mockup A and the source in apps/web/src. Ordered by impact.

## What holds up
- One system everywhere: 248 sidebar → white panel → 64 top bar → 32px title → cards. A person who learns the Month can read every other screen.
- The six list hues (orange, sky, violet, rose, green, amber) mean the same thing on Month, Week, Pay, Year, Calendar, Setup and the Reports pairs. Colour never carries meaning alone: every negative Left keeps its minus sign inside the pill; planned amounts say "planned".
- Copy is the app's own, verbatim, so nothing here promises a sentence the engine cannot write.
- 44px targets on every control; ⌘K search and + Add are always in the same place.

## Fix before build (P1)
1. **Sidebar has 16 items, the phone bar has 5.** The sidebar groups are honest (they mirror More), but three groups scroll off at 900px tall. Fold the sidebar sections: Plan open, others as disclosure groups remembering state; or drop All transactions and Help into the user menu at the bottom. Below 1024px keep today's phone bar (App.tsx PHONE_TABS) — do not build a mobile sidebar.
2. **Ask, Check-in and AI settings have no place in the sidebar.** They light Coach / Settings and use a breadcrumb "Coach › Ask". That works, but the back affordance is only the breadcrumb. Add the "← Coach" line (already in Checkin.dc.html) to Ask, and "← Settings" to AI settings.
3. **Month stat cards say the wrong thing at a glance.** Left to spend is the only card with a bar, so it reads as the hero — but the number the workbook owner checks first is End of month. Either give End of month the accent tint, or move Left to spend to the first slot. Recommendation: order Left to spend · End of month · Start · Spent, and put the Forecast line under End of month (it is there in code, MonthForecastLine.tsx, and missing from the mockup).
4. **The Review banner uses amber while the Review count in the sidebar is orange.** One "waiting" colour: make both amber (#D97706 text on #FEF3C7) and keep orange for Variable expenses only.
5. **The Variable table has two pens.** Budget cells are dotted-underlined (tap to edit) and an empty budget shows a pencil. Keep one: dotted underline everywhere, pencil only in the empty state, and say so in Help. Also the mini bar under each name duplicates the % pill on the card header — on Bills/Subs/Debts where everything is 100% it is noise. Show the mini bar on Variable and Income only.

## Should fix (P2)
6. Stat-card gradients are pretty but the four different tints plus six list hues plus indigo accent is 11 colours on the Month. Consider tinting only the icon tile and leaving the card white; keep the gradient for the one hero card.
7. Year: seven chips selecting one table hides six tables behind clicks; the current app shows all seven at once on a desktop (YearScreen.tsx wide). Offer both: chips on narrow, all tables in a 4-up grid from 1280px.
8. Calendar day cells cap at ~3 bills before they crowd; at 1440 the grid is 7 × 190px. Add "+2 more" after two rows and open the day in a sheet.
9. Forecast "End of September" range bar is decorative here; use chart-specs rangeBar so the figure and the drawing come from the same basis points.
10. Reports Trends and Habits hide the month stepper (correct, per source) but the "So far" pill stays; it should go with it.
11. Coach right column is sticky and taller than the viewport at 900px: the Ask box is below the fold. Move Ask to the bottom of the left column, or make only the goal card sticky.
12. Setup rows: inline-editable name fields with no visible edge rely on hover; add a faint bottom rule (the source has border-b) and a "Saved ✓" toast pattern like the name band.
13. Debts summary: five items on one row wrap awkwardly between 1024 and 1200. Make it 2 × 2 + ring.

## Accessibility
- Tabs (Add, Reports) and the Views switch need arrow-key handling as AddScreen.tsx has; the mockups only show the visual.
- Switches in AI settings are drawn spans; build them as the existing `SWITCH` checkbox with role="switch".
- Dark mode: green/rose/amber inks are lifted (#6EE7B7 etc.) and pass 4.5:1 on #17181C; the sky pill ink #7DD3FC on #16232D is 7:1. Orange #F97316 text on white is 3.0:1 — it is used only for bars and the count badge (white on orange, 3.1:1, large bold) — acceptable but at the edge; use #EA580C for any orange text.
- Every ✨ keeps an sr-only "Written by AI:" in the source; keep that when porting.

## Content
- Sample data is one September; Week and Pay figures were made to agree with it (weekly Restaurants 133.85 of 60 over). Replace with fixtures from the screen tests before demoing.
- Hint copy under stat cards ("Bills, subscriptions, debts and variable") is new; it is not in MonthSummary.tsx. Either add it to the source or drop it.

## Handoff notes
- Every screen: `Sidebar.dc.html` + `Topbar.dc.html` are the shared parts; tokens are the `--*` variables on each screen's root (same list on all).
- `Budget Mockup A.dc.html` holds the token sheet and the screen → source-file map.
