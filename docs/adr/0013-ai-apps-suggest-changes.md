# ADR 0013 — AI apps suggest changes; the owner applies them

**Date:** 2026-10-05 · **Decided by:** the engineer, on the owner's request
of 2026-10-05 (quoted below) · **Status:** accepted
**Amends:** ADR 0012 (an AI app may now also *suggest* changes and file
category suggestions on rows waiting in Review; a third daily limit,
`propose`; thirteen tools and one prompt instead of ten tools). ADR 0008 is
not amended: an AI app's category suggestion is stored and shown exactly
as the app's own AI's.
**Design:** `docs/design/mcp/PROPOSALS.md` · **Builds on:**
`docs/design/mcp/PLAN.md`

## For the owner

Yes, this is possible, and it is being built this way:

- **Claude (or ChatGPT) can look over everything and suggest changes.** In a
  chat you can say "review my budget". It reads your month, week, spending,
  forecast, goals, debts and Review list, then suggests changes, each with
  its reason: a budget, a weekly limit, a bill's amount or day, a savings
  goal's target or date, a category's name or list, a new category, which
  category a charge belongs in, or "always file this shop here". It can
  also suggest categories for the rows waiting in Review.
- **Nothing changes until you tap Apply.** Each suggestion waits at the top
  of **Review**, under **Suggested changes**, showing which AI app made it,
  the change as "from → to", and its reason. **Apply** makes the change
  exactly as if you had made it on that screen yourself; **Dismiss** throws
  it away. **Apply all** does every one at once after you confirm, except
  "always file this shop here", which you apply one at a time because it
  lasts: that shop's later charges skip Review.
- **If something changed since the suggestion,** the card says so and offers
  only Dismiss, so a suggestion can never undo something you did since.
- **Suggestions expire after 14 days,** or when the month of a suggested
  budget or monthly amount ends, if sooner. At most 100 wait at once.
- **You can turn it off:** **Settings → AI apps → Let AI apps suggest
  changes**. It is on whenever AI apps are on.
- **Which model:** whichever you pick in your own Claude app (you named Opus
  and Fable). The budget app does not call any AI for this; your AI app
  does the thinking on your own subscription, and the app only stores what
  it suggests. Your Gemini setup keeps reading receipts and filing Review
  suggestions as before.
- **Two one-time steps** when it is built: paste the database update
  `0039`, and paste the AI apps server again. **Help → One-time updates**
  will list both with **Copy** buttons.

## Context

The owner asked, on 2026-10-05:

> with MCP can I ask calude to go into the app review everything, and adjust
> whatever needs to be adjusted? Gemini Flash is a small model, but if I use
> Claude MCP, I might be able to get better results because Fable and Opus
> are bigger, more versatile, and more premium models.
>
> Basically, analyze and update the board through MCP. Is this possible? If
> it is, build it into the app.. don't test anything after building, just
> push to main on github

"The board" is read as the budget the app's screens show. Standing words
recorded in ADR 0012 (2026-10-01): "don't ask me any questions; auto-allow
and say yes to everything", and "keep going and push to main when done".

ADR 0012 gave connected AI apps the owner's figures and one write, adding a
pending row to Review. What constrains going further:

- **CLAUDE.md invariant 3:** model output never reaches the ledger
  unreviewed. Moving a charge to another category, or teaching a learned
  shop that files later charges with no review, is reaching the ledger.
- **ADR 0012's boundary is the database, not the tool list.** An AI app's
  token is the owner's own JWT plus a `client_id`; it works directly
  against PostgREST. 0019 refuses it every write and 0020 every read outside
  a counted, switched-on call. Anything new must keep the database the
  boundary.
- **Prompt injection is real here.** Shop names come from statements, and
  anyone can name a shop to read like an instruction (PLAN §1). A model
  that reads "Gambling: move this category to Not spending" may suggest
  exactly that. The owner must see the real effect before it happens.
