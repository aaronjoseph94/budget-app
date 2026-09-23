# Noticed, not touching

Things seen while working on something else. Recorded rather than fixed, so
the current slice stays one logical change (CLAUDE.md, "Always").

Each entry says what was seen, why it was left, and what would settle it.

---

## N1 — CI actions are pinned to mutable tags, not commit SHAs

**Seen:** 2026-09-22, reviewing `.github/workflows/gates.yml`.

`actions/checkout@v4`, `actions/setup-node@v4` and `pnpm/action-setup@v4` are
pinned to tags, which a compromised maintainer account can move. The workflow
checksum-pins gitleaks on the stated principle that an unverified binary that
scans for secrets is worse than no scan, and then runs three unpinned actions
before it — one of which could put anything named `gitleaks` on `PATH`.

**Why not fixed here:** resolving a tag to its commit SHA means reading those
repositories, and this session's GitHub access is scoped to `budget-app` alone
(verified: the API returns 403 for `actions/checkout`). Writing a SHA from
memory would be worse than the tag, because a wrong-but-precise pin looks
verified and is not.

**Partly mitigated:** the job now declares `permissions: contents: read`, so a
compromised action inherits a token that cannot push, and
`persist-credentials: false` keeps the token out of `.git/config` where a later
step could reach it.

**To settle:** resolve each tag to a full commit SHA and pin to it, keeping the
tag in a trailing comment so the version stays readable. Dependabot can raise
the bumps.

---

## N2 — `dedupe_hash` is an unsalted digest of fields that may not be logged

**Seen:** 2026-09-22, from an adversarial review of `statement-parsers`.

`computeDedupeHash` is a bare SHA-256 over the account id, date, amount and
merchant string. CLAUDE.md permits logs to carry ids, and a hash reads like an
id — but it is a commitment to an amount and a merchant over a search space
small enough to enumerate offline once the account id is known, which is itself
loggable. A log line of `{account_id, dedupe_hash, reason}` breaks no stated
rule and still discloses the amount to anyone who can grind it.

**Why not fixed here:** the fix is a per-user secret salt, which has to live
somewhere only the server can read. There is no Supabase project, no Edge
Function and no secret storage yet, so there is nowhere correct to put it.
Inventing a home for it now would almost certainly be the wrong one.

**To settle:** when `persistence-schema` lands, derive the hash with a per-user
key held server-side (HMAC rather than a bare digest), bump
`DEDUPE_HASH_VERSION`, and backfill in the same migration — CLAUDE.md requires
the bump and backfill together. Doing it before any rows exist is free; after
is not.

---

## N3 — A foreign-currency amount imports as if it were domestic

**Seen:** 2026-09-22, from an adversarial review of the importer.

`parseAmountToCents` strips `$`, `£`, `€` and `¥` as decoration before parsing,
so `€50.00` and `$50.00` both become 5000 cents. A statement carrying a
Currency column — Monzo, Wise, Revolut, and any card used abroad — imports its
foreign rows at face value into a ledger that has no idea they are foreign.

**Why not fixed here:** this is a product decision, not a bug in the parser.
Handling it properly means deciding what a multi-currency ledger even is:
whether a transaction stores its original currency, whether totals convert at
the transaction date or today, and where rates come from. Guessing at that now
would bake in an answer that the savings coach and every rollup then inherit.
Rejecting foreign rows outright is the other option and also a product call.

**Interim risk:** small but real. It affects only statements with foreign
transactions, and the amounts are wrong rather than missing, so they are
visible in the review queue as implausible numbers rather than silently
absent.

**To settle:** decide the single-currency question explicitly. If the answer is
"this app is one currency", the importer should reject a row whose amount
carries a symbol other than the account's, with its own reason code, rather
than stripping it.

---

## N4 — Merchant text beginning `=`, `+`, `-` or `@` and the planned Excel export

**Seen:** 2026-09-22, from an adversarial review of the importer.

A merchant descriptor is chosen by whoever issued the charge. One beginning
with `=`, `+`, `-` or `@` is executed as a formula by spreadsheet software when
it lands in a cell, and `docs/ideas/export.md` plans an Excel export.

**Why not fixed here:** the defence belongs at the point of export, not at the
point of import. Escaping on the way in would corrupt the merchant string that
the dedupe hash is computed over and that merchant rules match on, so the same
charge would hash two ways depending on which version of the importer read it
— trading a hypothetical for a certainty.

**To settle:** when `report-export` is built, prefix a leading `=`, `+`, `-`,
`@`, tab or CR with an apostrophe in the cell writer, and test it there. Note
that `-` is legitimate at the start of a negative amount, so the guard applies
to text cells only.

---

## N5 — The coverage gate does not measure the app's screens *(partly settled 2026-09-22)*

**Status: not fully addressed.** Plan slice P3 did the groundwork. jsdom,
Testing Library (dom and react) and a fake Supabase client are in
(`apps/web/test/fake-supabase.ts`: the real supabase-js client with a fake
fetch). The app's `.tsx` files are now measured. The Week and Review screens
have tests and their own floors: Week at 95/100/76 and Review at 95/100/87
(lines, functions, branches). The app as a whole is floored at
31/71/78, which is what it measures today.

**What is left:** that whole-app floor is below CONSTRAINTS.md's 80/80/75,
because Add (612 lines), Import, Ledger, Settings, sign-in (`auth.tsx`) and
`App.tsx` have no tests. Each needs its own screen tests, using the same fake,
and after each one the `apps/web/src/**` floor goes up to the new measured
figure. N5 is settled once that floor reaches 80/80/75. Add and Import will
also need the fake to answer `functions.invoke` (receipt reading) and the
`save_import` RPC. The fake refuses anything it does not know, so a test that
reaches for those fails loudly until they are added.

The original note follows.


**Seen:** 2026-09-22, by the architecture review, which proved it by adding
200 untested lines to apps/web and watching the gate stay green.

`vitest.config.ts` includes `*.ts` only, so every `.tsx` file is outside the
measurement, and the app's thresholds name only `format.ts`. The screens built
on this date (week, review, add, ledger, settings) are therefore untested by
anything but a manual browser run against a stand-in data source.

**Why not fixed here:** including `.tsx` turns the gate red today, and the
honest fix is component tests with a fake Supabase client — a slice of its
own, not a threshold edit. Lowering a bar to let this change pass is exactly
what CLAUDE.md forbids.

**To settle:** add React Testing Library (its own dependency commit), a fake
client like the one used for the screenshots, then include `.tsx` and raise
the app thresholds.

---

## N6 — Photo reading is built but unmeasured *(updated 2026-09-22)*

Built with Gemini's free tier (docs/adr/0002). What remains is the
CONSTRAINTS.md extraction bar — ≥20 labelled receipts — and a run against the
real API, which this environment cannot reach. The original note follows.

### Originally: photo and scanned-receipt reading is not built

**Seen:** 2026-09-22. The user chose to have photos read by Claude.

It needs a Supabase Edge Function holding the provider key (never the browser
bundle — CLAUDE.md), a model-response schema, and the review-queue path with
`category_source = 'model'`, which migration 0004 already forbids from ever
being approved as-is. None of it can be deployed or tested from this
environment, which cannot reach Supabase.

**To settle:** Phase 4 of docs/ROADMAP.md.

---

## N7 — The app bundle is 606 KB

**Seen:** 2026-09-22, from `vite build`. Mostly supabase-js. It loads fine on a
phone, but the PDF reader could be split into its own chunk loaded only on the
Add screen, and the Supabase client trimmed to the modules used.

---

## N8 — CLAUDE.md's stack line names three libraries the app does not use

**Seen:** 2026-09-22, writing ADR 0003.

