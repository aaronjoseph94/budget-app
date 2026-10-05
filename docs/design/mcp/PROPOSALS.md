# AI apps suggest changes: the design

**Status: designed and built 2026-10-05**, slice by slice as §7 says;
nothing has run against the hosted project (ADR 0013, "Not yet met"). Decision: ADR 0013
(`docs/adr/0013-ai-apps-suggest-changes.md`). Builds on `PLAN.md` (ADR
0012); every convention there holds unless this file says otherwise: money
out `{cents, display}`, money in as `AmountText`, names as data, constant
descriptions, `.strict()` inputs, codes-only logs, one gated RPC per step.

## 1. The shape

```
AI app ──propose_change──▶ mcp server ──ai_app_read (1 read)──▶ rows → names to ids, before via core
                                       ──ai_app_propose (1 propose)──▶ ai_app_proposals: pending rows only
Owner ── Review → Suggested changes ──▶ fresh reads + core → "from" (stale check)
       ── Apply ──▶ the screen's own ledger.ts / goal-writes.ts function ──▶ decide_suggestion(id, 'applied')
       ── Dismiss ──▶ decide_suggestion(id, 'dismissed')
```

Nothing an AI app sends changes a budget, category, rule or ledger row.
Only the owner's session (no `client_id`) runs the write paths, which 0019
refuses to an AI app's token anyway.

## 2. The kinds

Every change also carries `reason` (§3). Names are matched as
`list_categories` hands them out (`cleanName`, as `ownerFor` matches), then
stored as ids, so a later rename does not orphan a suggestion. "Server"
means the before is worked out in TypeScript with the core function named;
"SQL" means `ai_app_propose` reads it from the stored column itself and
ignores any before the caller sent. Months are `'YYYY-MM'`, this month to
12 months ahead, default this month, stored as the first day.