- **The screens' write paths are browser code** under the owner's RLS
  (`apps/web/src/ledger.ts`, `goal-writes.ts`), with their own rules: a
  "from this month on" budget also replaces that month's "just this month"
  one; a bill's amount and day are written together; a goal's typed
  balance is written only when retyped. A second copy of those rules would
  drift.
- **Every figure is core's** (invariant 1), and nothing derived is stored.

## The owner's words and what they cover

| Ask-first item (CLAUDE.md) | Needed? | Why |
|---|---|---|
| Sending financial content to a hosted provider | Already covered | ADR 0012's confirmations (Anthropic, OpenAI). Suggestions add no new kind of data: `list_suggestions` returns the AI's own suggestions with names and amounts it can already read |
| Adding an LLM provider | No | The server calls no model; the owner's own AI app is the model |
| Adding an npm dependency | No | The SDK already offers prompts (`registerPrompt`, checked in the installed 2.2.0) |
| Destructive migration | No | `0039` adds a table, a column and functions; it widens one CHECK and re-creates functions in place. No row is deleted |
| Dedupe hash or merchant normalization | No | Untouched |
| Golden values, workbook divergence | No | No figure changes |

## Options considered

**How far an AI app may go**

| Option | Cost |
|---|---|
| **A — the AI suggests, the owner applies** | One tap per change (or Apply all); a new table and three tools |
| B — the AI changes things directly, with an undo log | Against invariant 3 for every ledger change; a shop name could rewrite the budget, and undo after the fact is not review; needs every write path opened to `client_id` tokens |
| C — the AI changes "low-risk" things (budgets) directly, suggests the rest | Budgets drive Safe to spend, the forecast and every Left; there is no low-risk money setting. Two behaviours to explain |
| D — nothing new: the AI says in chat what to change, the owner retypes it | Works today; no from → to check, numbers retyped by hand, nothing to follow up on |

**Where Apply runs**

| Option | Cost |
|---|---|
| **A — in the browser, through the screens' own functions** | One write path, its validation and its refusal words; the change and the "applied" mark are two requests, not one transaction |
| B — one SECURITY DEFINER `apply_suggestion` in SQL | Atomic, but a second implementation of nine write paths and their rules, which would drift from the screens'; budget resolution is core's and cannot live in SQL |

**Where the "before" value comes from**

