# Handoff: Budget · Mockup A redesign (whole app)

## Overview
A visual redesign of aaronjoseph94/budget-app (apps/web) in the "Mockup A" style: a left sidebar grouped like the More screen, a white panel with a top bar (breadcrumb, ⌘K search, + Add), tinted stat cards, list tables with icon tiles and mini bars, and charts in six list hues. Every screen of the app is covered. Copy is the app's own; the engine, data flow and invariants in CLAUDE.md are unchanged. This is a restyle plus one navigation change (sidebar from 1024px); it is not a rewrite.

## About the design files
The .dc.html files in this bundle are **design references written in HTML**. They open in a browser (double-click any one; they share support.js, Sidebar.dc.html and Topbar.dc.html). They are not production code. Recreate them in the existing Vite + React 19 + Tailwind v4 app, using the shadcn-style components already in apps/web/src/components/ui and the token system in apps/web/src/index.css. Keep the three invariants: screens format, never compute; money stays Cents; nothing unreviewed reaches the ledger.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii and copy are final. Sample figures are an invented September 2026; take real figures from the engine and the screen-test fixtures.

## How to use with Claude Code
1. Unzip this folder into the repo, e.g. `docs/design/mockup-a/`.
2. In your existing Claude Code chat, say something like:
   "Read docs/design/mockup-a/README.md, then open the .dc.html files it lists. Restyle the app to match them, one vertical slice per commit, starting with index.css tokens and App.tsx's sidebar, then MonthScreen. Keep every rule in CLAUDE.md and CONSTRAINTS.md; run ./scripts/gates.sh full before each commit."
3. Work in the order below. Each step names the source files to change.

