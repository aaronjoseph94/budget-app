# PRD 03 — Brevity: cut the text

2026-10-08. Owner decision 5 of six (binding): "Help shrinks to about 12
short articles." The owner's standing rule for every word on a screen:
"Brevity everywhere: one idea per sentence; a lede is one line or none;
hints ≤ 8 words; errors ≤ 2 sentences; no sentence repeats what a button
already says." Decision 6: Getting started is a first-run guide, opened
from Help only. Recorded here, beside PRD 01 and PRD 02; no ADR, since no
seam moves.

## Problem statement

The baseline (`eval/baseline.md`, measured at `9aa23e7`) found 32 Help
articles of 9,838 words, 247 of their 518 sentences over 90 characters,
and 51 sentences over 90 characters on the screens, 27 of them on Help's
own list. The ai-apps article alone ran 855 words. The owner reads on a
phone: a 120-character sentence is three lines there, and a lede of two
lines pushes the first figure below the fold.

## The rules

1. One idea per sentence. No sentence over 90 characters.
2. A lede, the line under a screen's title, is one line at 390 px or none.
3. A hint, the small line under a control or a More row, is ≤ 8 words.
4. An error is ≤ 2 sentences: what happened, then what to do.
5. No sentence repeats what a button already says.
6. Every legal or safety sentence stays: what an AI app can reach and who
   sees it, what the AI is and is never sent, the emergency order, backups.
7. Help is 12 articles, each ≤ 150 words, each the same shape: a summary,
   steps with **Button** names, "You're done when…", "Stuck?", related,
   and terms only where an article explains words.

## The targets

| | before | target |
|---|---:|---:|
| Help articles | 32 | ≤ 12 |
| Help words | 9,838 | ≤ 3,000 |
| Help sentences over 90 characters | 247 | 0 |
| Sentences over 90 characters on a screen's first view, 390 and 1440 | 51 | 0 |
| Ledes over one line at 390 | measured after | 0 |
| Hints over 8 words | measured after | 0 |

## How they are measured

The eval scripts live beside the baseline in the scratchpad
(`eval/*.mjs`), not in the repository, and run against the preview on
`:5273` with the page clock pinned to 2026-09-24 and the same 23 routes at
390 and 1440 as `baseline.md`:

- `help.mjs` (`SRC=` the working tree's `articles.ts`): articles, words
  (title, summary, steps, done, stuck, terms, `**` stripped), sentences
  over 90 characters.
- `screens.mjs`: words in the first viewport and on the whole page, and
  every sentence over 90 characters, per screen, from each leaf block's
  laid-out text.
- `brevity.mjs` (new with this PRD): per screen, the sentences over 90
  characters whose block touches the first viewport; the lede's line
  count at 390, the lede being the first paragraph after the `h1`; and
  every hint over 8 words, a hint being a More row's second line, a
  field's small line, or a switch's description.
- `after-copy.json` holds the three results; the table at the end of
  this PRD is written from it and from `baseline.md`.

The repository holds the guards that keep the numbers: `help-articles.test.ts`
(12 articles, ≤ 150 words each, ≤ 3,000 in all, no sentence over 90, every
**Button** a name the app draws) and `short-sentences.test.ts` (no string
the web app draws holds a sentence over 90 characters, and no `hint` is
over 8 words).

## Implementation decisions

- Help's 12 ids, in Help's order: `start`, `getting-around`, `add`,
  `review`, `budgets`, `lists`, `savings`, `debts`, `coach`, `ai`,
  `ai-apps`, `updates`. The 20 others fold in: periods and words →
  getting-around; statements → add; wrong-number → review; goals →
  savings; checkin, forecast, month-end, reports, comparisons, ask →
  coach; free-ai, more-ai, ai-sees, ai-rests → ai; connect-claude,
  connect-chatgpt, ai-review → ai-apps; codes, signing-in, iphone →
  updates.
- An old article's address (`#/help/free-ai`) opens Help's list with the
  line "That page is not written yet", as any unknown topic does. No alias
  map: the only links to articles are the app's own, which are remapped,
  and `HANDOFF.md` and `docs/setup.md`, which name the new titles.
- Each screen's `?` keeps a written article (`screen-help.ts`); the
  Month, Week, Year and Paycheck open Getting around; the Forecast,
  Reports, Ask and the check-in open Coach, Ask and the forecast; All
  transactions opens Review.
- Ask's "Ask about this" is hidden on Ask's own `?` by the screen it was
  opened from, not by the topic, since Ask's topic is now the Coach's.
- Getting started's iPhone step keeps its four lines in `start/StepBody.tsx`,
  which drew them from the iphone article.
- The One-time updates panel keeps every check and every click list; the
  article says Copy, Run, Check again, and that the panel lists the rest.
- Words that are not prose are left alone: SVG paths, class names, a
  select's column list, a selector.

## Testing decisions

- `help-articles.test.ts` grows with each slice: the articles written so
  far are each ≤ 150 words with no sentence over 90; the last slice asserts
  12 articles and ≤ 3,000 words. Every test that quoted an old sentence
  quotes the new one in full.
- `short-sentences.test.ts` scans every string the web app draws with the
  TypeScript scanner, skipping class-like strings, and lists the files not
  yet cut; each slice removes its files from that list.
- Screen tests that pinned an old sentence pin the new one; none is
  loosened to a fragment.

## Out of scope

- The e2e suite and the bug bash (the other tree).
- Any change to what a screen counts or shows.

## Done when

- `./scripts/gates.sh full` prints `status=GREEN`.
- The after table below shows every target met.

## Before and after

Measured 2026-10-08 after the cut (`eval/after-copy.json`), on the working
tree's preview at :5273, the same 23 routes, clock, scheme and widths as
`baseline.md`; the before column is `baseline.md`'s.

| | before | after |
|---|---:|---:|
| Help articles | 32 | 12 |
| Help words | 9,838 | 1,658 |
| Help sentences over 90 characters | 247 of 518 | 0 of 148 |
| Longest Help article, words | 855 | 150 |
| Sentences over 90 characters on the screens, 390 · 1440 | 51 · 51 | 2 · 2 |
| …of which in a screen's first view | measured after | 1 · 1 |
| Ledes over one line at 390 | measured after | 1 |
| Hints over 8 words | measured after | 0 |
| Words in the first viewport, all screens, 390 · 1440 | 2,118 · 3,867 | 1,948 · 3,394 |
| Words on the whole page, all screens, 390 · 1440 | 6,478 · 7,372 | 4,965 · 5,799 |
| axe violations · page errors | 0 · 0 | 0 · 0 |

The three that remain are not the app's own sentences, and are left:

- Coach, 160 characters: a quotation from a book on the quote card. Quotes
  are quoted whole, never cut.
- Reports, 108 characters, in the first view: the preview fake's "one
  thing to try" for the month in review (`?aiwords`, as the baseline
  caveat says). The AI's words are the service's, bounded by the helper's
  checks, not by this PRD.
- Forecast's first paragraph, four lines at 390: the forecast's own
  sentence about the month, the screen's first figure, not a lede.

Per screen at 390 (words in the first view → whole page; sentences over 90):
Help 204 → 120 words, 1,364 → 201, 27 → 0; the Help article 149 → 121,
341 → 170, 8 → 0; Add 49 → 33; Debts 119 → 108, 3 → 0; AI 300 → 210 on
the whole page, 3 → 0; Review 2 → 0; Settings and the calendar 2 and 1 →
0. The Month, Week, Year, Paycheck, check-in, Forecast and sign-in were
already under the line and are within a word or two of before. Settings'
whole page reads 342 → 441 because the baseline measured the old cards
screen and `#/settings` now opens Lists (PRD 02), not because of words.