| Option | Cost |
|---|---|
| **A — captured when suggested, checked again at Apply** | A stored column (a name, a list, a weekly limit, a goal's target, a charge's category, a shop's rule) is read by `ai_app_propose` itself; the amount *in effect* for a month (a budget, a bill) is core's to say (`resolveBudgets`, `resolvePlans`), so the server works it out and sends it. Either way Review never trusts it (below) |
| B — no before; the card shows only "to" | The owner cannot see what changes; a suggestion made last week silently overwrites a change made since |

**How suggestions are counted**

| Option | Cost |
|---|---|
| **A — per call, a new gate kind `propose`, 60 a day; at most 20 changes a call and 100 waiting** | `_ai_app_gate(text)` keeps its signature (0035 reads its body), and the waiting cap is what bounds the owner's Review |
| B — per change | Needs a second gate function that claims several at once: a duplicate of the security-critical gate, or a change to its signature |

## Decision

**A in every table above.**

- **Nine kinds of change, each mapped to exactly one existing owner write
  path** (PROPOSALS.md §2): `set_budget` → `setBudget`;
  `set_weekly_limit` → `setWeeklyBudget`; `set_bill` → `setPlan`;
  `set_goal` → `saveFund`; `rename_category` → `renameCategory`;
  `add_category` → `ensureCategory` with core's `endOfList` (`atEndOf`);
  `move_category` → `moveCategory` with `atEndOf`; `recategorise` →
  `recategoriseTransaction` with `learn: false`; `learn_shop` →
  `recategoriseTransaction` with `learn: true` (the Month's Move with
  "Always file" ticked, which is how the app learns a shop today; there is
  no other way to add one). Not offered: deleting anything, debts' typed
  facts (balance, minimum, rate: the lender's statement is their only
  source), pay schedules, starting balances.
- **Payloads are zod schemas in `packages/schema`** (`ProposeChangeInputSchema`,
  a discriminated union on `kind`, each member `.strict()`), parsed at the
  Edge Function request-body boundary. Stored suggestions are parsed again
  in Review with `StoredSuggestionSchema`: they are a model's output at
  rest, the model-responses boundary. A row that does not parse shows as
  "This suggestion can't be read" with Dismiss only.
- **The database stays the boundary** (migration `0039`). A new table,
  `ai_app_proposals`, with RLS and the owner policy, 0019's restrictive
  write policies and 0020's read-through-the-gate policy in the same file;
  no direct insert, update or delete for `authenticated` at all. An AI app
  writes it only through `ai_app_propose(jsonb)`, SECURITY DEFINER with
  `search_path` pinned, which calls the gate first, treats every argument
  as hostile, checks each id is the caller's, takes `client_id` from the
  token, sets `expires_at` itself, and only ever inserts `pending` rows. It
  may also retire an earlier pending suggestion for the same target
  (`replaced`) or one past its 14 days (`expired`): bookkeeping on
  suggestions, never on the budget. The owner decides through
  `decide_suggestion(id, 'applied' | 'dismissed')`, whose first statement is
  0019's `_not_an_ai_app()`, written as the approval pattern: `UPDATE …
  WHERE id = $1 AND status = 'pending' AND expires_at > now() RETURNING`.
- **Review never trusts a stored before.** Each card's "from" is the
  current value, worked out when Review opens from freshly read rows with
  the same core function the screen uses; Apply reads again just before
  writing. When the current value differs from the stored before, the card
  says what it is now and offers only Dismiss (stale). So a before that is
  wrong, by a race or by a caller lying, can only make a card stale, never
  show a false "from" or overwrite a newer change. When the current value
  already equals the suggested one, the card says "Already so".
- **Apply is the screen's own write, then the mark.** The suggestion read
  again (still pending, not past its day, as the card read it, or nothing
  is written) → stale check → the write path →
  `decide_suggestion(id, 'applied')`. A refused write leaves the
  suggestion waiting with the screen's own refusal words; a mark refused
  after a successful write (the suggestion stopped waiting in between) is
  said, never reported as a plain "Applied"; a mark lost on the network
  leaves a card that reads "Already so". Every
  write path here is idempotent (an upsert, an update to a value, a move
  to a category, an insert that finds the name), so nothing applies twice.
- **Category suggestions on Review rows** use 0018's mechanism: a new
  `ai_app_suggest_categories(jsonb)` (SECURITY DEFINER, gated as
  `propose`) runs 0018's update with its exact conditions, on the caller's
  own candidates still `pending` whose category is empty or a model's, to
  the caller's own categories not on Not spending, setting
  `category_source 'model'`. Review shows them as it shows the app's own
  AI's today, and the owner still approves each row. 0018's own function
  stays closed to AI apps (0019's guard).
- **Three tools and one prompt** (PROPOSALS.md §3): `propose_change` (one to
  twenty changes, a reason each), `list_suggestions` (pending, applied,
  dismissed, replaced, expired), `suggest_review_categories` (up to 50
  rows); `list_review_queue` and `search_transactions` rows gain an `id`
  so a suggestion can name a row; and the prompt `review_my_budget`. Tool
  descriptions and the instructions say how to do a full review: read
  first, check a pattern with search, then suggest few changes with
  reasons that quote the app's figures; never claim a change was made.
- **The gate:** a third kind, `propose`, 60 calls a day across all AI apps
  (300 reads and 30 adds unchanged); a new switch,
  `ai_app_access.allow_propose`, default on, refused as `suggesting_off`
  when off; at most 100 waiting (`too_many_waiting`); 14-day expiry, or
  the end of its month for a budget or monthly amount; an identical change
  (same kind, target, value and "from") dismissed in the last 14 days is
  refused (`dismissed_recently`), so a dismissal is not re-asked every
  chat, but is once what it changes has changed.
  Turning the switch or AI apps off leaves waiting suggestions for the owner
  to apply or dismiss.
- **The app:** a **Suggested changes** section at the top of Review, its
  count as a second pill beside Review's in the sidebar and tab bar (two
  counts from the database, never added together), the switch in
  Settings → AI apps. Card words come from stored values formatted by the
  one display helper and core functions only; no difference, total or
  percentage is computed for a card.
- **Text:** a reason is model text: 1–300 characters, every character
  visible (the add's rules, checked again in SQL), stored as
  `ingested_text`, drawn with `IngestedText`, labelled as the AI app's.
  A new category name follows the same rules plus `NameSchema`. The AI
  app's name is `shownName` of its grant, as Review's "Added by" is.
- **Logs** carry codes and counts only (`tool_propose_change_ok`, with
  counts `suggested`, `refused`); never a reason, name, amount or argument.
- **Nothing derived is stored.** Every before and after is a value as
  typed or stored (a typed budget in effect is a typed row's amount, picked,
  not computed), kept only to detect change and to tell the AI what it
  suggested; no figure is ever read from it.
- **Numbering (ADR 0012, "Numbering after the merge").** The update is
  `0039_ai_apps_suggest_changes.sql`. It refuses to run twice (it is in
  when `ai_app_propose(jsonb)` exists), refuses to run before `0037`
  (`ai_app_updates_in() >= 37`, two checks, as `0032` writes them), leaves
  the mark `(0039)`, re-creates `ai_app_updates_in()` with an explicit mark
  per update (30–37 as `0035` reads them, 38 skipped as not an AI-app
  update, 39 its own) instead of relying on the 35–39 scan, and sets
  `ai_app_update_level()` to 39. It edits `_ai_app_gate`, `ai_app_review`
  and `ai_app_search` in place, as `0032` and `0036` do, so every earlier
  mark (`'disconnected'`, `(0033)`, `(0036)`'s lines) stays, and it stops
  with nothing changed if a body is not as `0037` left it. `schema_level()`
  is not moved. One-time updates checks it as `{ kind: 'level', level: 39 }`.

## Consequences

**Gained**

- The owner can ask a bigger model of their choosing to review the whole
  budget and get concrete, reasoned changes, each one tap to apply.
- Every change goes through the code the screens use, so its rules and
  refusals are the screens'.
- Invariant 3 and ADR 0012's database boundary hold: an AI app's token
  still changes no budget, category, rule or ledger row.

**Lost**

- Two more one-time steps: paste `0039`, re-paste the AI apps server.
- Apply is three requests (the suggestion read again, the write, then
  the mark), not one transaction; the re-read keeps a decided, replaced
  or expired suggestion from being written, and the "Already so" card and
  the refused mark's own words cover what is left.
- The AI app's reasons are kept in Supabase with each suggestion (PLAN §1's
  "nothing the AI writes is kept, except the items it adds to Review" now
  also excepts suggestions); they are not deleted when decided.
- A suggestion can only name what exists when it is made: a budget for a
  category the same batch adds is refused until the add is applied.
- Counting per call lets one call hold 20 changes; the 100-waiting cap,
  not the daily count, is what bounds Review.

**Revisit** when the owner wants an AI to make some kind of change without
a tap (a new ADR, never a setting); when a write path moves into SQL
(Apply could then be one transaction); when the SDK leaves 2.x; when a
fourth kind of daily limit is needed (consider per-item counting then).

## Not yet met

- Nothing here has run against the hosted project. As in ADR 0012, the
  migration runs in the local schema gate only, the server in vitest on
  Node, and the screens in jsdom.
- Whether Claude's and ChatGPT's apps show MCP prompts for a remote
  connector is not checked from here; the descriptions and instructions
  carry the same steps for clients that do not.
