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

## N12 — Two 0004 functions are missing from the anon-execute assertion

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

---

## N13 — Unreadable lines cannot be dismissed, and a re-import repeats them

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