CLAUDE.md's Stack section lists "TanStack Router + Query" and "vite-plugin-pwa
(installable, camera via file capture)". `apps/web/package.json` depends on
none of them, and nothing under `apps/web/src` imports them. Navigation is the
hash in `src/nav.ts`; data loading is `src/app-data.tsx` and each screen's own
effect; the app is installable through a hand-written
`public/manifest.webmanifest` and Apple meta tags, with no service worker.
ADR 0001's table names the same three.

**Why not fixed here:** CLAUDE.md is the owner's file, and changing what it
says the stack is needs their approval. ADR 0003 records why navigation stays
hand-rolled; it does not rewrite CLAUDE.md.

**To settle:** with the owner's approval, change the stack line to what is
used — hash navigation in `nav.ts` (ADR 0003), a web manifest without a
service worker. If offline use is ever wanted, vite-plugin-pwa comes back as its own dependency
commit.

---

## N9 — A blank starting balance is a divergence with no D-number *(settled 2026-09-23, S11)*

**Seen:** 2026-09-22, writing formula decision F7.

Workbook treats a blank Jan!D9 as $0 and still shows an ending balance (Jan!D15
`=D9+N5-D11-S5`). The Workbook plan (§5.2, F7) has the engine return no ending
balance instead. That departs from the workbook, and CLAUDE.md says every
deliberate divergence gets a dated entry, but the plan numbers only D5–D16 and
does not list this one.

**Why not fixed here:** S0 records the D-numbers the plan cites; adding a new
one is a change to the plan, not a transcription of it.

**To settle:** before S11 (the summary card), add it to `docs/divergences.md`
as the next free D-number — workbook value $0 start, chosen value "no ending
balance", reason the CONSTRAINTS.md floor (no silent 0), as D15 does.

**Settled:** recorded as D17, marked as an engineering default stated to no
one: it was never asked of the owner, nor told to them. F7 now cites it.

---

## N10 — ROADMAP's phase markers predate the build

**Seen:** 2026-09-22, updating `docs/ROADMAP.md` for the Workbook plan.

Phase 0 is marked done and Phase 1 "← next", but statement import, the review
queue, learned merchant rules, the Week screen and photo reading are all
built. With the Workbook views now also marked next, the page has two "next"
phases.

**Why not fixed here:** marking a phase done is a claim about its "Ends with"
line — for Phase 1, "a real statement imported and categorised", which waits
on migrations 0003 and 0004 being applied to the hosted project. That is
checked against the live project, not written from here.

**To settle:** once 0003 and 0004 are applied and a real statement is in,
mark Phases 1, 2 and 4 with what is actually done, and leave one "next".

---

## N11 — After 0005, the app cannot create a category until S2a

**Seen:** 2026-09-22, writing migration 0005.

0005 drops the default on `categories.kind`, as the Workbook plan requires, so
an insert without a list is refused with 23502. `ensureNamed` in
`apps/web/src/ledger.ts` inserts `{ user_id, name }` only, and the not-null
check fires before the unique check it relies on, so between pasting 0005 and
deploying S2a, every "new category" in Review, Add and Settings fails with a
code, even when the typed name already exists. Choosing an existing category
from the list is unaffected. `docs/setup.md` now says so beside the 0005 row.

**Why not fixed here:** the fix is app code (S2a: every new category asks
which list), and this task changes no app code. Giving `kind` a default again
would reopen exactly what 0005 closes.

**To settle:** land S2a promptly after the owner confirms Sitting A ran.

---

## N12 — Two 0004 functions are missing from the anon-execute assertion *(settled 2026-09-23, Sitting B)*

**Seen:** 2026-09-22, extending `supabase/tests/schema-assertions.sql`.

0004 revokes `reject_candidate(uuid)` and
`add_typed_transaction(uuid, date, bigint, text, text, uuid)` from `anon`, but
the final assertion lists only `approve_candidate` and the 5-argument
`save_import`. Deleting either revoke would leave the schema gate green.
The functions 0006 and 0007 add are in the list.

**Why not fixed here:** the task adds its own functions to the list; widening
the check for 0004 is a separate change to what 0004 is held to.

**To settle:** add both to the `has_function_privilege('anon', …)` list, and
observe the gate go RED with one of the revokes removed.

**Settled:** both are in the list. With either revoke deleted from 0004 the
gate was green before and is RED now; each was tried.

---

## N13 — Unreadable lines cannot be dismissed, and a re-import repeats them *(settled 2026-09-23, Sitting B)*

**Seen:** 2026-09-22, showing `ingest_unreadable_lines` on Review (P1).

Review now lists the lines imports from the last six weeks could not read.
Nothing records that the owner has dealt with one, so each stays on screen
until it ages out, and importing the same statement twice shows its lines
twice, under two imports: the table is unique on (batch, line), not on the
statement. The browser has no write on the table (0004), which is right, so
dismissing needs a new column and a SECURITY DEFINER function.

**Why not fixed here:** it needs a migration, and P1 adds none.

**To settle:** in the next migration batch, add `dismissed_at timestamptz`
and a `dismiss_unreadable_line(uuid)` function checking ownership, add it to
the anon-execute assertion, then give each line a dismiss button and drop the
six-week window.

**Settled:** 0012 adds both, and the function is in the anon-execute
assertion. Each line on Review has a Dismiss button, and Review shows every
line not dismissed, however old. A statement imported twice still lists its
lines twice, under two imports; each can now be dismissed.

---

## N14 — Unreadable lines keep no text, and the reasons are worded for CSV

**Seen:** 2026-09-22, same slice.

0002 stores a line's position and reason only, deliberately, so Review can
show "Row 7" but not what row 7 said; the owner has to find it on the
statement. For a PDF the position counts transaction rows, not printed lines.
And `describeReason` says "in the format you chose" for unreadable dates and
amounts, which is true for a CSV and not for a PDF, where nobody chose one.

**Why not fixed here:** storing text is a privacy decision 0002 made on
purpose (it would put an unparsed amount in a second table), and rewording
the reasons changes the CSV import screen too.

**To settle:** reword the two reasons so they read true for both sources.
Leave the text unstored unless the owner finds row numbers too hard to use.

---

## N15 — The plan asks for Comfortaa numbers in tabular digits, which Comfortaa lacks

