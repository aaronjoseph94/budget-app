# ADR 0010 — Mockup A replaces the workbook palette and type

**Date:** 2026-09-29 · **Decided by:** the engineer under the owner's
2026-09-29 instruction below · **Status:** accepted
**Replaces:** plan decision 10 (`docs/workbook-views-plan.md` §6.6), the
workbook's colours and its Caveat and Comfortaa faces, which were chosen
there without an ADR
**Design:** `docs/design/mockup-a/` (README, design-review, the `.dc.html`
files) · **Build order:** the README's steps 1–12

## Context

Plan decision 10 drew the app in the workbook's own colours: a pastel band,
header, total, ink, accent and rule for each block, a teal START HERE, the
Year's slate header, and two display faces served from our own origin,
Caveat for the month title and Comfortaa for big numbers. It was measured
for contrast (decision 10 A) but never written as an ADR.

On 2026-09-29 the owner sent a new design, Mockup A, and asked for it:

> "Read docs/design/mockup-a/README.md, then open the .dc.html files it
> lists. Restyle the app to match them, one vertical slice per commit, in
> the README's build order (index.css tokens and the App.tsx sidebar first,
> then MonthScreen). Keep every rule in CLAUDE.md and CONSTRAINTS.md, and
> run ./scripts/gates.sh full before each commit."

Mockup A is a light, neutral desktop app: a grey canvas, white cards with a
1px border and 16px corners, an indigo accent, and six list hues. Its body
face is the system stack the app already uses. The README calls its
colours, type, spacing, radii and copy final.

## Decision

**The workbook palette and faces go.** `apps/web/src/index.css` takes the
README's tokens. Caveat and Comfortaa retire: their `@font-face` rules, the
preload in `index.html`, the files in `apps/web/public/fonts` and the
`font-title` and `font-numbers` classes are removed. Every word is the
system stack; every figure is `.tnum`.

**Token names stay where screens use them; values change.** The shadcn
names (`background`, `card`, `primary`, `muted`, `border`, `input`, `ring`,
`spend`, `income`, …) and the workbook's named sets (`summary`, `title`,
`calendar`, `year`, `setup`, `savings`, `debt`, `home`, `paycheck`) keep
their names and take Mockup A's values, so a screen no step has reached
yet still renders in the new palette. New names are added only where the
design needs something no old name meant (below).

**The neutral scale**, light → dark:

| Token | Light | Dark | Role |
|---|---|---|---|
| `canvas` (new) | #F4F4F6 | #0F1013 | The frame behind the panel, from 768px |
| `background`, `card` | #FFFFFF | #17181C | The panel and cards; on a phone the whole screen is the panel |
| `border` | #E5E7EB | #2A2C33 | Card and panel edges |
| `foreground` | #111827 | #F3F4F6 | Ink |
| `muted-foreground` | #6B7280 | #9CA3AF | Muted words |
| `muted`, `accent` | #F9FAFB | #1F2026 | Hover and quiet fills (shadcn's `accent` is its hover fill) |
| `secondary` | #F3F4F6 | #2A2C33 | Chips, the active tab |
| `track` (new) | #E5E7EB | #2A2C33 | A bar's empty part |
| `primary`, `ring` | #4F46E5 | #818CF8 | Mockup A's accent (indigo), and the focus ring |
| `primary-soft`, `primary-tint` (new) | #EEF2FF, #EEF0FF | #1E1B4B, #181A2E | Accent fills |

**The six list hues keep one meaning each, on every screen.** A hue names
a list, never a mood: orange is Variable expenses wherever it appears
(Month, Week, Pay, Year, Calendar, Setup, Reports), sky is Bills, violet
Subscriptions, rose Debts, green Income, amber Savings. Orange is not used
for "waiting", and amber is not used for a list's warning. Each has an
`-accent` (bars, icons, rules; no text), a `-tile` (icon tile), a `-header`
(table head) and `-band` (a tinted card), a `-rule`, and an `-ink` for
every word and figure on them:

