# Mockup A — build notes

Decisions made while building the README's steps, each the engineer's
under the owner's 2026-09-29 instruction (ADR 0010). Larger ones are ADRs.

## 2026-09-29 — Step 1, tokens

- **Token names kept, values changed** (ADR 0010), so screens no step has
  reached yet follow the new palette. New names: `canvas`,
  `canvas-muted`, `primary-soft`, `primary-tint`, `track`,
  `destructive-foreground`, the `bills`, `subscriptions` and `debts` sets,
  a `-tile` for every list, `variable-large`, and the `waiting` set.
- **Radii** map onto the classes screens already use: `rounded-xl` 16
  (cards), `rounded-lg` 12 (tiles), `rounded-md` 10 (buttons, fields).
- **The page is white on a phone.** Mockup A's muted grey reads 4.40:1 on
  its canvas, so the canvas is only the frame around the panel, from
  768px; on a phone the screen is the panel.
- **`owed` is grey** until the Month and Year move bills, subscriptions and
  debts to their own hues (steps 3 and 5).
- **Serif italic titles stay for now.** Setup, Savings, Debts and the Year
  set their titles in `font-serif italic`, the workbook's look but not
  one of the two retired font files. Each goes with its screen's step
  (11, 9, 9, 5).
- **Card shadows stay for now.** Mockup A has none; `Card` keeps shadcn's
  `shadow-sm` until the steps restyle the screens that use it.

## 2026-09-29 — Step 2, navigation

See ADR 0011: the sidebar, the rail, the disclosure groups (the review's
first fix, not the user menu), the breadcrumb's parents, the grey icons
and the amber Review count.

- **Copy.** The sidebar and top bar use the app's own names for every
  screen. "Search or jump to…", "⌘K" and "Toggle sidebar" are the
  mockup's, new to the app, and needed for the controls the README asks
  for.