**Seen:** 2026-09-22, S1 (Workbook's look).

§6.6 says big numbers use Comfortaa, and §6.2 says the Month rows' numbers
use tabular digits. Comfortaa cannot do both: the Google Fonts subset carries
no `tnum` feature (its features are ccmp, dnom, frac, liga, locl, numr), and
its digit widths differ, with the 1 at 378 units against 568–647 for the
others. So `Figure` (Comfortaa) is only for a number standing on its own, and
a column of amounts that must line up stays in the system face with `tnum`.

**Why not fixed here:** S1 builds the styles, not the Month blocks, and the
plan text is not part of this slice.

**To settle:** before S5b, say in §6.2 and §6.6 that the block columns use
the system face with tabular digits and that Comfortaa is for the big
standalone totals only.

---

## N16 — main's `pt-6` never applies, so screens start flush with the top *(settled 2026-09-23, S5a)*

**Seen:** 2026-09-23, S2b (Setup's phone screenshot).

`App.tsx` gives `<main>` both `safe-top` and `pt-6`. `.safe-top` is declared
in `index.css` outside Tailwind's layers, so it beats the `pt-6` utility and
the padding is `env(safe-area-inset-top)` alone: 0 in a browser tab. Setup
was pulling its band up by the 24px it assumed, which hid its back button.
Every other screen's heading sits at the very top edge of a phone browser.

**Why not fixed here:** it changes the top of every screen, and S5a rebuilds
the navigation shell anyway.

**To settle:** in S5a, write the padding as
`calc(1.5rem + env(safe-area-inset-top))` on `<main>` instead of two classes,
and look at each screen on a phone.

**Settled:** S5a gives `<main>` one class, `.pt-screen`, holding
`calc(1.5rem + env(safe-area-inset-top))`.

---

## N17 — Removing a category is refused for more than charges *(settled in part 2026-09-23, S6)*

**Seen:** 2026-09-23, S2b.

`merchant_rules` and `ingest_candidates` reference `categories` ON DELETE
RESTRICT, like `transactions` (0001). A category with a learned shop rule, or
an approved candidate, but no charge left (after S6's recategorise with
`p_learn = false`) is refused with 23503, and Setup says it "still has
charges filed under it". Moving charges from a screen also waits for S6.

**Why not fixed here:** the sentence is the plan's (§6.5), and the fix
belongs with S6, which is where charges and rules move.

**To settle:** at S6, word the remove message for charges or learned shops,
and say where to move them.

**Settled in part:** S6 words the message for charges or learned shops, and
says to move each charge from its Month row with "Always file" ticked, which
moves the shop's rule with it. Still open: a shop rule whose charges were all
moved with "Always file" off, or whose charges were removed, keeps the
category and has no screen to move or forget it, so removing is refused with
nothing the owner can do. It needs a list of learned shops (Settings or
Setup), reading `merchant_rules`, with a way to re-point or delete one.

---

## N18 — Two of Setup's messages wait on monthly amounts *(settled 2026-09-23, S9)*

**Seen:** 2026-09-23, S2b.

§6.5 lists "that list can't have a monthly amount" and "remove the monthly
amount first". Setup maps the second to a refused move (23514) now; nothing
sets a monthly amount yet, so the first has no action to attach to and is
not written.

**Why not fixed here:** both depend on 0009 `category_plans` (Sitting B).

**To settle:** in 0009, have both triggers raise `check_violation` (23514),
and at S9 add the "set amount" action to `describeSetupFailure` with the
first sentence.

**Settled in part:** both of 0009's triggers raise 23514, so a refused move
already shows "Remove the monthly amount first, then move it to another
list." Still open: the "set amount" action and its sentence, at S9.

**Settled:** S9 sets monthly amounts from Setup, and an amount refused by
0009's trigger (the category moved off Bills, Debts and Subscriptions on
another device) says "That list can't have a monthly amount: only Bills,
Debts and Subscriptions can." The sentence lives in `describePlanFailure`,
beside the read's, rather than in `describeSetupFailure`, because a read
of monthly amounts needs its own words too and must never say "nothing was
saved" (N28). A refused move now says how to remove the amount: "Remove
the monthly amount first (Stop, under its amount), then move it to another
list."

---

## N19 — Settings offers a weekly budget on lists the Week no longer counts *(settled 2026-09-23, S8)*

**Seen:** 2026-09-23, S3b (Week counts by list).

Settings → Weekly budgets lists every category with a budget field. Since
S3b, `weeklySummary` sums budgets over bills, debts, subscriptions and
variable expenses only, so a limit typed on an Income, Savings or Not
spending category is stored and then ignored by Week, with nothing on
screen saying so. After "Start from Workbook's list" that is 10 of the 31
names (the goal's makes 11), and the card is 30-odd rows long.

**Why not fixed here:** S3b is the engine and the Week screen; which
categories Settings shows is a Settings change, and S5a moves Settings
under More anyway.

**To settle:** in Settings, show the budget field only for spending lists,
grouped under Workbook's headings as the pickers are (`CategoryOptions`), and
leave any stored limit on the other lists untouched.

**Settled:** Settings lists weekly budgets for Bills, Debts, Subscriptions
and Variable expenses only, under their headings, and its "new category"
picker offers those four lists. Which lists are spending is core's
`SPENDING_LISTS`, the set the Week sums over. A limit stored on another list
is kept and not offered.

---

## N20 — The period engine is narrower than the plan's §5.1 table, for now *(settled 2026-09-23, S7, S10, S11 and S12b)*

**Seen:** 2026-09-23, S4a and S4b (the period engine).

Plan §5.1 gives `monthSheet` the budget and plan *histories* and has it
resolve them, and gives `periodSheet`'s output a summary card, a budget
total, Remaining or Difference, and `shareBp` on every row. As built,
`monthSheet` takes budgets and plans already resolved for the month, and
the output has only the rows, Actuals, `basis`, block Actual totals,
`transfersCents` and `importedThrough`.

**Why not done here:** the task said to pass budgets and plans resolved,
because resolution (D12, D13) reads Sitting B's tables. The rest each has
its own slice and golden cells in §8 — Remaining, Difference and Left to
spend at S7, Spent at S10, the ending balance at S11, `shareBp` at S12b —
and CLAUDE.md wants a golden assertion seen failing before the code that
passes it. Building them now would let those goldens pass on first run.

**To settle:** S7 adds history resolution to `monthSheet` (or a resolver
it calls) with the budget columns; S10, S11 and S12b add the rest.

**Since:** S5b needed Spent and Left to spend for the Month's summary card,
so both landed then, in `summary`, with their own golden cells
(`workbook-month-summary`: Jan!D11, D13, Feb!D11, Dec!D11, Weekly!D11, D13,
Paycheck!D13), seen failing first. S7 and S10 keep the rest of their cells.

**Settled in part:** S7 gives `monthSheet` the budget history and resolves
it (`resolveBudgets`, D12), and gives every row its budget, a Remaining or
Difference wherever F16 gives one (never on Income), and every block its
budget total, with V21 and V9 (F16; `workbook-month` part 1). Still open: `monthSheet` takes monthly amounts
already resolved (plan history, S9), the ending balance and the summary's
income and saved (S11), and `shareBp` (S12b). `shareBp` was left for S12b,
where §8 puts it, because what a share is of is a chart's question: the
spending doughnut needs a row's part of its block, the income bars need
Actual against Goal, and a refund can make a row, or a whole block,
negative, which no slice of a doughnut can show.

**Updated 2026-09-23, S9:** core now resolves monthly amounts from
everything typed (`resolvePlans`, D13) and totals them for Setup
(`billsTotals`, workbook-bills). `monthSheet` still takes them already
resolved, and the Month still passes none: plan §8 puts planned amounts on
the Month at S10, whose workbook-month part 2 cells should be seen failing
before `monthSheet` takes the plan history. A plan history can hold rows
for a category since moved off the three recurring lists (0009 allows it
once the amount has stopped); `periodSheet` refuses a plan for any other
list, so S10 must leave those out, as `billsTotals` does. The comment in
`MonthScreen.tsx` beside `plans: []` says "read here from S9"; it is S10's
to correct when it wires them.

**Updated 2026-09-23, S10:** `monthSheet` takes the plan history and
resolves it for its month (`resolvePlans`, D13), proven by workbook-month
part 2 (seen failing first). It leaves out an amount on a category moved off
the three recurring lists, and refuses one naming a category it was not
given, as `billsTotals` does. Still open: the ending balance and the
summary's income and saved (S11), and `shareBp` (S12b).

**Updated 2026-09-23, S11:** the summary carries the typed starting
balance, income, saved and the ending balance (F7), proven by workbook-month
part 3 (seen failing first); with no start typed there is no ending balance
(D17). Still open: `shareBp` (S12b).

**Settled, S12b:** every row carries `shareBp`, its part of the rows above
zero in its block, half-up (F17), so a row refunds took below zero has none
rather than a slice. The income bars' Actual against Goal is `goalBars`
beside it: both in basis points of the largest, one scale for every row.
Hand-derived tests, seen failing first; Workbook prints no share to replay.

---

## N21 — Review's unreadable lines read at most 100 imports, uncounted *(settled 2026-09-23, Sitting B)*

**Seen:** 2026-09-23, S4c (whole-month reads).

`listUnreadable` in `apps/web/src/ledger.ts` reads the imports of the last
six weeks with `.limit(100)` and no count, so a 101st import's unreadable
lines would not show, with nothing to say so. The lines themselves are
counted. A hundred imports in six weeks is unlikely for one person, which
is why it is noted rather than fixed.

**Why not fixed here:** S4c changes the ledger read the Month will total;
this is Review's read.

**To settle:** read the batches with an exact count, as `listTransactions`
now does, or fold them into one query — and settle N13's six-week window
at the same time.

**Settled:** `listUnreadable` now reads the lines still waiting first, with
an exact count, and then only the imports those lines came from, so no cap
on imports can hide a line. The six-week window is gone with N13.

---

## N22 — A whole-month read can still miss a row changed at just the wrong moment

**Seen:** 2026-09-23, reviewing S4c (whole-month reads).

`listTransactions` in `apps/web/src/ledger.ts` pages by offset and refuses a
read whose count moves, whose page comes back empty early, or where a row
arrives twice. One change slips past all three: while the month is being
read, a row on an already-read page is deleted and a row that sorts after the
next page is added. The count holds, nothing repeats, and the first row of
the next page is skipped. It needs more than 1,000 rows in the month and two
edits landing between two page requests, so for one person it is very
unlikely, and reloading shows the right total.

**Why not fixed here:** closing it means keyset paging (`posted_on`, `id`
after the last row seen) or one server-side read, a larger change than S4c's.

**To settle:** page by key rather than offset, and keep the exact-count check.

**Updated 2026-09-23, S8:** the paging now lives in `readAll`, which
`listTransactions` and the Month's budget read (`listBudgetHistory`) both
use, so the budget read has the same gap, and one keyset change in
`readAll` closes both.

---

## N23 — The Month says where statements end, not where they begin

**Seen:** 2026-09-23, S5b, running a real statement through the reader.

A card statement runs across two months (for example Aug 8 – Sep 7). After
importing only that one, August's Month says "Statement imported up to 7 Sep
2026", which is true, but August 1–7 came from the statement before, which
was never imported. The month looks complete and is short by a week.

**Why not fixed here:** saying it needs the earliest period start as well as
the latest end, and a rule for gaps between statements; that is engine work
(`importedThrough` gives only the latest end) beyond S5b's screen.

**To settle:** have core return the covered span, or the uncovered days, for
the month, and have the Month say "Aug 1–7 not imported yet" when a gap is
inside it.

---

## N24 — A home-screen icon added before S5a still opens on Week

**Seen:** 2026-09-23, S5a.

The manifest's start address changed from `/#/week` to `/`, so that the app
reopens on the last month shown. An iPhone keeps the start address it saw
when the icon was added, so an icon added earlier keeps opening Week.

**Why not fixed here:** the app cannot change an installed icon, and
rewriting `#/week` on open would break asking for Week on purpose.

**To settle:** tell the owner once: remove the icon and add it again from
Safari's Share menu.

---

## N25 — "Always file" moves the shop's rule, not its other charges

**Seen:** 2026-09-23, S6 (moving a charge from the Month).

Moving one charge with "Always file <shop> here" ticked re-points the shop's
learned rule, so the next statement files it in the new place, but the same
shop's other charges already posted stay where they were. A shop filed wrong
eight times in a month takes eight moves, and until then the rule and those
charges disagree.

**Why not fixed here:** `recategorise_transaction` (0006) moves one row by
design, and moving the rest is a new function (or a loop of calls that can
stop part-way), which needs its own migration or a decision on partial moves.

**To settle:** after a move with "Always file" on, offer "Move the other N
from <shop> in <month> too", backed by one function that moves every row of
that normalised merchant in a date range in one transaction.

---

## N26 — A charge filed under Not spending cannot be opened from the Month

**Seen:** 2026-09-23, S6.

Not spending (`transfer`) has no block on the Month, only the footnote "Paid
to your card: … — not counted", so a purchase filed there by mistake leaves
every total and cannot be reached to move back. Setup can move the whole
category, not one charge. It also means Setup's "can't remove this
category" message (N17), which says to tap the category's row on the Month,
points at a row that does not exist when the category is on Not spending.

**Why not fixed here:** S6 is about tapping a Month row, and the footnote is
one sum over possibly several categories, so it needs its own design.

**To settle:** make the footnote open a sheet listing that month's Not
spending charges, each with "Move to…", as a Month row does.

---

## N27 — An income source with a pay schedule can move off Income *(settled 2026-09-23, S15b and S15c)*

**Seen:** 2026-09-23, writing migration 0011 (Sitting B).

0011 refuses a pay schedule on anything but an income source, but nothing
refuses moving an income source with a schedule to another list, so the
schedule stays behind on, say, a savings fund. 0009 does refuse that move
for a bill with a monthly amount.

**Why not fixed here:** the task specified only the check on
`pay_schedules`. A matching trigger on `categories` would raise 23514, and
Setup turns 23514 on a move into "Remove the monthly amount first", which
is the wrong sentence for a pay schedule.

**To settle:** at S15b, either refuse the move with its own code and a
Setup sentence ("remove the pay schedule first"), or have Paycheck and the
Bill Calendar read schedules for income sources only. Until then nothing
reads `pay_schedules`, so nothing is wrong on screen.

**Settled in part, S15b:** the second way. Paycheck reads a schedule only
for a category on Income, so one left on a moved category is not read, and
Setup offers Paid and First payday on Income rows only. The schedule stays
stored, unseen, and comes back if the category moves back to Income. Still
open: the Bill Calendar (S15c) must read them the same way.

**Settled, S15c:** the Bill Calendar reads them the same way: `billCalendar`
names a payday only for a schedule on a category on Income, so one left on
a moved category pays nobody there either (tested in core and on the
screen). Refusing the move itself, with its own Setup sentence, was not
needed for either screen and was not built.

---

## N28 — A read that meets a missing column says "nothing was saved" *(settled in part 2026-09-23, S8)*

**Seen:** 2026-09-23, Sitting B (Review reads 0012's `dismissed_at`).

If this branch is merged before 0012 is pasted, Review's read of unreadable
lines fails with Postgres code 42703 (no such column), and
`describeWriteFailure` words it "Something went wrong and nothing was
saved. (code 42703)". That is worded for a write, and does not say that a
database update is missing. Screens built on 0008 to 0011 will meet the
same.

**Why not fixed here:** `describeWriteFailure` is shared by every screen;
changing its sentences is its own change. docs/setup.md now says to paste
every migration, in order, before merging.

**To settle:** give 42703 and PGRST202 (no such function) one sentence
naming the fix, as `MOVE_FAILURES` does for 0006: "This needs a database
update that has not been applied yet — see the migrations in the setup
guide."

**Settled in part:** the Month's budget read and save have their own
sentences (`describeBudgetFailure`). A missing `category_budgets` table
(PGRST205, or 42P01 from an older PostgREST) says 0008 has not been applied,
and a read never says "nothing was saved". Still open: every other read,
and 42703 and PGRST202 in `describeWriteFailure`.

**Updated 2026-09-23, S11:** the Month's starting balance has its own
sentences too (`describeBalanceFailure`): a missing `month_balances` says
0010 has not been applied, and its read shows no month rather than ask for
a balance that may be stored.

---

## N29 — ROADMAP still says the month view is not built

**Seen:** 2026-09-23, S7 (the budget engine).

`docs/ROADMAP.md`'s table of workbook features says the twelve month tabs
are "To be built that way in the Workbook plan (S5b); not built yet". S5b
built the Month screen, and S7 its budgets in the engine.

**Why not fixed here:** S7 is engine work, and ROADMAP's other markers are
out of date too (N10); fixing one line would leave the page half-current.

**To settle:** with N10, bring ROADMAP up to what is built.

---

## N30 — A budget on a category in no block is dropped without a word *(settled in part 2026-09-23, S8)*

**Seen:** 2026-09-23, S7 (the budget engine).

`periodSheet` refuses a ledger row or a monthly amount that names a
category it was not given. A budget for such a category, or for one on Not
spending, is left out instead: it reaches no row and no total. 0008 has no
check on the category's list, so a budget typed on a Variable row stays
stored if the category moves to Not spending, is ignored while it is
there, and counts again if the category moves back. Nothing reads budgets
from the database yet, so nothing is wrong on screen today.

**Why not fixed here:** S7 is the engine. What the owner should see when a
budgeted category moves to Not spending is a Setup and Month question, and
S8 is where budgets reach a screen.

**To settle:** at S8, decide whether Setup says the budget is kept when a
budgeted category moves to Not spending, and whether `periodSheet` should
refuse a budget for a category it was not given, as it does ledger rows and
monthly amounts, so a screen that reads categories and budgets at different
moments fails loudly instead of showing a short total.

**Settled in part:** `periodSheet` now refuses a budget naming a category it
was not given, and the Month says a charge or a budget names a category that
did not load. A budget on a Not spending category is still accepted and
shown in no block, since it counts again if the category moves back. Still
open: Setup does not say the budget is kept when a budgeted category moves
to Not spending, and while it is there the Month has no row from which to
see or clear it.

---

## N31 — CONSTRAINTS.md's measured figures are far below today's

**Seen:** 2026-09-23, S7 (the budget engine).

CONSTRAINTS.md's "Measured, not yet enforced" table gives 9 golden
assertions and 283 tests as today's figures. At S7, `vitest run` runs 638
tests, 39 of them in the golden files. Neither figure has fallen, so the
ratchet holds, but a floor this far under the real count would not notice
most of the suite being deleted.

**Why not fixed here:** CONSTRAINTS.md changes go in their own commit, not
inside a slice.

**To settle:** in its own commit, re-measure both figures and write them
in, dated.

---

## N32 — The plan puts Workbook's four-across Month at 1024px; S8 moved it to 1280px

**Seen:** 2026-09-23, S8 (budgets on the Month).

Plan §6.3 heads the desktop layout "Month on desktop (≥1024 px …)", and S5b
built it at Tailwind's `lg` (1024px). With S8's three columns of amounts, a
card four across is 234px wide at 1024px and 298px at 1280px or wider, and a
Bills table needs about 342px with a "$" on every figure. S8 drops the "$"
in row cells, as §6.2's phone sketch already does, uses a smaller table type
four across, and starts the four-across arrangement at 1280px, with two
columns below it. The plan's text still says 1024.

**Why not fixed here:** the plan is the owner's agreed document; S8 changes
the screen, and the reason is recorded in the S8 commit and in
MonthScreen.tsx.

**To settle:** with N15's wording changes to §6.2 and §6.6, change §6.3's
"≥1024 px" to "≥1280 px (two columns from 768 px)", and note that row cells
carry no "$" while band totals do. S12b's chart panel sits in the same grid
and should be measured at 1280px.

**Updated 2026-09-23, S12b:** measured. At 1280px the chart panel is one
card of four, 300px wide, second on the top row as §6.3 draws it; the
summary card, which had spanned two columns there, takes one and stacks
its four figures. From 768px to 1279px the panel spans both columns under
the blocks, its two charts side by side. §6.3 still says 1024.

---

## N33 — A "just this month" budget typed elsewhere can outlast a "from this month on" edit

**Seen:** 2026-09-23, S8 (typing a budget on the Month).

A month's own "just this month" value wins over anything typed "from this
month on" there (D12). So when the owner types "from this month on" on a
month that has one, `setBudget` gives it the new value in the same write.
It knows the month has one from the history the Month read. One typed on
another device after that read is not replaced: the save succeeds, the
Month re-reads, and the month still shows the other device's value. Typing
it again fixes it.

**Why not fixed here:** checking and writing in one step needs a database
function (a new migration and another paste for the owner), for a case that
needs two devices editing the same month's budget within seconds.

**To settle:** if it is ever seen, add a `set_category_budget` function that
upserts the 'onward' row and updates the month's 'only' row, if one exists,
in one statement, and call it from `setBudget`.

---

## N34 — Setup writes a row's day and amount together, from what it last read

**Seen:** 2026-09-23, S9 (Setup's day paid and monthly amount).

A monthly amount and its day paid are one row per month in 0009, and a
PostgREST upsert writes every column it is given, so Setup sends both on
every save: the one being changed, and the other as the row's field holds
it. If another device changes the day paid for this month after Setup read
it, and the amount is then changed here, the save puts the old day back.
Typing the day again fixes it. It needs two devices editing one bill's row
within the same few minutes.

**Why not fixed here:** writing one column of this month's row, or adding
one carrying the rest forward, in a single step needs a database function
(a new migration and another paste for the owner), for a case as unlikely
as N33's.

**To settle:** if it is ever seen, add a `set_category_plan` function that
upserts this month's row taking the unchanged column from the row in
effect, in one statement, and call it from `setPlan`.

---

## N35 — The Month can say a category "did not load" for a moment on opening *(settled 2026-09-23, S10)*

**Seen:** 2026-09-23, reviewing S9 (the same fault, fixed in Setup).

The Month reads its charges and budgets as soon as it opens, while the
app's own first load, which brings the categories, may still be on its
way. If the month's rows arrive first, `monthSheet` is given charges whose
categories it was not given, refuses them, and the Month shows "Could not
show this month: A charge or a budget this month names a category that did
not load" until the categories arrive and it redraws. Seen in a test that
holds the categories back on the first load. The Month opens first
(decision 1), so a slow first load can show this red box on launch.
Nothing is wrong with the data.

**Why not fixed here:** S9 is Setup. Setup had the same fault in its new
monthly amounts, and waits now for the app's first load (`version` above
0) before reading them; the Month's read is S5b's and S8's.

**To settle:** have the Month's read wait for the app's first load, as
Setup's starter button and monthly amounts do, with a test that holds the
categories back and checks no alert appears meanwhile.

**Settled:** the Month reads nothing before the app's first load (version
0), as Setup's monthly amounts wait; S10 gave it monthly amounts to read
too, each of which would have been refused the same way. A test holds the
categories back and checks the Month has read no charges and shown no
alert by the time the rest of the first load is in, then shows the month
once they arrive; it failed before the change. Waiting exposed four Month
tests that read a block as soon as the title showed, passing only because
the rows had already come; each now waits for the block. If the first load
fails, the Month stops saying "Loading…" under the app's own message.

---

## N36 — A card-paid bill whose charge slips past a month end counts twice

**Seen:** 2026-09-23, S10 (planned against real on the Month).

D5 works a month at a time: a real charge in a month replaces the planned
amount, and a month with none counts the plan. A subscription due on the
30th whose charge lands on the 1st of the next month leaves its own month
with no real row, so that month counts the plan ($17.99, planned), and the
next month holds two real charges, the late one and its own ($35.98). Two
months, two bills, $53.97 counted. The same happens to anything charged
near a month end on a day that moves (weekends, a 31st in a short month),
and it repeats whenever it drifts back. Within one month nothing is
counted twice, which is what decision 3 asked about.

**Why not fixed here:** S10 builds the rule the owner chose, and the
workbook has no answer: Workbook adds fixed and logged amounts (F3), which is
worse. Deciding which month a late charge belongs to changes a number the
owner would see, so it is theirs to choose.

**To settle:** put it to the owner with options: A — leave it, and say in
Setup that a bill charged to the card near a month end can leave its
monthly amount blank, as §10 item 4 says for yearly bills; B — a real
charge within a few days after the due day counts for the month it was due
(needs the due day, and a rule for how many days); C — mark a bill "paid
by card" in Setup, and once a statement covering its due day is imported,
count only its real rows, so a late charge moves to the next month but is
never counted twice (needs a new column; rent paid from the bank keeps its
plan).

---

## N37 — Three things about the Month's End of month the owner has not been told

**Seen:** 2026-09-23, S11 (the summary card).

1. **D17 was never put to the owner.** With no starting balance typed, the
   Month shows no End of month, where Workbook counts from $0. It is recorded
   as an engineering default, stated to no one. CLAUDE.md lists a
   deliberate divergence under "Ask first".
2. **End of month reads low until pay is typed.** Planned bills count in
   full for the whole month (F8, F10), and pay counts only once it is typed
   (decision 8). Partway through a month, before payday, End of month can
   show below zero. Workbook's D15 reads the income typed so far (Jan!N5) and
   behaves the same.
3. **A negative End of month is not highlighted.** Workbook's pink marks only
   a negative Left to spend (Jan!D13:E14), so an overdrawn End of month
   shows its minus sign in the card's normal colour.

**Why not fixed here:** each is how S11 was specified, and none is a wrong
number. The first is a question for the owner; the second and third are
things to explain.

**To settle:** tell the owner once, and ask whether they want D17 kept
(no End of month until Start is typed) or Workbook's $0 start. If they want
an overdrawn End of month to stand out, that is a display-only divergence
and needs its own D-entry.

---

## N38 — The doughnut's biggest slices can be its palest

**Seen:** 2026-09-23, S12b (the Month's charts).

Workbook colours its spending doughnut by row (Jan chart13, points idx 0–22),
palest first, and the app copies that. The starter list puts Restaurants
and Groceries first, so the two categories most people spend most on get
the two palest colours, #FFE3DE and #F9D8D3, close to each other and to
the card; the darker half of the scale shows only from a list's ninth
row. Slices are parted by a gap and every one is named in the legend with
its amount and share, so nothing is unreadable, but the ring looks washed
out, where a chart's neighbouring colours would usually be set clearly
apart.

**Why not fixed here:** the plan asks for Workbook's fills (§6.6; decision
10), and giving the rows other steps of the scale is a change of look the
owner has not asked for. CLAUDE.md puts a deliberate divergence under Ask
first.

**To settle:** show the owner the ring and ask. A — keep Workbook's colours
by row. B — spread the same scale over the list's length (eight categories
take every third step, #FFE3DE to #4C0B02), still one colour per row, with
a D-entry. C — colour by spending rank; not recommended, as a category's
colour would change from month to month.

---

## N39 — The charts are in the entry bundle, which a pending CONSTRAINTS row says they should not be

**Seen:** 2026-09-23, S12b, building the app.

CONSTRAINTS.md's Pending table has "Web entry bundle ≤700 KB gzipped,
≤115% of baseline; SheetJS and charts out of the entry chunk". The Month's
charts (chart-specs and MonthCharts) are in the entry chunk: the build went
from 678.19 kB (192.83 kB gzipped) before S12 to 686.00 kB (195.62 kB
gzipped), 2.8 kB gzipped more. The row is not enforced yet.

**Why not fixed here:** the row was written with a chart library in mind;
these charts are hand-built SVG, and the Month, which opens first (decision
1), draws them on every open, so a chunk of their own would be fetched
straight after the entry every time, one more request for no saving.

**To settle:** when the bundle gate is built, either word the row as
"chart libraries", or split MonthCharts out with React.lazy; measure both.

**Updated 2026-09-23, S14:** the Year is its own chunk (20.56 kB, 7.01 kB
gzipped), and core and chart-specs are marked free of side effects, so the
Year's engine and charts stay in it. The entry went from 686.08 kB (195.66
kB gzipped) before S14 to 688.82 kB (196.79 kB): the Year's navigation,
address and the shared row reading. The Month's charts are still in the
entry, for the reason above.

---

## N40 — HANDOFF §5 still lists items 1, 2 and 4 as open

**Seen:** 2026-09-23, S12a review (closing item 5).

HANDOFF.md §5 is the next reader's list of what is left. S12a marks item 5
settled, but items 1, 2 and 4 still read as open although the plan's
pre-work addressed them: item 1 (screen tests) by P3, `ca35c76`, with N5
still open in part; item 2 (unreadable lines never shown) by P1, `a65497f`;
item 4 (tests that do not bite) by P2, `64293be` and `fdaa313`.

**Why not fixed here:** those slices are already on the branch, and each
entry should say what settled it, which is theirs to state.

**To settle:** mark items 1, 2 and 4 as settled in HANDOFF §5, naming the
slice and commit, with item 1 pointing at N5 for what is still unmeasured.

---

## N41 — The Month's charts were sized and checked in Chromium only

**Seen:** 2026-09-23, S12b.

The charts scale to their card with `width: 100%; height: auto` on an
inline SVG that carries its own width, height and viewBox (index.css,
`.workbook-chart`). S12b's screenshots at 390, 1024 and 1280px were taken in
Chromium, the only browser here. The owner's iPhone uses WebKit, which has
handled `height: auto` on inline SVG differently in the past, so the ring
could draw squashed or with a gap under it there.

**Why not fixed here:** nothing here can run WebKit, and a guess at a fix
for a problem not seen could break the browser that was checked.

**To settle:** open the Month on the iPhone (or in Safari) at a month with
spending, and look at the ring and the income bars. If either is the wrong
shape, give `.workbook-chart` an explicit `aspect-ratio` from the viewBox.

---

## N42 — A failed read on the Year says "this month"

**Seen:** 2026-09-23, S14 (the Year screen).

The Year reads budgets and monthly amounts through the Month's functions,
whose failure sentences end "so this month cannot be shown" or "so this
month is not shown". The Year shows them under "Could not load this year",
so the heading is right and the sentence says month.

**Why not fixed here:** the sentences live in `format.ts`
(`describeBudgetFailure`, `describePlanFailure`) with their own tests, and
giving them a Year wording is a change to the Month's messages too.

**To settle:** give both a `'year'` reader, as `describePlanFailure`
already has `'month'` and `'read'`, and pass it from the Year.

---

## N43 — Three Year defaults the owner has not been told

**Seen:** 2026-09-23, S14.

1. **The Year opens on this calendar year, from January.** Workbook's Annual
   has whatever start month was last typed; the app has no stored start,
   so a bare `#/year` is January of this year. The picker changes it, and
   the address keeps it.
2. **Best savings month with nothing saved shows the first month at
   $0.00**, as F18 decided, following Workbook's January. It could read as a
   real "best" month.
3. **Annual's column chart stacks expenses on income** (chart40, F19), so a
   column's height is income plus expenses, which means nothing on its own.
   The plan asked for Workbook's stack.

**Why not fixed here:** each follows the plan or a recorded decision; none
is a wrong number, but the owner would notice them.

**To settle:** tell the owner once. If they want the stack side by side
(F19 option C) or "Nothing saved yet" in place of a $0 month, each is a
display change with its own D-entry.

---

## N44 — weeklySummary has no caller since S15

**Seen:** 2026-09-23, S15 (the Week on periodSheet).

The Week now reads `weekSheet`, and nothing else called `weeklySummary`
(`packages/core/src/week.ts`). It was not removed: its tests could not be
kept equivalent, because what it computes is not what the Week now shows.
It totals one budget over every spending list with a share used, and
counts a row with no known category as "uncategorised"; `weekSheet` gives
Workbook's per-block totals and F5's Left to spend, and refuses a row it
cannot file, as the Month does. `weekBounds`, `shiftWeek`, `monthBounds`,
`shiftMonth` and `SPENDING_LISTS` in the same file are all still used.

**Why not fixed here:** removing it would delete tested behaviour with no
equivalent in its place, which the task allowed only if the tests moved
across unchanged.

**To settle:** when the savings coach's weekly limits are built (plan
slice 12), either build them on it or remove it with its tests.

