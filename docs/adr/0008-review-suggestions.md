# ADR 0008 — Review suggests categories; the owner still files every row

**Date:** 2026-09-27 · **Decided by:** the engineer under the owner's
2026-09-24 instruction to proceed without questions; the approvals quoted
below are the owner's · **Status:** accepted
**Plan:** `docs/ai-first-plan.md` §2.8, §3.6, §3.9 and slice A21; the
services and keys are ADR 0004's, the text rules ADR 0005's

## Context

Every imported row waits in Review until the owner picks its category and
taps **Approve** (CLAUDE.md invariant 3). A first statement leaves a few
hundred rows, and today only a shop the owner has filed before arrives with
a category picked.

The owner asked for AI "in as many places as possible" (2026-09-24,
item 2). Filing is the one chore every statement brings, so it is where a
suggestion saves the most taps. CLAUDE.md sets the bounds: model output
never reaches the ledger unreviewed; only an exact `merchant_rules` match
approves by itself; text from a model or a statement is data, never an
instruction.

## The owner's approvals

In the owner's words, 2026-09-24, item 2: "I told you I want AI in as many
places as possible … The whole product should be Ai first. Include the
ability to add paid models but mostly have an easy way to sync free LLM
models like google Gemini (free)". And from ADR 0002, when the owner chose
Gemini's free tier: "I don't care about privacy... use Gemini free tier."

Those cover sending a hosted service what this feature needs (ADR 0004's
table, "Review suggestions"): each shop's name with runs of four or more
digits masked and cut to 40 characters, whether it was spent or received,
a size band, and the owner's category names. No amount and no date.
**Share shop names** off in AI settings turns suggestions off. Nothing else
on CLAUDE.md's "Ask first" list is used, and no dependency is added.

## Options considered

**Where a suggestion lives**

| Option | Cost |
|---|---|
| A — in the browser only, asked again on every device and every visit | Free calls spent again and again; the owner sees different guesses on the phone and the computer |
| **B — on the candidate, as `category_source = 'model'`, written by a guarded function** | A migration (0018) and two functions to prove |
| C — a table of suggestions beside the candidates | A second place for a row's category, and a join on every read of Review |

**How several rows are approved at once**

| Option | Cost |
|---|---|
| A — one new SQL function that approves a list | A second approval path to prove, beside `approve_candidate` |
| **B — `approve_candidate` once per row, after one confirmation that lists every row** | More round trips; each is still the conditional write CLAUDE.md prescribes |

## Decision

**B and B.**

- `suggest_candidate_categories(p)` (0018) writes at most 200 proposals. It
  sets one only on the caller's own candidate that is pending with no
  category or a model's, and only to the caller's own category that is not
  on Not spending. It never touches a row the owner or a learned rule
  filled. `clear_candidate_suggestion` puts one back to none. Both are
  SECURITY DEFINER, check `auth.uid()` themselves, and are granted to
  `authenticated` alone. Removing a category clears the proposals naming it,
  so a guess never stops a category being removed.
- 0004's CHECK already refuses an approved candidate whose category is a
  model's, and `approve_candidate` records `user`. So a proposal cannot
  post, and approving one is the owner adopting it.
- **Approve these N** lists every row it will file, with its category, asks
  once, and calls `approve_candidate` for each in turn. Each is
  `UPDATE … WHERE status = 'pending'`, then the insert `ON CONFLICT DO
  NOTHING`, as for one row. It stops at the first failure and says how many
  went in.
- **The AI is told little and trusted less.** The `categorise` task sends
  rows as `c1…cN` aliases for the categories and numbers for the rows; the
  reply is parsed with zod in `packages/schema`, and only a known row, an
  offered alias and medium or high confidence are kept. A shop's name is
  data inside the user turn, so a shop named like an instruction can at
  worst change which offered categories are picked, and the owner still
  sees and confirms each one.
- **With AI off**, `similarMerchant` in `statement-parsers` offers the
  category of the learned shop whose name starts the same way. It is picked
  on the screen and never stored; `sameMerchant`, equality, stays the only
  match that files a row by itself.

## Consequences

**Gained**

- A first statement arrives mostly picked; the owner checks and taps.
- A suggestion is asked for once and shows on every device.
- Every approval is still the owner's tap and records `user`.

**Lost**

- Shop names, masked and cut, go to a free service that may keep them
  (the owner accepted this for Gemini's free tier in ADR 0002).
- One more one-time update (0018) to paste. Until it is in, Review works as
  before and says so in one line.

**Revisit** if the owner wants suggestions for rows a rule already filed,
or wants a list approved without seeing it.
