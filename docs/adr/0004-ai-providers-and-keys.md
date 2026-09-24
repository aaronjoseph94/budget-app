# ADR 0004 — AI services, their keys, and failing over

**Date:** 2026-09-24 · **Decided by:** the engineer under the owner's
2026-09-24 instruction to proceed without questions; the approvals quoted
below are the owner's · **Status:** accepted
**Amends:** ADR 0002's "How it is built": switching provider now means the
`ai` helper, not `read-receipt`, and `read-receipt`'s default model moves off
one Google has listed for shutdown
**Plan:** `docs/ai-first-plan.md` §3; the text rules are ADR 0005

## Context

Until now the app has had one AI call: `supabase/functions/read-receipt`
reads a receipt photo with Gemini's free tier (ADR 0002). It has not been
deployed, no gate type-checks or tests it, and its default model,
`gemini-2.5-flash`, is reported to be shut down around 16–20 October 2026.

On 2026-09-24 the owner asked for the app to be AI first: AI "in as many
places as possible", with paid models possible "but mostly … an easy way to
sync free LLM models like google Gemini (free)".

CLAUDE.md puts two things under **Ask first** that this needs: adding an
LLM provider, and sending unredacted financial content to a hosted
provider, whose free tier may keep and train on what it is sent. It also
says: a provider key is never reachable from the browser; endpoints are a
hardcoded allowlist that settings select from by key; logs carry ids, codes
and counts only; model output never reaches the ledger unreviewed.

The helper has to be pasted by the owner into the Supabase dashboard's
editor, which deploys one file, and must fit the free plan's limits: 2 s of
CPU and 150 s of wall clock per request.

## The owner's approvals

The instruction of 2026-09-24, in the owner's words (the workbook vendor's
name replaced by [brand]):

> 1. After the audit is complete... do the below without asking me
> questions. Make a list first and then execute:
>
> 2. How much of intelligent ai with Gemini is in here? AI must be the
> bedrock of this budget app... I told you I want AI in as many places as
> possible giving me insights into spending, telling me what to cut down on,
> encouraging me to save, providing insights into goals, giving me money
> quotes and tips from books and people and other sources. The whole product
> should be Ai first. Include the ability to add paid models but mostly have
> an easy way to sync free LLM models like google Gemini (free)
>
> 4. Also remove any mention of [brand] or [brand] from any and all github
> pushes including previous ones...

And from ADR 0002, when the owner chose Gemini's free tier for receipts:
"I don't care about privacy... use Gemini free tier."

| Ask-first item (CLAUDE.md) | Covered by | What it allows |
|---|---|---|
| Adding an LLM provider | Items 1 and 2 | Google Gemini (free, first); Groq and OpenRouter (free); OpenAI and Anthropic (paid) |
| Sending unredacted financial content to a hosted provider | Item 2, with ADR 0002's acceptance of the free-tier trade-off | What each task sends, in "What each service is sent" below |
| Removing the brand from history | Item 4 | Carried out outside this ADR's code; recorded here so the instruction's three approvals are in one place |

Nothing else is covered. A new npm dependency still asks first; none is
planned.

## Options considered

**Where the calls are made**

| Option | Cost |
|---|---|
| A — one function per task, like `read-receipt` | Six pastes for the owner, and key handling, limits and failover written six times |
| **B — one helper, `ai`, for every task, as one file with raw HTTPS adapters** | One paste; one allowlist in one constant; a long file |
| C — the providers' SDKs | New dependencies, several files, and no longer pasteable |
| D — from the browser with the owner's key | Forbidden: a key must never reach the browser |

**Where keys are kept**

| Option | Cost |
|---|---|
| A — Supabase secrets only | Every key typed in the Supabase dashboard; nothing to test or choose from the app |
| B — Supabase Vault | The local schema gate's plain Postgres has no Vault, so the migration could not be replayed as written; the key would travel as an SQL argument; anyone with the SQL editor can read decrypted secrets |
| **C — a table the browser cannot reach, encrypted in the helper under a key derived from a root it already holds** | A Supabase key change locks saved keys until they are pasted again |
| D — C with a required new `AI_KEYS_SECRET` | One more owner step, and no gain: it would sit beside the service key, readable by the same people |

