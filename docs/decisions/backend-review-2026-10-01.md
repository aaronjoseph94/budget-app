# Backend review, 2026-10-01: decisions taken under "Ask first"

CLAUDE.md asks first before changing dedupe hash inputs. The owner pre-approved
the review's changes on 2026-09-30: "make changes where needed", "don't ask me
any questions; auto-allow and say yes to everything". Each decision below is
recorded with what it changes, what it leaves alone, and why.

## Receipt photos carry their own identity (backend-c1-02)

**Before.** Each receipt photo was saved as a one-row import with no issuer
id, so its dedupe discriminator was always `occurrence:1`. Two separate
receipts from the same shop, on the same day, for the same total hashed the
same, and the second was dropped with "You already had this one", the
silent-drop failure `dedupe.ts` calls the worse one.

**Now.** The Photo tab hashes the picked file's bytes (SHA-256) and sends
`receipt:<digest>` as the row's issuer id. Two different photos are two
charges; the same photo sent twice is still one, and says "This photo was
already sent, so nothing was added." A second photo of the same paper
receipt lands twice and shows in Review, where it is rejected: the visible
failure `dedupe.ts` prefers.

**Unchanged.** `dedupeCanonicalString` and `DEDUPE_HASH_VERSION`: the
issuer-id discriminator already exists, so stored hashes stay valid and no
backfill is needed. The digest goes only into the hashed string; it is never
logged, stored on its own or shown.

## A typed entry carries an entry id (backend-a-07, backend-b-03)

**Before.** `add_typed_transaction` gave every call a random dedupe hash, so
two coffees typed on one day stay two coffees (0004). When a write committed
and its answer was lost, the app said "nothing was saved" and kept the form
filled; pressing Add again posted the same cash purchase twice, straight to
the ledger.

**Now.** The Add form keeps one entry id (a random UUID) per entry as filled
in: kept when Add is pressed again after a failure, renewed once the form
changes or the entry is added. 0023's overload hashes
`typed:<user>:<entry>`, and a unique index on typed candidates makes a
repeat return the candidate already there, its own batch reading parsed 1 =
deduped 1. Two entries typed alike still carry two ids. A connection that
drops now says the write "may or may not have been saved" instead of
"nothing was saved".

**Unchanged.** The 6-argument call and existing typed rows' random hashes
(no backfill). `dedupe_hash_v` stays 1 for typed rows, which never used
`dedupe.ts`'s canonical string. Before 0023 is pasted, the app falls back to
the 6-argument call. `save_import` is left as it is: a statement brought in
again already dedupes its rows, and its unreadable lines listing twice is
N13's accepted behaviour.
