# Divergences from the workbook

Deliberate differences between this app and the source Excel workbook. Each
entry states the workbook's value, the value chosen here, and why.

A divergence is only valid once recorded here. Silently matching the workbook
is the default; departing from it requires this file.

---

## D1 — Money is rounded to whole cents each month

**Date:** 2026-09-21
**Sheet / cells:** Debt Calculator, B26:Y496

**Workbook behaviour.** Excel carries the amortization in IEEE-754 doubles and
retains sub-cent fractions indefinitely. Credit Card 1's month-2 balance is
`13087.92917` — a balance of 13,087 dollars, 92 cents, and 917 microcents.

**Chosen behaviour.** Interest accrues at `apr / 12` and is rounded half-up to
the cent each month, on integer minor units throughout.

**Why.** Fractions of a cent cannot be paid, received, or reconciled against a
statement. A balance that is not expressible in real money is not a balance.
Carrying sub-cent state would also require floating-point money everywhere,
which `CONSTRAINTS.md` forbids precisely because it produces numbers that
cannot be verified against a bank.

**Measured effect.** Across all four debts and their full schedules
(162 months total), the largest divergence from the workbook is **5 cents**, on
Credit Card 1 near the end of a 111-month run.

| Debt | Workbook payoff | Engine payoff | Max divergence |
|---|---|---|---|
| Credit Card 1 | month 111 | month 111 | 5c |
| Credit Card 2 | month 23 | month 23 | 3c |
| Car Loan | month 16 | month 16 | 0c |
| Student Loan | month 12 | month 12 | 1c |

**Every payoff month and the debt-free date are identical.** No decision a user
would make changes. The divergence is bounded and asserted as a hard ceiling in
`debt-payoff.golden.test.ts` — not a tolerance. If rounding ever gets worse,
the test fails.

---

## D2 — Cleared debts do not roll their payment forward

**Date:** 2026-09-21
**Sheet / cells:** Debt Calculator, H26:Y496

**Workbook behaviour.** Each debt pays only its own minimum for its entire
life. When the Student Loan clears at month 11 and the Car Loan at month 15,
that freed-up $475/month is not redirected. Credit Card 1 still takes its full
110 months, and the workbook reports debt-free May 2034.

**Chosen behaviour.** `amortize()` reproduces this exactly, because the golden
test requires it.

**Why this is recorded anyway.** The workbook's answer is *correct arithmetic
for a strategy nobody would choose*. Redirecting freed payments (the "snowball"
and "avalanche" strategies) pays the same debts off years sooner for the same
monthly outlay.

**Consequence.** Snowball/avalanche is a **new capability** this app adds, not
a port. It will be a separate function with independently derived test cases —
the workbook cannot verify it, because the workbook cannot do it. The flat
schedule remains the golden-verified baseline that proves the underlying
amortization is right.

---

## D3 — One signed ledger replaces three parallel ones

**Date:** 2026-09-22
**Sheet / cells:** Monthly Budget income and expense blocks; Weekly Spending

**Workbook behaviour.** Direction is carried by *location*. Income rows live on
one block, expenses on another, and transfers on a third; every amount is
written as a positive number, and what it means depends on which block it sits
in. A formula sums a range and knows the sign from the range it summed.

**Chosen behaviour.** One `transactions` table with a signed `amount_cents`:
**outflows negative, inflows positive.** Direction is a property of the row.

**Why.** A database filters where a spreadsheet had to separate. Keeping three
tables to preserve the layout would mean three dedupe indexes, three RLS
policies, and a categorization path per table — and every cross-cutting
question ("what did this week actually cost?") becomes a union. With a signed
column, a net figure is a sum, and the sign cannot be lost by reading a row
without knowing which table it came from.

**Consequence.** Anything that assumed positive-means-spend must say so
explicitly. A category total for a spend category is a negative number, and
the display helper is responsible for rendering it as `$80.00` under a heading
that already says it is spending — not for deciding what it means.

**Not a maths change.** No workbook figure moves. This is how a row is stored,
not how any total is computed, and the debt golden case is untouched by it.

---

## D4 — Every CSV field is trimmed, against RFC 4180

**Date:** 2026-09-22
**Sheet / cells:** not workbook-derived; a property of the import path

**Standard behaviour.** RFC 4180 treats spaces as field content. `COFFEE   ,`
has a merchant of `COFFEE` followed by three spaces, and a conforming reader
preserves them.

**Chosen behaviour.** `tokenizeCsv` trims leading and trailing whitespace from
every field, quoted or not.

**Why.** The merchant string is an input to the dedupe hash. Exports pad
columns inconsistently between downloads of the same statement — a pending row
and its posted counterpart often differ by nothing but padding — and an
untrimmed field makes the same charge hash differently on re-import, so it
enters the ledger twice. That is the silent-duplicate failure the hash exists
to prevent, reintroduced by faithfulness to a specification that has no opinion
about ledgers.

**What this costs.** A merchant whose name genuinely begins or ends with a
space cannot be represented. No such merchant exists in practice, and the
alternative costs duplicated transactions.

**Frozen.** This is now an input to `DEDUPE_HASH_VERSION` 1. Changing the
trimming rule changes every stored hash and therefore requires a version bump
with a backfill in the same migration, exactly as changing the hash's field set
would. It is recorded here so that a later "let us preserve whitespace
properly" cleanup is recognised as a migration rather than a tidy-up.

**Not applied elsewhere.** `IngestedTextSchema` deliberately does not trim; one
module owns this normalization and it is the tokenizer.