| Kind | AI sends | Stored target → after; before (who) | Apply: the owner path, as the screen calls it | Checks beyond the schema | Card ("from → to", plus what the owner would feel) |
|---|---|---|---|---|---|
| `set_budget` | `category`, `month?`, `applies` (`onward` \| `only`, default `onward`), `amount` (`AmountText` \| null = no budget) | `{category_id, month, applies}` → `{cents\|null}`; `{cents\|null}` in effect that month (server: `resolveBudgets`), over the `onward` rows only for `onward` (Review: already so only when that month's own `only` value is the same too) | `setBudget` (ledger.ts), `replacesOnly` = an `only` row for that category and month in `listBudgetHistory(month)`, as MonthScreen's `ownOnly` | Not on Not spending; not on Bills, Debts or Subscriptions where no budget is typed and a monthly amount stands as the budget (F51, `planned_stands`: set_bill changes it); $0–$100,000 (BudgetEditor refuses below 0); differs from now | "Groceries budget from November 2026 on: $400.00 → $450.00" ("goal" on Income and Savings); `onward` adds "and every later month without its own"; on those three lists no budget reads "$1,500.00 planned" while a monthly amount is in effect, as the Month marks it |
| `set_weekly_limit` | `category`, `amount` (`AmountText` \| null = none) | `{category_id}` → `{cents\|null}`; `categories.weekly_budget_cents` (SQL) | `setWeeklyBudget` (ledger.ts), as WeekBudgetEditor | Not on Not spending; $0–$100,000; differs | "Groceries weekly budget: $100.00 → $120.00" |
| `set_bill` | `category`, `from_month?`, `amount?` (`AmountText` \| null = stop), `due_day?` (1–31 \| null); at least one of the two | `{category_id, month}` → `{cents\|null, due_day\|null}`, the field not given copied from before; `{cents\|null, due_day\|null}` in effect (server: `resolvePlans`) | `setPlan` (ledger.ts), both columns in the write, as SetupPlans | On Bills, Debts or Subscriptions (Setup's three monthly-amount cards); $0–$100,000; differs | "Rent from November 2026 on: $1,500.00 on day 1 → $1,550.00 on day 3"; null reads "stopped" |
| `set_goal` | `goal`, `target?` (`AmountText`, above $0), `target_date?` (date \| null); at least one | `{goal_id}` → `{target_cents, target_date\|null}`, the field not given copied; `savings_goals` row (SQL) | `saveFund` (ledger.ts) with `saved: null` (the typed balance stays, backend-c1-01) and `startDate`, `unitCostCents`, `unitLabel`, fund and name as `listFunds` reads them now | Target $0.01–$999,999.99 (FundEditor refuses ≤ 0); date after today, before 2100; differs | "Flight: target $2,000.00 → $2,500.00; by 1 Mar 2027 → 1 May 2027" |
| `rename_category` | `category`, `new_name` | `{category_id}` → `{name}`; `categories.name` (SQL) | `renameCategory` (ledger.ts), as Setup | No category of any list has `new_name` (0001, D11); differs | "Rename Eating out → Restaurants. Its charges, budgets and learned shops follow" |
| `add_category` | `name`, `list` (a list or `transfer`) | `{name, list}` → `{name, list}`; `{exists: false}` (SQL: no category has the name) | `ensureCategory(…, atEndOf(categories, name, kind))` (ledger.ts, lists.tsx: core's `endOfList`), as Setup's add | Name free on every list | "Add Pet care to Variable expenses" |
| `move_category` | `category`, `to_list` | `{category_id}` → `{list}`; `categories.kind` (SQL) | `moveCategory(…, atEndOf(…))` (ledger.ts), as Setup's move | Differs | "Move Gym from Variable expenses to Subscriptions"; to Not spending: "its charges stop counting as spending"; from it: "they start counting"; from Savings with a goal: "its goal will be on no fund" |
| `recategorise` | `transaction` (an `id` from `search_transactions`), `category` | `{transaction_id}` → `{category_id}`; `transactions.category_id` (SQL) | `recategoriseTransaction({learn: false})` (ledger.ts): the Month's Move with "Always file" off | The row is the caller's; differs | "COSTCO WHOLESALE, 3 Sep 2026, −$54.20: Groceries → Household" |
| `learn_shop` | `transaction`, `category` | `{transaction_id}` → `{category_id}`; `{category_id, rule_category_id\|null}` from the row and `merchant_rules` for its `merchant` (SQL) | `recategoriseTransaction({learn: true})` (ledger.ts): the Move with "Always file" on | Not a row an AI app added (0032 would learn nothing: `ai_row_not_learned`); differs in either part | "Always file COSTCO WHOLESALE under Household (now: under Groceries / filed by hand). From now on its statement lines skip Review. This charge moves too." Never in Apply all |

Not offered: any delete, debts' typed facts, pay schedules, starting
balances (ADR 0013). A refused write at Apply shows the screen's own words
(`describeBudgetFailure`, `describePlanFailure`, `describeFundFailure`,
`describeSetupFailure`, `describeMoveFailure`).

**One waiting per target.** `target_key`: `budget:<category>:<month>`,
`weekly:<category>`, `bill:<category>:<month>`, `goal:<goal>`,
`name:<category>`, `list:<category>`, `add:<name>`, `txn:<transaction>`
(`recategorise` and `learn_shop` share it). A new suggestion for a waiting
target with the same `after` is `already_suggested` (its id returned);
with a different one, the older becomes `replaced`. Two in one call for one
target: the second is `duplicate_in_call`.

### Schemas (`packages/schema`)

```ts
// ai-apps.ts — the tool inputs (request-body boundary)
const MonthText = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month like 2026-11')
const ReasonSchema = z.string().trim().min(1).max(300).pipe(IngestedTextSchema).refine(shown, …)
const NewNameSchema = NameSchema.pipe(IngestedTextSchema).refine(shown, …)
const AmountOrNone = z.union([AmountTextSchema, z.null()])
const DueDay = z.union([z.number().int().min(1).max(31), z.null()])
const AnyList = z.enum([...ListSchema.options, 'transfer'])
export const ChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_budget'), category: NameSchema, month: MonthText.optional(),
             applies: z.enum(['onward', 'only']).default('onward'), amount: AmountOrNone, reason: ReasonSchema }).strict(),
  z.object({ kind: z.literal('set_weekly_limit'), category: NameSchema, amount: AmountOrNone, reason: ReasonSchema }).strict(),
  z.object({ kind: z.literal('set_bill'), category: NameSchema, from_month: MonthText.optional(),
             amount: AmountOrNone.optional(), due_day: DueDay.optional(), reason: ReasonSchema }).strict()
    .refine((c) => c.amount !== undefined || c.due_day !== undefined, 'Expected amount or due_day'),
  z.object({ kind: z.literal('set_goal'), goal: NameSchema, target: AmountTextSchema.optional(),
             target_date: z.union([z.iso.date(), z.null()]).optional(), reason: ReasonSchema }).strict()
    .refine((c) => c.target !== undefined || c.target_date !== undefined, 'Expected target or target_date'),
  z.object({ kind: z.literal('rename_category'), category: NameSchema, new_name: NewNameSchema, reason: ReasonSchema }).strict(),
  z.object({ kind: z.literal('add_category'), name: NewNameSchema, list: AnyList, reason: ReasonSchema }).strict(),
  z.object({ kind: z.literal('move_category'), category: NameSchema, to_list: AnyList, reason: ReasonSchema }).strict(),
  z.object({ kind: z.literal('recategorise'), transaction: z.uuid(), category: NameSchema, reason: ReasonSchema }).strict(),
  z.object({ kind: z.literal('learn_shop'), transaction: z.uuid(), category: NameSchema, reason: ReasonSchema }).strict(),
])
export const ProposeChangeInputSchema = z.object({ changes: z.array(ChangeSchema).min(1).max(20) }).strict()
export const ListSuggestionsInputSchema = z.object({
  status: z.enum(['pending', 'applied', 'dismissed', 'replaced', 'expired', 'any']).default('any'),
  limit: z.number().int().min(1).max(50).default(20) }).strict()
export const SuggestReviewCategoriesInputSchema = z.object({
  suggestions: z.array(z.object({ id: z.uuid(), category: NameSchema }).strict()).min(1).max(50) }).strict()

// suggestions.ts — a stored row as Review reads it (model output at rest)
export const StoredSuggestionSchema = /* discriminated on kind: ids as uuids, cents as safe
  integers, months and dates as ISO days, reason as IngestedText; mirrors the table above */
```

## 3. The tools and the prompt

Thirteen tools (ten from PLAN §2.4, three here) and one prompt. Each new
tool is gated, logs codes only, and has a constant description.

| Tool | Input | Output | Notes |
|---|---|---|---|
| `propose_change` (writes) | `ProposeChangeInputSchema` | `as_of`, `results[{index, status: suggested \| already_suggested \| refused, id?, refused?, sentence?, change?{kind, names, before, after}}]`, `waiting_suggestions`, `message` | One `ai_app_read` (categories, budgets, plans, goals) to match names and work out the two server befores; then one `ai_app_propose`. Each change stands alone: one refused leaves the others. Amounts back as `{cents, display}`. Annotations: not read-only, not destructive, idempotent, closed world |
| `list_suggestions` | `ListSuggestionsInputSchema` | `as_of`, `waiting`, `returned`, `rows[{id, kind, status, suggested_on, decided_on, expires_on, change{names, before, after}, reason}]` | Newest first. `expired` is a waiting row past its day. Names are the current ones; a removed target reads "a removed category" |
| `suggest_review_categories` (writes) | `SuggestReviewCategoriesInputSchema` (`id` from `list_review_queue`) | `as_of`, `suggested`, `skipped`, `message` | Names to ids from one `ai_app_read(['categories'])`, then `ai_app_suggest_categories`. `skipped`: rows already filed by the owner or a rule, approved or rejected, or not the caller's |

`list_review_queue` and `search_transactions` rows gain `id`, and
`list_review_queue` rows gain `suggested_by` (`rule`, `model` or null).

**Descriptions say how to review.** `propose_change`: "Suggest changes to
the owner's budget. Nothing changes until the owner taps Apply in the app's
Review; you cannot apply. Read first (get_period, get_spending,
get_forecast, get_savings_goals, get_debts, list_review_queue,
list_categories, list_suggestions), check a pattern with
search_transactions, then suggest few changes, each with a short reason
that quotes the app's figures as given…" `list_suggestions`: "…call it
before suggesting, so you neither repeat a waiting change nor re-ask one
the owner dismissed." The instructions' sentence "You can read figures and
add entries to Review; you cannot approve, change or delete anything"
becomes "You can read figures, add entries to Review, and suggest changes
that only the owner can apply, in the app; you cannot approve, apply,
change or delete anything yourself", with the rest shortened so the first
512 characters still stand alone (tested).

**Prompt `review_my_budget`** (`registerPrompt`, no arguments, constant
text; capabilities gain `prompts: {}`): read every figure tool and
`list_suggestions`; suggest Review categories; then `propose_change` with
reasons; finish by telling the owner what waits in Review → Suggested
changes, and never saying a change was made. `prompts/list` and
`prompts/get` read nothing (the hostile-names test covers them).

## 4. Migration `0039_ai_apps_suggest_changes.sql`

1. **Guards.** Refuse if `public.ai_app_propose(jsonb)` exists ("0039 is
   already in; nothing to do"). Then two checks: `ai_app_updates_in()`
   exists, and answers at least 37 ("Paste 0037 first").
2. `ai_app_access` gains `allow_propose boolean not null default true`.
3. `ai_app_usage.kind` CHECK widened to `('read', 'add', 'propose')`.
4. **`ai_app_proposals`**: `id`, `user_id` (auth.users, cascade),
   `client_id uuid not null`, `kind` (CHECK, the nine), `target`, `after`,
   `before` (jsonb, not null), `reason ingested_text` (1–300), `target_key`,
   `status` (`pending`, `applied`, `dismissed`, `replaced`, `expired`),
   `created_at`, `expires_at`, `decided_at` (null exactly while pending).
   Partial unique `(user_id, target_key) where status = 'pending'`. RLS on,
   `user_id = auth.uid()` policy; 0019's three restrictive write policies
   and 0020's `ai_apps_read_through_the_gate`; `authenticated` gets select
   only.
5. **`_ai_app_gate(text)`**, edited in place: kind `propose` allowed;
   `suggesting_off` when `allow_propose` is false; cap 60 for `propose`.
6. **`ai_app_propose(p_items jsonb)`**: SECURITY DEFINER, VOLATILE,
   `search_path` pinned, mark `(0039)`. Gate (`propose`); 1–20 items or
   `bad_change`; marks the caller's waiting rows past `expires_at` as
   `expired`; per item: kind and keys exactly as §2, every id the caller's,
   the lists and ranges of §2, the reason's characters as `0034` checks
   words (every character visible, trimmed), SQL befores read here,
   `same_as_now`, `has_monthly_amount` (a move 0009's trigger refuses),
   `dismissed_recently` (the same kind, target, `after` and `before`
   dismissed in 14 days), the one-waiting rule (the waiting row locked
   `for update`; `already_suggested` only when kind, target, `after` and
   `before` all match, otherwise it is `replaced` while still pending and
   the new one inserted), then 100 waiting at most (`too_many_waiting`);
   inserts `pending` with `client_id` from the token and `expires_at` 14
   days on, or at the end of its month in the owner's time zone for a
   budget or monthly amount if sooner. Returns `{results, waiting}`.
7. **`ai_app_suggestions(p_status, p_limit)`**: invoker, gate (`read`);
   rows, the waiting count, and the names they need (categories, goals,
   the transactions named).
8. **`ai_app_suggest_categories(p jsonb)`**: SECURITY DEFINER, gate
   (`propose`), at most 50 `{candidate, category}`; 0018's update with
   0018's conditions word for word; returns `{suggested, skipped}`.
9. **`decide_suggestion(p_id, p_outcome)`**: SECURITY DEFINER, first
   statement `perform public._not_an_ai_app();`, `p_outcome` in
   `applied`/`dismissed`; `update … where id = p_id and user_id =
   auth.uid() and status = 'pending' and expires_at > now() returning`;
   true when it changed a row.
10. **`ai_app_review` and `ai_app_search`**, edited in place: each row's
    object gains `'id', r.id` (review rows already carry
    `category_source`, which `suggested_by` is read from). Each expected
    line once, or nothing changes.
11. **`ai_app_updates_in()`** re-created with explicit marks (30–37 as
    `0035` reads them; 38 left out; 39: `ai_app_propose(jsonb)` carries
    `(0039)` and the gate `'suggesting_off'`), keeping its own `(0035)`
    comment; **`ai_app_update_level()`** answers 39. `schema_level()` is
    untouched. Refused when `ai_app_updates_in()` already answers 39, and
    otherwise safe to run again, so 0030 or 0035 pasted over it is put
    right by pasting 0039 again.
12. Grants: every new function revoked from `public, anon`, granted to
    `authenticated`.

## 5. New refusals

Call-level (`isError`, one sentence): `suggesting_off` ("Suggesting
changes is switched off in the budget app's Settings → AI apps."),
`bad_change`. Per change (inside `results`, with a sentence):
`unknown_category`, `unknown_goal`, `unknown_transaction`, `wrong_list`,
`same_as_now`, `name_taken`, `bad_month`, `bad_date`, `bad_amount`,
`bad_words`, `ai_row_not_learned`, `has_monthly_amount`,
`planned_stands` (the server's), `dismissed_recently`,
`duplicate_in_call`, `too_many_waiting` ("100 suggested changes already
wait for the owner; list_suggestions shows them"). A refused change writes
nothing; the AI app is told why, as a refused add is (PLAN §2.8).

## 6. The app

- **Reads** (`apps/web/src/review/suggested-changes.ts`): waiting rows
  (`status = 'pending' and expires_at > now()`, oldest first), each parsed
  with `StoredSuggestionSchema`; then only what their kinds need, with the
  screens' own reads (`listCategories` via app data, `listBudgetHistory`,
  `listPlanHistory`, `listFunds`, the named transactions, `listRules`), and
  the current value from core (`resolveBudgets`, `resolvePlans`) or the
  stored column. App names from the grants (`shownName`, as `addedBy`).
- **Card words** (`change-words.ts`, pure, tested): §2's last column, money
  by `formatCents`, months by `formatMonthName`, names and shops as
  `IngestedText`. States: **ready** (Apply, Dismiss), **stale** ("Changed
  since it was suggested: now $420.00"; also a budget, weekly limit or
  monthly amount whose category moved to a list the screens give none on,
  as `wrong_list`, and one for a month gone by; Dismiss only), **already so**
  (Clear, which dismisses), **unreadable** (Dismiss only).
- **Apply** (`apply-suggestion.ts`): the suggestion read again (pending,
  unexpired, unchanged, else `gone` and nothing written), the target read
  again, stale check, the §2 write path, `decide_suggestion(id,
  'applied')` (false after the write is `applied_unmarked`, with its own
  words), `refresh()`. Busy while it runs; the screen's refusal words on
  failure.
- **Apply all N**: shown with two or more ready cards; N counts ready cards
  other than `learn_shop`. Confirm inline (as Approve all): "Apply N
  suggested changes? Each changes your budget as its card says. Shop rules
  are applied one at a time." One at a time, oldest first; a stale or
  refused one is left waiting with its reason; ends with "Applied A of N".
- **Where:** the **Suggested changes** section at the top of Review, above
  the rows waiting; hidden when none wait. Sidebar and tab bar: a second
  pill beside Review's count, "N suggested", from a head-only count in app
  data (0 before `0039` is in). Settings → AI apps: **Let AI apps suggest
  changes**, shown while AI apps are on, saved as `allow_propose`.
- **Words elsewhere:** Help's "What AI apps can do" and the two connect
  articles, the consent page, Settings' hint and PLAN §1's "can and cannot"
  say an AI app can suggest changes that wait for the owner's Apply. One-time
  updates lists `0039` after `0038` (`{ kind: 'level', level: 39 }`) and
  the server's new `MCP_SERVER_VERSION`.

## 7. Build slices

One logical change each, at most 300 changed lines excluding migrations and
the lockfile, unit or schema tests written with the code, and
`./scripts/gates.sh quick` GREEN before each commit. No screenshot sweeps,
end-to-end runs or hosted checks (the owner's "don't test anything after
building").

| # | Slice | Main files |
|---|---|---|
| S0 | This design and ADR 0013 | `docs/` |
| S1 | `0039`, with schema assertions for the table, its policies, the gate's new kind and switch, `ai_app_propose` and `decide_suggestion` | `supabase/migrations/0039_…`, `supabase/tests/schema-assertions.sql` |
| S2 | Assertions for `ai_app_suggest_categories`, the in-place edits, `ai_app_updates_in()`; One-time updates lists `0039` | `schema-assertions.sql`, `help/updates.ts` |
| S3 | The tool inputs and `StoredSuggestionSchema` | `packages/schema/src/ai-apps.ts`, `suggestions.ts` |
| S4 | Row ids and `suggested_by`; `suggest_review_categories`; the new RPC names and sentences | `packages/ai-apps/src/tools/review*.ts`, `search.ts`, `rpc.ts` |
| S5 | Server: budget, weekly limit, bill and goal changes, befores via core | `packages/ai-apps/src/proposals.ts` |
| S6 | Server: category and charge changes; `propose_change` | `proposals.ts`, `tools/propose.ts`, `server.ts` |
| S7 | Server: `list_suggestions` | `tools/suggestions.ts` |
| S8 | Instructions, descriptions, `review_my_budget`, `MCP_SERVER_VERSION` | `server.ts`, `prompts.ts`, `@budget/schema` |
| S9 | Web: reads, current values, card words | `apps/web/src/review/suggested-changes.ts`, `change-words.ts` |
| S10 | Web: Apply and Dismiss paths, stale and already so | `review/apply-suggestion.ts` |
| S11 | Web: the Suggested changes section | `review/SuggestedChanges.tsx`, `ReviewScreen.tsx` |
| S12 | Web: Apply all with its confirm | `review/SuggestedChanges.tsx` |
| S13 | Web: the counts in the sidebar and tab bar | `app-data.tsx`, `shell/Sidebar.tsx`, `App.tsx` |
| S14 | Web: the Settings switch | `ai-apps/access.ts`, `AiAppsCard.tsx` |
| S15 | Words: Help, consent page, PLAN §1, CAPABILITY-MAP's `ai-apps` row, HANDOFF's owner steps | `help/articles.ts`, `ConsentScreen.tsx`, `docs/` |