---

## N45 — The Week shows no starting or ending balance

**Seen:** 2026-09-23, S15.

Workbook's Weekly Budget types a starting balance (D9, sample 1000) and shows
an Ending Balance (D15 `=D9+P6-D11-V6`). The app stores starting balances
per month only (0010), so the Week's summary shows Spent and Left to spend
and leaves both balances off. The engine takes a start and would give the
end (workbook-month part 3 proves Weekly!D15).

**Why not fixed here:** where a week's start comes from changes a number
the owner would see, so it is theirs to choose. It is raised as a blocker
and not yet answered, with options A: leave it off (built now); B: derive
it in the engine from the month's typed start and that month's rows before
the week; C: type one per week, which needs a migration.

**To settle:** record the owner's answer in docs/formula-decisions.md, then
build it.

**Updated 2026-09-23, S15b:** the Paycheck view is the same. Workbook's
Paycheck Budget types a start (D9, sample 1000) and shows an Ending Balance
(D15 `=D9+P6-D11-V6`, cached 465); the view shows Spent and Left to spend
only, and the same three options apply to a pay period. One answer should
cover both.

---

## N46 — What the Week does not have that the Month does

**Seen:** 2026-09-23, S15.

- **Tapping a row opens nothing.** The Month's charges sheet (with "Move
  to…") names its month; the Week has no sheet of its own, so a mis-filed
  charge seen on the Week is moved from the Month.
