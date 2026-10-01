# ADR 0012 — Outside AI apps connect over MCP; they read figures and add to Review, nothing more

**Date:** 2026-09-30 · **Decided by:** the engineer, on the owner's request
of 2026-09-30; the words quoted below are the owner's, as relayed in the
brief for this design · **Status:** accepted; both confirmations given
by the owner on 2026-09-30 (below)
**Amends:** ADR 0004 (the AI helper and `read-receipt` refuse AI apps'
tokens; "JWT verification stays on" holds only while the project signs with
the legacy secret), ADR 0007 (`/setup/` carries one file built at site
build). ADR 0005 is not amended (below).
**Plan:** `docs/design/mcp/PLAN.md` · **Reviewed:** 2026-09-30, adversarially
(the Review section at the end, and the plan's §6)

## Context

The owner asked how to let an AI app "connect via MCP and perform requests,
ask questions, etc", from Claude and from ChatGPT alike, so that Claude
"should be able to add expenses to your Review queue, and answer
questions".

MCP (Model Context Protocol) is how Claude, ChatGPT and other AI apps call
tools on another service. For this app it means a server on the internet,
reachable by Anthropic's and OpenAI's servers, that answers with the
owner's figures and can put entries in Review.

What constrains it:

- **CLAUDE.md's invariants.** Every figure comes from `packages/core`;
  money is integer cents; nothing a model produced reaches the ledger
  without the owner's approval; zod at four boundaries; row-level security
  with the caller's own token, never `service_role` for user data; logs
  carry codes and counts only; model text is data, never markup; no
  provider URL from a model or the database.
- **How the clients sign in.** ChatGPT's developer mode offers OAuth or no
  sign-in, and no API-key header; claude.ai accepts a fixed header only in
  a beta for "a limited set of organizations". Claude and ChatGPT fall back
  to Dynamic Client Registration (DCR) when a server offers no Client ID
  Metadata Document, and each documents its exact callback address.
- **Supabase's OAuth 2.1 server** (beta, every plan, no charge) issues the
  owner's ordinary JWTs with an added `client_id` claim, so RLS works
  unchanged. It supports DCR and requires PKCE; it does not support Client
  ID Metadata Documents, custom scopes, binding `resource` into `aud`, or
  the RFC 9207 `iss` parameter, and it matches redirect addresses exactly,
  port included. Its tokens carry "full access to user data (same as
  regular session tokens)", the Auth API included. It is off on the hosted
  project today (a live probe answered `404 feature_disabled`, again in
  review).
- **The `ai` helper does not load `packages/core`**: the browser computes
  every figure today. An MCP server must compute them itself.
- **The owner deploys functions by pasting one file** into Supabase's
  editor, and the free plan allows 2 s of CPU and 150 s per request.
- **The MCP spec has two eras in use**: the 2025 revisions, and 2026-07-28,
  which removed `initialize` and sessions and marked DCR deprecated.

## The owner's words and what they cover

As relayed in the brief of 2026-09-30:

> how do I add MCP to this app in order to request LLM/Agent to connect via
> MCP and perform requests, ask questions, etc

> I would like to basically connect any LLM.. not just claude.. So if I got
> a ChatGPT sub, then that should work as well. 1. Claude should be able to
> add expenses to your Review queue, and answer questions. 2. Yes, budget
> details can go to Anthropic

| Ask-first item (CLAUDE.md) | Covered by | What it allows |
|---|---|---|
| Sending unredacted financial content to a hosted provider: Anthropic | "Yes, budget details can go to Anthropic" | Figures, category, shop, goal and debt names, and dates, in tool results to Claude |
| The same: OpenAI | "if I got a ChatGPT sub, then that should work as well", then "push to GitHub when done; don't ask me any questions; auto-allow and say yes to everything" | The same, to ChatGPT. **Confirmed 2026-09-30:** the owner asked for ChatGPT to work, which cannot happen without OpenAI receiving the results, and then said yes to everything. The owner section of the plan, Help and the consent page still each say plainly that OpenAI receives the same |
| Adding an npm dependency: `@modelcontextprotocol/server` | The engineer's message of 2026-09-30 named "One new code package, the official MCP toolkit … saying yes to this plan covers it"; the owner answered "Ok. How long will implementation take?" and, later, "auto-allow and say yes to everything" | **Confirmed 2026-09-30.** The engineering case is below |
| Adding an LLM provider | Not needed | The server calls no model and holds no provider key: the owner's own AI app, on the owner's own subscription, is the model |