## Decision

**B and C.** Every AI call goes through one Edge Function, `ai`
(`supabase/functions/ai/index.ts`), which holds the keys encrypted in
`ai_provider_keys`. `read-receipt` stays deployed as the receipt fallback
until the owner retires it (a NOTICED entry).

### The helper

- One self-contained file whose only import is `npm:zod@4.6.5`. It exports
  `handle(req, env, fetchFn)` for tests and calls `Deno.serve` only when
  `Deno` exists. It is type-checked, linted, boundary-checked and tested
  like every package (plan A02), which `read-receipt` never was.
- The caller is identified by `GET {SUPABASE_URL}/auth/v1/user` with their
  token, never by the body. JWT verification stays on. CORS is
  `read-receipt`'s origins plus `EXTRA_ORIGINS`.
- Bodies are a strict zod union: `ping`, `status`, `save_key`, `test_key`,
  `forget_key`, and `run` with a task. Tasks carry data only; each task's
  prompt, JSON schema and output limit live in the helper, so it cannot be
  used as a general proxy.
- The reply goes back as text, and the app parses it with zod
  (`packages/schema`). The helper only checks that it is a JSON object, to
  decide whether to fail over.

### The allowlist

One constant maps each service to a fixed host, a fixed path per operation,
a fixed way of sending the key, its models, whether it is free, and whether
it reads images. Settings name a service and a model; a stored model not on
the list falls back to the service's first. No URL is ever read from a
model, the database or a request.

| Service | Host | Key sent as | Models, default first | Tier |
|---|---|---|---|---|
| gemini | generativelanguage.googleapis.com | `x-goog-api-key` | gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.5-flash | free |
| groq | api.groq.com (`/openai/v1`) | Bearer | openai/gpt-oss-20b, openai/gpt-oss-120b | free |
| openrouter | openrouter.ai (`/api/v1`) | Bearer | openrouter/free | free |
| openai | api.openai.com | Bearer | gpt-5-nano, gpt-5-mini | paid |
| anthropic | api.anthropic.com | `x-api-key`, `anthropic-version: 2023-06-01` | claude-haiku-4-5, claude-sonnet-5 | paid |

These ids came from search results; direct fetches of the providers' pages
were blocked when this was written. Each is unverified until a key's test
lists it, and each adapter is re-checked against its provider's reference
when it is built. `gemini-2.5-flash` is left off, and `read-receipt`'s
default moves to the Flash-Lite model (plan A02).

**"Sync free models"** is **Check which models work**: the helper asks the
service which models the key can use (a list endpoint, no quota spent) and
shows the ones on the committed list. Nothing is added from a service's own
list, and no listed id reaches a request URL unless the constant has it.

### Keys

- Pasted in AI settings, sent once over TLS, cleared from the field, never
  kept in browser state or storage, never echoed, never logged.
- Tested before they are stored: `save_key` calls the service's list
  endpoint and stores the key only if it works or the service is busy.