- **No charts.** Workbook's Weekly Budget has the Month's two (chart36, an
  income stack, and chart37, the Variable doughnut); `MonthCharts` words its
  empty states "this month". The flight goal stands in their place.
- **No address for a week.** `#/week` always opens this week; a refresh or
  the back gesture after stepping returns to this week, not the one shown.

**Why not fixed here:** S15 is the blocks and summary on the shared
engine; each of these is its own screen change.

**To settle:** give `MonthCharges` and `MonthCharts` a period word and use
them on the Week, and add `#/week/YYYY-MM-DD` (the Monday) to `nav.ts`.

---

## N47 — Weekly goals on Income and Savings are typed on the Week only

**Seen:** 2026-09-23, S15.

The Week reads each category's weekly budget as its Budgeted, or on Income
and Savings its Goal, as Workbook's Weekly Budget types Q10:Q16 and W10:W16.
It can be typed in the row on the Week. Settings → Weekly budgets still
lists the four spending lists only (N19). So a weekly limit stored on an
Income or Savings category before S15, which N19 left "kept and not
offered", now shows on the Week as that category's goal.

**Why not fixed here:** Settings' list is N19's settled answer, and the
Week is now the place a weekly budget is typed.

**To settle:** either offer Income and Savings goals in Settings too, or
drop the weekly budgets card from Settings now the Week types them.