**The dependency as added (M2a, 2026-09-30):** `@modelcontextprotocol/server`
`2.2.0`, pinned exactly in `packages/ai-apps`, whose only dependencies are
`zod ^4.2.0` (resolved to the workspace's 4.6.5, so the lockfile gains no
second zod) and `@modelcontextprotocol/core` `2.2.0`, whose only dependency
is zod; `pnpm audit --audit-level high` clean.

Nothing else on the "Ask first" list is used: the dedupe hash's inputs do
not change, no migration is destructive, no golden value or workbook figure
moves.

## Options considered

**Where the server runs**

| Option | Cost |
|---|---|
| **A — a Supabase Edge Function, `mcp`** | Pasted like the others; "Enforce JWT verification" must be off for it |
| B — Cloudflare Pages Functions | The site is static by decision (ADR 0001); a second place for server code and secrets; a further hop to PostgREST |
| C — a separate host | A new service, a new bill, new secrets |

**How AI apps sign in**

| Option | Cost |
|---|---|
| **A — Supabase's OAuth 2.1 server with DCR, and a consent page in the app** | Beta; tokens carry full power, so the database must refuse their writes and gate their reads; open DCR needs an allowlist of exact callbacks and a window the owner opens |
| B — a personal key only | Locks out ChatGPT, and claude.ai outside a beta |
| C — a separate identity service | Its tokens are not Supabase JWTs, so the server would need `service_role` to act for the owner: forbidden |
| D — a personal key wrapping an OAuth grant (F1) | Covers clients that cannot finish Supabase's OAuth; a sealed secret, a lease and a second callback. Designed, built only when needed |

**The protocol**

| Option | Cost |
|---|---|
| **A — the official SDK 2.2.0, `createMcpHandler` stateless, JSON replies** | A dependency (with `zod` and `@modelcontextprotocol/core` its only two); about 220–350 KB fetched by the function at start |
| B — mcp-lite | Last released before the 2026 revision |
| C — hand-written JSON-RPC | We would own conformance for two eras of a spec that changed twice this year |

**How the pasteable file is made**

| Option | Cost |
|---|---|
| A — a generated file committed under `supabase/functions/mcp/` | Thousands of changed lines per source change; a freshness gate; loosening CONSTRAINTS.md's "imports zod alone" row |
| **B — built from `packages/ai-apps` when the site is built, served under `/setup/` beside the helper** | The file the owner copies is not in git; it is checked at build and by a test that imports it |

**How figures are made**

| Option | Cost |
|---|---|
| **A — the server bundles `packages/core` and renames the database's rows itself, held to the app's renaming by a parity test** | Two renamings, kept equal by a test |
| B — move the app's renaming into one shared module first | A large refactor of the app before any value; chosen if the parity test ever has to change twice |
| C — let the AI add up rows | A figure the engine never computed: against invariant 1 |

**What AI apps may write**

| Option | Cost |
|---|---|
| **A — one SECURITY DEFINER function that adds a pending candidate, and every other write refused in the database for tokens carrying `client_id`** | A migration of restrictive policies and a one-line guard in every write function; the add function must distrust its caller, since the token reaches it without the server |
| B — rely on the tool list | The token works directly against PostgREST and every RPC; not a boundary |
| C — also let them approve | Against invariant 3 and the owner's "add expenses to your Review queue" |

## Decision

**A in every table above**, with F1 designed and not built.

- **The server.** `packages/ai-apps` (a new module) holds the handler, the
  ten tools and the renaming; `bundleMcpFunction` builds one file whose only
  imports are `npm:zod@4.6.5` and `npm:@modelcontextprotocol/server@2.2.0`,
  emitted as `setup/mcp-function.ts` by `apps/web/setup-files.ts`. The owner
  pastes it as the function `mcp`, with JWT verification off: the server
  checks every caller itself, and Claude and ChatGPT start sign-in only on
  the server's own 401 carrying `resource_metadata`.
- **Sign-in.** Supabase's OAuth 2.1 server with DCR; the app's
  `/oauth/consent` page shows the client's name as text and the callback's
  host in bold, never the client's own `uri` or logo, and offers **Allow**
  only when all three hold: the callback is exactly one Anthropic or
  OpenAI documents (or a loopback address, with a warning); **Let AI apps
  connect** is on; and the owner pressed **Connect a new AI app** in the
  last 15 minutes. Allow never switches AI apps on, and Deny never follows
  a redirect to an unknown callback. Every request's token is checked by
  `GET /auth/v1/user`, then must carry this project's `iss`, `role`
  `authenticated` and a `client_id`; that last claim stands in for the
  audience Supabase does not bind.
