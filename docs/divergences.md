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
