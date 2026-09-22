# Formula and format decisions

Questions that had more than one defensible answer, the answer chosen, and who
chose it. CLAUDE.md requires an ambiguity to be settled here before code is
written, so that a number nobody can explain later has a place to be looked up.

A decision is recorded with its source — a workbook sheet and cell, or the
part of a statement it was read from — because "we chose B" is only useful
alongside what A and B were.

---

## F1 — Which of a statement's two dates is a transaction's date

**Decided 2026-09-22 by the account holder.**

A Rogers Bank Mastercard statement gives every transaction two dates:

```
Trans   Post
Aug 7   Aug 10   LAVA GRILL RED DEER AB    31.45
```

`Trans` is when the card was used. `Post` is when the bank settled it, up to
four days later.

**Options put to the user**

- **A — the transaction date.** Matches what a person remembers doing. A
  Saturday coffee appears on Saturday. The app's monthly totals will not equal
  the statement's monthly totals, because the bank cuts its month on settlement.
- **B — the posting date.** Monthly totals reconcile with the statement to the
  penny. A purchase can appear up to four days after it was made, and weekend
  spending lands on Monday.
- **C — store both, display the transaction date.** Most flexible, more to
  build, no decision locked in.

**Chosen: A.** In the user's words, "when I bought it".

**Consequence.** `posted_on` in the ledger holds the TRANSACTION date despite
its name. The column name predates this decision and is not worth a migration
on its own; it should be renamed the next time that table is altered for
another reason. The posting date is currently discarded, which means option C
is not available later without re-importing — accepted knowingly, because the
statements are re-importable at any time and the dedupe hash makes a second
import of the same file a no-op.

**Where the periods do not line up.** A transaction made a few days before a
statement period opens still appears on that statement. The year for a bare
`Aug 6` therefore comes from a window that starts 60 days before the period —
see `packages/statement-parsers/src/statements/yearless-dates.ts`.

---

## F2 — Sign convention when importing a Rogers statement

**Decided 2026-09-22. Follows from D3 in `divergences.md`; recorded here
because it is a per-format reading, not a ledger-wide rule.**

The statement writes a **purchase as a positive** number and a **payment or
refund as a negative** one:

```
LAVA GRILL RED DEER AB      31.45     <- money spent
PAYMENT, THANK YOU        -100.00     <- money paid to the card
```

The ledger is the opposite way round: D3 has outflows negative and inflows
positive, so that a period's net is the plain sum of its rows.

**Chosen: negate every amount on import.** `applySignConvention` with
`debit_positive`, which already exists for card CSV exports that do the same.

Both directions are kept: the flipped value goes to the ledger, and the
statement-sign value is what reconciliation compares against the printed
"payments & credits" and "new purchases & debits". Comparing a flipped value
against a printed total is how a sign error cancels itself out and passes.