## Build order and source map
| Step | Mockup | Source files | What changes |
| --- | --- | --- | --- |
| 1 | Budget Mockup A.dc.html (token sheet) | apps/web/src/index.css | New neutral scale + six list hues (below). --radius 1rem. Caveat/Comfortaa retire; body face stays the system stack; .tnum everywhere a figure shows. Dark values listed beside each light value. |
| 2 | Sidebar.dc.html, Topbar.dc.html | apps/web/src/App.tsx, screens/MoreScreen.tsx (groups), components/ui/icons.tsx | From 1024px: 248px sidebar with groups Plan · Money · Coach · Inbox · Setup, main-goal card and user row; 72px rail 768–1023; the phone bar (PHONE_TABS) below 768. Top bar: sidebar toggle, breadcrumb, ⌘K "Search or jump to…" (new; can open Help search for now), primary + Add. |
| 3 | Month.dc.html | screens/MonthScreen.tsx, MonthSummary.tsx, MonthCharts.tsx, MonthCoachLine.tsx, MonthForecastLine.tsx, PeriodSwitch.tsx | Four tinted stat cards (Left to spend · End of month · Start · Spent per review P1.3); Block gets icon tile, % pill, tinted thead, mini bar under the name; charts in a right column. |
| 4 | Period.dc.html | WeekScreen.tsx, WeekBlocks.tsx, WeekGoal.tsx, PaycheckScreen.tsx, PaycheckPeriod.tsx, CompareLine.tsx | Spent / Left as stat cards; GoalCard and "How this period is counted" as wide tinted cards; PeriodSwitch as a segmented control. |
| 5 | Year.dc.html | YearScreen.tsx, YearGlance.tsx, YearCharts.tsx | Glance cards in the card style; StartPicker as two select pills; chips on narrow, all seven tables from 1280px (review P2.7). |
| 6 | Calendar.dc.html | CalendarScreen.tsx, CalendarGrid.tsx | Tinted weekday header, per-list coloured left rule, payday pill, today tint, "+N more" after two rows. |
| 7 | Coach.dc.html, Checkin.dc.html, Ask.dc.html | screens/CoachScreen.tsx, CheckinScreen.tsx, AskScreen.tsx, coach/*.tsx, ask/*.tsx | Two-column Coach (insights left, goal card right); check-in answers as 3-up segmented; Ask with a 40px figure in a tinted answer card. |
| 8 | Forecast.dc.html, Reports.dc.html | screens/ForecastScreen.tsx, forecast/*.tsx, ReportsScreen.tsx, reports/*.tsx | Stat cards for Safe to spend / End of month; Section cards in a two-column grid; segmented tabs; use chart-specs for every drawing. |
| 9 | Savings.dc.html, Debts.dc.html | SavingsScreen.tsx, GoalActions.tsx, DebtsScreen.tsx, DebtStrategies.tsx | Goal cards with an amber title strip; debt summary as one wide card with a violet ring; the chosen plan tinted. |
| 10 | Add.dc.html, Review.dc.html, Ledger.dc.html | AddScreen.tsx, add/JustTypeIt.tsx, ReviewScreen.tsx, review/*.tsx, LedgerScreen.tsx | Segmented tabs with icons; row cards with select + Approve + ✕ on one line; unreadable lines in an amber card. |
| 11 | Setup.dc.html, Settings.dc.html, AI Settings.dc.html | SetupScreen.tsx, SetupPlans.tsx, SetupPay.tsx, SettingsScreen.tsx, LearnedShops.tsx, AiSettingsScreen.tsx, ai/*.tsx | Accent-tint header with the name field; list cards with column headers and inline inputs; real SWITCH checkboxes for toggles. |
| 12 | Help.dc.html, Start.dc.html, Sign In.dc.html | HelpScreen.tsx, help/*.tsx, GettingStartedScreen.tsx, start/*.tsx, auth.tsx | Index + article side by side; step bar with ringed current segment; centred sign-in card. |

## Design tokens
Light → dark.
- canvas #F4F4F6 → #0F1013 · card #FFFFFF → #17181C · border #E5E7EB → #2A2C33 · input edge #D1D5DB → #3A3D46 · hover #F9FAFB → #1F2026
- ink #111827 → #F3F4F6 · muted #6B7280 → #9CA3AF · faint #9CA3AF → #6B7280
- accent (indigo) #4F46E5 → #818CF8 · accent-soft #EEF2FF → #1E1B4B · accent-tint #EEF0FF → #181A2E (alternate accents in Month.dc.html: teal, violet, rose)
- variable/orange #F97316, tile #FFEDD5 → #3A2210, thead #FFF7ED, pill ink #C2410C → #FDBA74
- bills/sky #0EA5E9, tile #E0F2FE → #0F2A3A, thead #F0F9FF, pill ink #0369A1 → #7DD3FC
- subscriptions/violet #8B5CF6, tile #EDE9FE → #2E1065, pill ink #6D28D9 → #C4B5FD
- debts/rose #E11D48, tile #FFE4E6 → #3D1A22, tint #FFF1F2, pill ink #BE123C → #FDA4AF
- income/green #10B981, tile #D1FAE5 → #123326, tint #ECFDF5, ink #047857 → #6EE7B7
- savings/amber #F59E0B, tile #FEF3C7 → #3D3112, tint #FFFBEB, ink #B45309 → #FCD34D
- waiting banner: bg #FFFBEB, border #FDE68A, ink #92400E, icon #D97706 on #FEF3C7
- negative Left: rose pill #E11D48 with #FFFFFF text, padding 4px 10px
- Type: system stack (ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI'); h1 32/700 −0.02em; card title 18/600; stat value 32/700; body 15; table 15; hint 14; label 12–13 muted; all figures tabular-nums.
- Radius: panel/cards 16, buttons/inputs 10, icon tiles 12, pills 999. Borders 1px. No card shadows (sign-in card only: 0 10px 30px rgba(17,24,39,.06)).
- Spacing: sidebar 248 (rail 72), panel margin 12, top bar 64, content padding 28, card grid gap 20, stat grid gap 16, card padding 22/24, table cell 12–14/20. Targets 44px.

## Interactions kept from the source
Month/Week/Pay/Year switch; prev/next steppers; tap a row for its charges (Sheet); tap a budget to type it inline; ? HelpButton beside every title; Review approve / reject / Approve these N; Add tabs with arrow keys; Reports tabs with rememberTab; Coach dismiss + "Why am I seeing this?"; check-in Planned/Impulse/Needed and one-tap weekly limit; What-if chips. Hover = --hover fill; focus = existing focus-visible ring (--ring = accent).

## Review before building
See design-review.md in this folder: P1 items should land as part of steps 2–3.

## Files
- Month.dc.html
- Period.dc.html
- Year.dc.html
- Calendar.dc.html
- Coach.dc.html
- Checkin.dc.html
- Forecast.dc.html
- Reports.dc.html
- Ask.dc.html
- Savings.dc.html
- Debts.dc.html
- Add.dc.html
- Review.dc.html
- Ledger.dc.html
- Setup.dc.html
- Settings.dc.html
- AI Settings.dc.html
- Help.dc.html
- Start.dc.html
- Sign In.dc.html
- Sidebar.dc.html
- Topbar.dc.html
- Budget Mockup A.dc.html
- support.js (runtime the .dc.html files need to open)
- design-review.md, mockup-a-style.md, screens.md (screen-by-screen copy inventory read from the source)
