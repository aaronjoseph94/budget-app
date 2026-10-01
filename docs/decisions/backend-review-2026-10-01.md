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