- **Data.** Reads go through SECURITY INVOKER, VOLATILE functions under
  the owner's RLS, each behind a gate that checks the claim, the owner's
  switch and a daily count (300 reads, 30 adds, across all AI apps), and
  that alone sets the transaction-local flag without which 0020's
  restrictive policy shows a `client_id` token no row at all: such a token
  reads nothing directly, only through a counted call. The one write is
  `ai_app_add_candidate`, which treats its caller as hostile: it checks the
  dedupe hash against its own arguments, stores the words it will show as
  both `merchant_raw` and `merchant`, takes `ai_client_id` from the token,
  and only ever leaves a pending candidate, `category_source 'model'` when
  it names a category, never approved even on a learned-rule match, its
  batch's counts balanced. Migration 0019 refuses every other write to a
  `client_id` token, by restrictive policies and a guard in each SECURITY
  DEFINER function granted to `authenticated`, and refuses to run before
  0018. `service_role` is used nowhere.
- **Figures.** Every figure is a `packages/core` function's output, sent as
  `{cents, display}` with `display` from the one display helper, which
  moves into `money-primitives`. Amounts arrive as text. One engine
  function is added, `entriesTotals` (F52), so a search's total is the
  engine's. The Review list is never totalled.
- **A refused add is answered, not queued.** An add the database refuses
  writes nothing and returns its reason to the AI app, as the Add form
  refuses **Save**. This is how CLAUDE.md's "every ingestion failure is
  visible" is kept here: nothing was ingested, and the reason reaches the
  owner in the chat.
- **Logs** carry fixed codes and counts, never a token, argument, result,
  name or amount; the SDK's error hook logs a code only.
- **The `ai` and `read-receipt` helpers** refuse any token carrying
  `client_id`, so a connected AI app cannot spend the owner's AI keys or
  free quota. `read-receipt` gains the `whoIs` check `ai` already has: it
  relied on the gateway alone, which accepts the public anon key. Before
  the project moves to ES256, which ChatGPT's sign-in needs, both gateway
  JWT checks are switched off, as Supabase's signing-keys guide advises;
  their own `whoIs` checks remain. This amends ADR 0004's "JWT
  verification stays on".
- **ADR 0005 is not amended.** Its text rule governs the words the app's
  own AI writes for the app to show and keep. An AI app's chat is not the
  app's: the server sends engine figures out, ready to quote. The only
  model-produced values it keeps are an added entry's amount, date and
  words, which land in Review exactly as a model's reading of a receipt
  does today: the words held to `IngestedTextSchema` and drawn as
  `IngestedText` (`packages/schema/src/receipt.ts`), the amount a field
  the owner approves (ADR 0005 §7). CONSTRAINTS.md is unchanged.
- **ADR 0007's scope.** `/setup/` also carries `mcp-function.ts`, built from
  committed source at site build rather than copied byte for byte from a
  committed file.

## Consequences

**Gained**

- The owner can ask Claude or ChatGPT about their budget and get the
  app's own figures, and can add purchases by talking, with everything
  waiting in Review.
- Any client that speaks remote MCP with OAuth can connect once its exact
  callback is added to the allowlist.
- The database, not the tool list, is what stops an AI app changing
  anything, and the schema gate attempts every refusal.
- No key to paste, no new secret, no new bill.

**Lost**

- Budget details go to Anthropic and to OpenAI whenever those apps are
  used, and stay in the owner's chat history there.
- Signing in tells the AI app the owner's email address.
- Five more owner steps: two migrations, a signing-key check, the OAuth
  server switch and the `mcp` paste, plus re-pasting the AI helper (and
  `read-receipt`, or deleting it); and, each time an AI app is connected,
  pressing **Connect a new AI app** first.
- A token an AI app holds can use Supabase's Auth API as the owner, which
  nothing here can scope; the research says that includes setting a new
  password for a day after approval. The security review tests it on the
  hosted project before the owner relies on it.
- Rules the owner teaches by approving an AI-added row key on the words the
  AI wrote, so they seldom file a statement line by themselves.
- A beta sign-in server, a spec that deprecates the registration method it
  relies on, and a function whose JWT switch must stay off.
- A figure an AI app writes in its own chat is beyond the app's reach; the
  instructions ask it to quote, and the screen stays the source of truth.
- Two renamings of rows into the engine, held equal by a test.

**Revisit** when Supabase supports Client ID Metadata Documents or binds
`aud` (drop the `client_id` stand-in; consider the Custom Access Token
hook sooner if the security review asks); when Claude or ChatGPT stop
supporting DCR (build F1); when the owner wants a client that cannot sign
in (build F1); when the parity test has to change twice (move the renaming
into one shared module); when the SDK leaves 2.x; when the security review
has K5's answer on the Auth API.

## Not yet met