---

## N48 — What the Paycheck view does not have that the Month does

**Seen:** 2026-09-23, S15b.

- **Tapping a row opens nothing,** as on the Week (N46): the Month's
  charges sheet names its month.
- **No charts.** Workbook's Paycheck Budget has the Month's two (chart38, the
  income stack, and chart39, the Variable doughnut); the card that says
  how a period's share is found stands in their place.
- **No review line.** The Month and the Week say how many charges wait for
  review; the Paycheck view does not, so a pending charge is simply not in
  it, as it is not counted anywhere (invariant 3).
- **The choice of income source is not kept.** With two sources on
  schedules, the one picked holds until the screen is left; it opens on the
  first in Setup's order again.
- **A failed read of budgets says "this month".** Monthly amounts have a
  `'paycheck'` wording; budgets have no reader argument, as N42 found on the
  Year.

**Why not fixed here:** S15b is the period, its share and the schedule
that finds it; each of these is its own screen change, and the first two
wait on N46's.

**To settle:** after N46 and N42, give the Paycheck view the Week's
answers; keep the chosen source in the address or on the device.

---

## N49 — The plan names Bill Calendar!Q14 where D5 changes Q20

**Seen:** 2026-09-23, S15c, re-reading Bill Calendar against the workbook.

`docs/workbook-plan.md` §5.4 lists "Bill Calendar!J3, Q14 | 1167.99, 200"
among the cells D5 changes. Q14 is the week of 5–11 January 2025: its only
entry is Credit Card 1's logged $200 on the 5th (B15:C15), which D5 keeps,
so Q14 is 200 under both rules. The week D5 changes is the next one, Q20
(**150**): Credit Card 1's $50 monthly amount on the 14th (F21:G21) plus
Car Loan's logged $100 (H21:I21); under D5 the $50 is replaced by the $200,
so Q20 is 100. J3 is right as listed (1,167.99; 1,117.99 under D5).

