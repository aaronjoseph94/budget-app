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