- Encrypted with AES-256-GCM and a random 12-byte IV, under a key from
  HKDF-SHA-256 with salt `budget-app:ai-provider-keys:v1` and info
  `aes-gcm/v1`, over the first root present among `AI_KEYS_ROOT` (optional),
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEYS.default`. The
  additional data is `user_id:provider:v1`, so a ciphertext copied to
  another row or user fails. `kek_id`, 8 bytes of HKDF with info
  `kek-id/v1` in hex, says which root locked a key and reveals nothing about
  it. Decryption tries each root whose `kek_id` matches; with none, the
  key's status is `locked` and AI settings asks for it again.
- `ai_provider_keys` has row-level security and the owner policy, as every
  table must, and then every grant revoked from `anon` and `authenticated`.
  The browser cannot read or write a row, even its own. It sees keys only
  through `ai_key_status()` (service, last 4 characters, status, model,
  tested date) and removes one with `ai_key_forget()`.
- The helper reads and writes keys, usage and cooldowns only through
  SECURITY DEFINER functions granted to `service_role` alone, each taking
  an explicit `p_user`. It sends the root in the `apikey` header, and as a
  bearer token only when it is a legacy three-part JWT: Supabase refuses an
  `sb_secret_` key as a bearer.
- With no Gemini key pasted, the existing `GEMINI_API_KEY` secret is used,
  so an owner who set up receipts has AI with no step.

**Why a root the helper already holds.** It adds no step for the owner and
no new holder of trust: whoever has the service key can already read every
row, ciphertext included, so a second secret kept beside it protects
nothing more. What the encryption does protect against is the database
alone leaking: a dump, a backup, a screenshot of the SQL editor, a wrong
grant. The cost, a key change locking saved keys, is detected, explained
and survivable, and `AI_KEYS_ROOT` is there for an owner who wants keys to
survive one.

### Failing over, and staying inside free limits

- **Order:** the owner's, over services with a usable key. Paid services
  are tried only when **Use paid services** is on, and it is off by default,
  so a paid key is never drained by a fallback nobody chose. A receipt goes
  only to services that read images.
- **Attempts:** at most three, 20 s each (30 s for a receipt), inside a
  100 s deadline; an attempt starts only if its whole timeout fits.
- **Outcomes:** a 429 (and Anthropic's 529) rests the service for its
  `Retry-After` or 60 s, and a Gemini daily-quota error rests it until the
  next midnight Pacific; 401 and 403 mark the key rejected; a 404 marks the
  model unavailable; a 5xx, a timeout, a refusal, an output cut short or a
  reply that is not a JSON object moves straight to the next service. A
  resting service is skipped without spending a call.
- **Limits:** before every attempt, `ai_usage_claim` counts it in one SQL
  statement that refuses past any limit: 40 a day in all by default (the
  owner can set 10–150), a limit per task, and soft limits per service below
  the reported free ones (Gemini Flash-Lite 200, Flash 15, Groq 300 and
  150,000 estimated tokens, OpenRouter 40). Payloads are budgeted in
  estimated tokens, and a service whose per-request budget a payload would
  exceed is skipped.
- **The day** is the Pacific day, because the free services reset at
  midnight Pacific.
- **Counting is bookkeeping, not arithmetic on money.** CLAUDE.md keeps all
  arithmetic in `packages/core` so that no figure the owner sees is computed
  twice. A count of calls is never shown as money and is never an input to
  one, so keeping it in SQL, where it can be claimed atomically, does not
  break that rule.

### What each service is sent

| Task | Sent | Never sent |
|---|---|---|
| Daily, check-in and report words | kinds of fact, up or down, a little or a lot, history evidence, category names, shop names when allowed (digit runs masked, cut to 40 characters), blank names, quote ids | amounts, balances, dates, account or card numbers, name, email |
| Review suggestions | shop names (masked, cut), spent or received, a size band, category names | amounts, dates |
| Just type it | the typed text, today's date, category names | anything else |
| Ask | the question, today's date, category names, Help topic titles | figures |
| Receipt | the photo | anything else |

AI settings shows this in plain words, with a switch to stop sharing shop
names.

### Logs

The action, task, service, outcome code and counts. Never a key, a prompt,
a payload value or a reply; a test spies on `console` to prove it.

## Consequences

**Gained**

- Free Gemini on with one paste, or none if the receipt secret is set; four
  more services behind it; a busy or retired model is an inconvenience, not
  an outage, because every screen has the app's own words underneath.
- The code that holds keys is under every gate for the first time.
- One allowlist, one set of limits, one place to change a model.

**Lost**

- The helper is one long file (about 1,000 lines) to paste. Copy buttons in
  Help → One-time updates (ADR 0007) give the exact bytes, and `ping` says
  which version is deployed.
- A Supabase key change means pasting saved keys again.
- A new model is a code change and a re-paste, never a setting: the price
  of the allowlist.

**Revisit** when a model on the list is retired (the owner sees "This model
isn't available: pick another"), when a free tier's limits change enough
that the soft limits bite, or if the owner wants keys to survive key
changes without `AI_KEYS_ROOT`.

## Not yet met

- CONSTRAINTS.md's **Extraction accuracy** row stays pending: it needs 20
  or more labelled receipts, and there are none that can be committed.
- Nothing here has been run against a real provider or the hosted project;
  this environment cannot reach them. Every adapter is tested against its
  documented request and reply shapes with a fake `fetch`.