| List | Accent | Tile (light → dark) | Ink (light → dark) |
|---|---|---|---|
| `variable` | #F97316 | #FFEDD5 → #3A2210 | #C2410C → #FDBA74 |
| `bills` (new) | #0EA5E9 | #E0F2FE → #0F2A3A | #0369A1 → #7DD3FC |
| `subscriptions` (new) | #8B5CF6 | #EDE9FE → #2E1065 | #6D28D9 → #C4B5FD |
| `debts` (new) | #E11D48 | #FFE4E6 → #3D1A22 | #BE123C → #FDA4AF |
| `income` | #10B981 | #D1FAE5 → #123326 | #047857 → #6EE7B7 |
| `savings` | #F59E0B | #FEF3C7 → #3D3112 | #B45309 → #FCD34D |

The workbook drew bills, debts and subscriptions alike, as `owed`. Mockup A
gives each its own hue, so `bills`, `subscriptions` and `debts` are new.
`owed` stays, in a neutral grey, until the screens that read it (Month,
Year) move to the three new sets in their own steps; a grey promises
nothing, where borrowing one of the three hues would call bills debts.

**Waiting has its own amber** (design-review P1 item 4): a banner on
#FFFBEB with a #FDE68A edge and #92400E words, and an icon in #D97706 on
#FEF3C7 (dark: #2A2210, #5A4A14, #FCD34D, #3D3112). The Review count uses
it too, in place of the red count and the mockup's orange one.

**Radius** is 1rem. The classes screens already use map onto the README's
radii: `rounded-xl` 16 (cards, panel), `rounded-lg` 12 (icon tiles),
`rounded-md` 10 (buttons, inputs), `rounded-sm` 8.

## Contrast rules

Measured by `apps/web/test/contrast.test.ts` from index.css itself, in
light and dark, for every text token on every surface it is used on:
4.5:1 for text, 3:1 for large text (24px, or 18.66px bold), a control's
edge and the focus ring.

- **Orange text.** #F97316 is 3.0:1 on white, so it is never text. The
  design review's #EA580C is 3.56:1: enough for large text and icons, not
  for body text. So orange words at body size use the pill ink #C2410C
  (5.18 on white, 4.52 on its tile), and #EA580C, as `variable-large`, is
  kept for large orange text and icons.
- **Waiting.** The review's "#D97706 text on #FEF3C7" is 2.86:1, under 4.5
  for the 12px count. The count's figure is #92400E on #FEF3C7 (6.37);
  #D97706 stays for the icon.
- **Muted words** are #6B7280, 4.83:1 on white and 4.63 on the hover fill,
  but 4.40 on the canvas. So muted words never sit on the canvas: on a
  phone the page is white, and the sidebar's group names use
  `canvas-muted`, a darker grey measured on the canvas.
- **A field's edge.** Mockup A's #D1D5DB is 1.5:1 on white, under the 3:1
  a control's only edge needs (FE-5). `input` stays a darker grey that
  passes; the border around a card, which is not a control, is #E5E7EB.
- **A negative Left** is the mockup's rose pill, #FFFFFF on #E11D48, 4.70.
- **Dark mode** lifts every ink (#6EE7B7, #FDA4AF, #FCD34D …); each passes
  4.5 on #17181C and on its own tile. A filled button in dark mode takes a
  dark ink on the lighter fill (#1E1B4B on #818CF8, 5.36), since white on
  #818CF8 is 2.9.

## Why

- The owner chose the design and asked for it in so many words.
- Keeping the token names means each step can land alone: a screen no step
  has reached yet follows the remap and stays readable, and no step has to
  touch every screen at once.
- One meaning per hue lets the colour help without carrying the meaning:
  every list still has its name beside it, and every negative amount its
  minus sign.

## Consequences

**The owner will notice:** the pastel blocks, the teal Setup and the
handwritten month title are gone; the app is white and grey with an indigo
accent, and each list has one colour everywhere.

**Lost:** the workbook's look, which the app kept on purpose since plan
decision 10; the self-hosted fonts' careful loading (N15, and the preload
that kept the title from moving) no longer matters, as nothing loads.

**Divergences from the mockup, all for contrast:** #C2410C for small
orange words; #92400E for the waiting count; a darker field edge; a darker
grey for words on the canvas. Each is recorded above and measured by the
contrast test.