- Nothing here has run against the hosted project, which this environment
  can read only from outside. The plan's §2.14 lists what only the hosted
  project can show. Each fails visibly; K1 (the `client_id` claim reaching
  the database) fails closed for the server but not for a token used
  directly, so it is the first thing the first connection checks.
- The two confirmations in "The owner's words" above were given on 2026-09-30.

## Review, 2026-09-30

An adversarial review tried to break the first draft of this decision and
its plan, and checked each claim about Claude, ChatGPT and Supabase against
their current guides. The decision stands; these parts of it changed (the
plan's §6 has all 24 findings and its sources):

- **Consent:** exact callbacks instead of hosts (a code could have reached
  any page on an allowed host); Allow only inside a 15-minute window the
  owner opens, and never switching AI apps on (one click on someone else's
  link was enough); Deny never follows a redirect to an unknown callback
  (an open redirect); the client's `uri` and logo never drawn.
- **Reads:** a `client_id` token reads only inside a counted call (the
  first draft let it read every table directly, uncounted, while the
  switch was on).
- **The one write:** it checks the hash and stores the words it shows (a
  token used directly could have made a real statement line vanish on
  import, or taught an auto-approving rule the owner never saw).
- **`read-receipt`:** gains its own caller check (it accepted the public
  anon key through the gateway).
- **ADR 0005:** not amended after all.
- **Recorded, not closed:** the Auth API risk above, and K1's failure
  mode for a token used directly.

## Security review, 2026-10-01

The owner asked for a security review with fixes ("add a security review
also to the task list", 2026-09-30), then "don't ask me any questions;
auto-allow and say yes to everything" and "keep going and push to main
when done" (2026-10-01). Where CLAUDE.md says ask first, the decision
below was made under those words and is recorded with them.

- **Numbering (2026-10-01).** The fixes' database updates start at
  `0030`, not `0021`: another line of updates (`0021` onwards) was being
  prepared at the same time, and the numbers must never collide. They
  depend on `0020` only, touch none of that line's functions, and each
  checks the one before it through `ai_app_update_level()`, a name of
  their own, so the two lines may be pasted in either order. `0019` and
  `0020` are not edited: the deployed site already offers them on a
  **Copy** button, so the owner may have pasted them.
- **mcp-1-01 (with mcp-3-02): Disconnect now ends a token at PostgREST
  too** (`0030`). The gate refuses a token whose `session_id` names no
  live row of `auth.sessions`, with `disconnected`. Three hosted-only
  facts it rests on are HANDOFF §4 checks 18 and 21.
- **mcp-2-01: an AI app's row has a hash kind of its own** (`0031`,
  `dedupe.ts`'s `ai_app` kind). Changing the dedupe hash's inputs is
  ask-first; decided under the owner's words above, 2026-10-01.
  `dedupe_hash_v` stays 1 with this dated note: only the new kind's bytes
  are new, no stored hash changes, and no row with them exists yet, so
  nothing needs a backfill. An older server, or a newer one before `0031`
  is in, gets `needs_update` and adds nothing.
- **mcp-2-02: an AI app's row teaches no learned shop** (`0032`).
  `approve_candidate` and `recategorise_transaction` are re-created from
  their own definitions with a few lines changed, 0019's guard kept as
  the first statement; the Month's Move hides "Always file" for one.
- **mcp-3-01: the emergency steps end each sign-in, Disconnect first.**
  Help, PLAN §1, HANDOFF check 18 and Connected apps (when Supabase's
  OAuth Server is off) now say: Disconnect, the switch, `delete from
  auth.sessions;` in the SQL Editor, and only then the OAuth Server. The
  SQL line is used rather than a dashboard "Sign out user" action, which
  could not be confirmed from here.
- **mcp-2-03: the owner is told what the credential can do.** The
  consent page, Settings and Help said an AI app "cannot change
  anything" and could do nothing while switched off; its token reaches
  Supabase's Auth API as the owner whatever the switch says. They now
  say: in the budget it cannot approve, change or delete anything; like
  any sign-in it could be used on the account itself until Disconnect.
  K5 (what `PUT /auth/v1/user` allows) is HANDOFF §4 check 24, to be
  recorded here when run.
- **mcp-2-04: a search sees names as the AI app is shown them** (`0033`).
  Long digit runs are masked on both sides before matching, and words
  holding six or more digits in a row are refused (`bad_search`).
- **mcp-2-05: what an AI app adds has every character visible** (`0034`,
  `WordsSchema` and `NoteTextSchema`). Narrowed as a verifier advised: the
  shared `hasControlCharacter` and the `ingested_text` domain are
  unchanged, since a statement's shop name may need U+200C or U+200D.