**Why not fixed here:** the S15c task repeated §5.4's list, so the
`workbook-bill-calendar` fixture leaves out both Q14 and Q20, and asserts the
$200 on the 5th through B15:C19 instead.

**To settle:** correct §5.4 to "J3, Q20 | 1167.99, 150", and add Q14 = 200
to `workbook-bill-calendar`.

---

## N50 — F15 says the Bill Calendar's bi-weekly paydays run back before the first pay date; they do not

**Seen:** 2026-09-23, S15c, re-reading Bill Calendar!C8:O38.

F15's last bullet ("Before the first payday") says Workbook's Bill Calendar
"is not consistent here: its bi-weekly paydays go back before START
HERE!C8, and its weekly and monthly ones do not". Every one of the 42
payday cells filters all three frequencies on `'START HERE'!C8:C44 <=
DATE(…)`, so none runs back. The Paycheck view's choice to run back (F15)
is unaffected; its stated reason is not quite right.

The two screens now differ: the Bill Calendar shows no payday before the
first pay date, as Workbook does (F20), while Paycheck steps back past it
into periods the same schedule gives. Nothing adds up differently; a
payday pill is a name, never an amount.

**Why not fixed here:** F15 is a settled entry for another slice.

**To settle:** correct F15's last bullet, and decide whether Paycheck
should stop at the first pay date or the calendar should run back too.

---

## N51 — What the Bill Calendar does not have yet

**Seen:** 2026-09-23, S15c.

- **Tapping a day or a bill opens nothing.** The Month's charges sheet
  (with "Move to…") names a category and a month, not a day.
- **A card-paid bill charged just after a month end** shows planned in its
  own month and twice in the next, as on the Month (N36). The calendar
  applies the same rule in its own code (`billCalendar`), so N36's answer
  has to be made there as well as in `monthSheet`.
- **The month shown is not kept per device** beyond the address; opening
  it from More always opens this month, as Paycheck opens this period.
- **The desktop bar shows icons only between 768 and 1024px** (nine tabs
  no longer fit with their words); Month and Year still share one icon.
  Since S16 (ten tabs) the words show from 1280px, and the bar takes the
  wide width on every screen.

**Why not fixed here:** each is its own screen change, and the second
waits on the owner's answer to N36.

**To settle:** with N46 and N48, give the Week, Paycheck and the calendar
one way to open a row's charges; give Year an icon of its own.

---

## N52 — What 0013 leaves for the Savings screen to handle *(settled in part 2026-09-23, S16)*

**Seen:** 2026-09-23, writing migration 0013 (Sitting C).

