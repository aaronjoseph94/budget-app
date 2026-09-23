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

## N9 — A blank starting balance is a divergence with no D-number

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

## N18 — Two of Setup's messages wait on monthly amounts *(settled in part 2026-09-23, Sitting B)*

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

---

## N19 — Settings offers a weekly budget on lists the Week no longer counts

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

---

## N20 — The period engine is narrower than the plan's §5.1 table, for now *(settled in part 2026-09-23, S7)*

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

## N27 — An income source with a pay schedule can move off Income

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

---

## N28 — A read that meets a missing column says "nothing was saved"

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

## N30 — A budget on a category in no block is dropped without a word

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