- **A fund's category can move off Savings.** 0013 refuses linking a goal
  to anything but a Savings-list category, but nothing refuses moving that
  category to another list afterwards, as with pay schedules (N27). Setup
  turns 23514 on a move into "Remove the monthly amount first", which would
  be the wrong sentence here.
- **Removing a fund's category is refused (23503)**, and Setup says it
  "still has charges filed under it", which is wrong for a category whose
  only tie is a fund.
- **A start date after the goal date is not refused.** Workbook shows `#NUM!`
  in Months Remaining and $0 as the Monthly Contribution (Savings!V14,
  Z14). Refusing it in the schema would be a divergence nobody chose.
- **`balance_as_of` must move with `saved_cents`.** Retyping a linked
  fund's amount without moving the date would count the transfers since
  the old date twice. Nothing in the schema enforces that; the save does.
- **The Settings card shows the oldest goal.** `getGoal` reads the first
  goal by `created_at`. Once there is one goal per fund, which one Settings
  and the Week show is an accident of which was created first.

**Why not fixed here:** nothing reads the new columns until S16, and each
is a screen or engine choice, not a migration's.

**To settle:** at S16, read a fund's transfers only while its category is
on Savings (as N27 settled it for pay schedules), give Setup a sentence for
a fund's category, decide what Savings shows for a start date after the
goal date, and have the save write `balance_as_of` whenever it writes
`saved_cents` on a linked fund, and decide which goal the Settings card and
the Week show once there are several.

**Settled in part, S16:**
- A fund whose category moves off Savings loses its card, and its goal
  reads no transfer and keeps its typed amount (`savingsFunds`); it can be
  linked again from any fund with no goal. Nothing refuses the move, so no
  Setup sentence is needed for it.
- A start date after the goal date gives no monthly figure, and the card
  says why (D22).
- The Savings screen writes `balance_as_of` (today) with every
  `saved_cents` (`saveFund`). Settings no longer edits a fund's goal: it
  points to Savings, since its form has no day to write.
- The Week shows a fund's goal with its kept balance, as Savings does.

Still open: removing a category that a goal names is refused (23503), and
Setup still says it "still has charges, or shops the app learned to file
here". And which goal the
Week and Settings show is still the oldest one; with the flight goal made
the flight fund's, that is the flight goal, but a second goal made first
would take its place. To settle: give Setup's remove a 23503 sentence that
names a savings goal, and let the owner choose the Week's goal (or show
the fund whose unit is hours).

---

## N53 — A debt names no Debts-list category, so its payments are not read

**Seen:** 2026-09-23, writing migration 0014 (Sitting C).

Workbook's Debt Calculator takes each debt's name from START HERE's Debts list
(H6 = `'START HERE'!D18`) but reads no charges: its balances come from the
schedule alone. 0014 keeps a debt's own name and no category link. A link
would show none of the payments on the debt most likely to be entered, a
card paid off from the bank, because that card is deliberately not a
Debts-list row (plan §3.3, decision 14).

Two things 0014 chose beyond the sheet: each debt has its own start month
(Workbook has one, D6), and an extra payment is kept against a calendar month,
not a schedule row number. When every debt shares a start month, the
schedule is the same as Workbook's.

**Why not fixed here:** whether a recorded payment should move a debt's
balance changes a number the owner would see, and has not been asked. For
savings the owner chose that it should (D16); nobody has asked for debts.

**To settle:** at S17, before `debtStatus`, ask: A — balances from the
schedule only, as Workbook; B — link a debt to a Debts-list category and let
recorded payments replace the schedule's; C — link it only to show recorded
payments beside the schedule. B or C needs a migration adding a nullable
`category_id` (no backfill); A needs nothing.

**Still open at S17 (2026-09-23).** The owner could not be asked during
S17. The Debts screen reads balances from the schedule alone, which is A
and is Workbook's own behaviour (F22), so nothing departs from the workbook
while the question waits; B or C can still be added without a backfill.

---

## N54 — A fund's monthly figure falls as it fills, not as its date nears

**Seen:** 2026-09-23, writing formula decision F21 (S16).

Workbook counts a fund's months from its typed Start Date to its Goal Date
(Savings!V14), not from today, and divides what is still needed by that
fixed count (Z14). With the balance now kept by transfers (D16), each
transfer lowers the monthly figure: a fund needing $1,867 over 21 months
asks $88.91 a month, and after ten months of that it asks about $47, though
only 11 months are left. Workbook does the same each time its current amount
is retyped. The app copies it (F21).

**Why not fixed here:** the formula is not ambiguous, and counting from
today instead would be a divergence the owner has not chosen.

**To settle:** tell the owner, and ask: A — keep Workbook's (months from the
start date); B — months from today to the goal date, so the figure is what
the rest of the goal needs each remaining month; C — keep the start date,
but divide what was needed on the start date. B or C is a D-entry and a
change to `savingsFundPlan` only.

---

## N55 — Two things a savings card can still show oddly

**Seen:** 2026-09-23, reviewing S16.

- **A fund past its goal, with both dates, shows a negative monthly
  contribution** (for example -$1.66), beside "goal reached". That is what
  Workbook's Savings!Z14 `=IFERROR((F14-J14)/V14, 0)` gives too, and
  `savingsFundPlan` copies it on purpose (F21, its tests pin -250), but a
  minus sign on "what to save each month" reads oddly.
- **A goal whose category moved off Savings, then linked to another fund,**
  keeps only the amount typed on its old day: the "Use … for this fund"
  button sets `balance_as_of` to today, so transfers into its old category
  between that day and today are dropped. The same goal, while on no fund,
  also opens Settings' old form (when it is the oldest goal), which writes
  `saved_cents` without a day.

**Why not fixed here:** the first departs from the workbook, which needs
the owner; the second needs a rule for what a re-linked goal's balance
should be.

**To settle:** ask the owner, for the first: A — keep Workbook's negative
figure; B — show no monthly figure once the goal is reached and say "goal
reached, nothing more to save" (a D-entry and a `savingsFundPlan` status).
For the second, have linking a goal that already has a `balance_as_of`
first write its kept balance as the typed amount, and keep Settings from
editing any goal with a `category_id`.

---

## N56 — The Rogers statement's balance does not reach the Debts screen

**Seen:** 2026-09-23, S17.

Plan §10 item 12 says the statement already prints its New Balance, which
reconciliation parses, so it could feed the Debts screen with no typing,
and that this and a "Bank / cash" account were "settled at S17". S17 did
neither: a debt is typed (starting balance, minimum, APR, start month),
as Workbook's are, and typed pay and savings still land in "Main Card".

**Why not fixed here:** feeding a statement balance into a debt changes
what its balance means (a schedule from a typed start, F22, against the
card's printed figure each month), which is N53's question in another
form, and an account needs a migration and the owner's say.

**To settle:** with N53. If the owner chooses B or C there, the card's
New Balance can be the balance a debt restarts from each statement; the
account question goes with the first per-account figure.

---

## N57 — Three Debts defaults the owner has not been told

**Seen:** 2026-09-23, S17.

1. **"Paid this month"** on the summary is the schedule's payments for
   this month (the Debt Calculator's E column), not what was recorded;
   Workbook's E18 shows the first month's instead.
2. **The Year's debt chart shows today's balances** whichever year is
   shown, as its savings chart does, and as Home's H9 reads TODAY().
3. **Snowball and avalanche spend the same monthly amount** as the
   minimums-only plan (F23): nothing extra is assumed, so a person with
   more to put toward debt types it as extra payments.

**Why not fixed here:** each follows the workbook or a recorded
decision; none is a wrong number, but the owner would notice them.

**To settle:** tell the owner once.
