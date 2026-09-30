# AI apps over MCP: the build plan

**Status: planned (2026-09-30).** Nothing below is built. Written on branch
`main-tnlcto` at `f9f6df9`. The decision is recorded as ADR 0012
(`docs/adr/0012-mcp-server.md`).

**What it answers.** The owner asked, on 2026-09-30 (as relayed in the brief
for this plan): "how do I add MCP to this app in order to request LLM/Agent
to connect via MCP and perform requests, ask questions, etc", and "I would
like to basically connect any LLM.. not just claude.. So if I got a ChatGPT
sub, then that should work as well. 1. Claude should be able to add expenses
to your Review queue, and answer questions. 2. Yes, budget details can go to
Anthropic".

**Where it comes from.** Two research reports of 2026-09-30, one on clients
and sign-in, one on the runtime and tools. This plan takes their findings and
corrects them where the repository says otherwise:

- The sign-in library's methods are `listGrants()` and
  `revokeGrant({ clientId })` (checked in the installed
  `@supabase/auth-js` 2.117.0), not `getUserGrants`.
- The dedupe hash includes the account id
  (`packages/statement-parsers/src/dedupe.ts`), so an add must learn the
  account before it hashes; the research had the account chosen inside SQL
  after the hash was made.
- The pasteable server file is **built when the site is built**, not
  committed as a generated file (§2.2). This keeps CONSTRAINTS.md's
  "Edge Functions import zod alone" row as it is, instead of loosening it.
- Results carry no `outputSchema`, so zod still runs at CLAUDE.md's four
  boundaries only (§2.4).
- Two research tools (`get_period_summary`, `get_budget_left`) become one,
  a tool reusing the app's own Ask engine is added, and search results get
  a total from the engine (new F52) instead of leaving the AI to add rows up.
- The daily limits count across all AI apps together, not per app, because
  Claude registers a new app on every fresh connection.

**Reviewed the same day** by an adversarial pass that checked every claim
about Claude, ChatGPT and Supabase against their current documentation and
tried to break the design. §6 lists what it found and what changed.

**Order of work** (the owner's, 2026-09-30): MCP (the slices in §3), then
help (M12a and M12b, and any Help follow-ups), then the README, then the
four reviews, then a security review (§5 lists what it must check), and
cleanup last.

---

## 1. For the owner

### What it does

You can connect your own Claude or ChatGPT to your budget. Then, in a chat,
you can ask things like:

- "How is September going?" or "How much is left for groceries this week?"
- "What will my bank balance be at the end of the month?"
- "When will I be debt free?" or "When will I reach my flight goal?"
- "How much did I spend at Costco this year?"

And you can say "I spent $12.50 on lunch at Subway today". It goes into your
**Review** list in the app, the same as a receipt photo. It does not count
until you approve it there.

Every figure the AI is given is the app's own, from the same calculations
your screens use. The AI does not work anything out for the app.

"MCP" (Model Context Protocol) is the standard these AI apps use to connect
to other services. All you need is one web address, which the app gives you.

### Which AI apps can connect, and how

| AI app | Plan you need | Where it works | Notes |
|---|---|---|---|
| **Claude** (claude.ai, the desktop app, the iPhone app) | Any, including Free (Free allows one custom connector) | Add it once on the website or desktop app; then it works on your phone too | Recommended |
| **ChatGPT** | Plus, Pro, Business, Enterprise or Edu (not Free) | The website only, not the phone app | Uses ChatGPT's "Developer mode", which ChatGPT labels as higher risk. It asks you to confirm every time it adds something |
| Claude Code, OpenAI Codex, Cursor, VS Code | Any | On your own computer | They sign in through a page on your computer. Expected not to work yet: Supabase is reported to refuse a sign-in whose page on your computer changes number each time (Supabase discussion 41695). Not tested |
| Gemini CLI | — | Not yet | A bug on Google's side stops it signing in (their issue 29477). A "personal key" for apps like it is designed but not built (§2.3) |
| Anything else | — | Maybe | It must support "remote MCP servers with OAuth sign-in", and the app must know its exact callback address (§2.10). Ask for it to be added |

**Connecting Claude** (once, on a computer; menus as Anthropic's help pages
described them on 2026-09-30):

1. In the budget app: **Settings → AI apps**, turn on **Let AI apps
   connect**, and press **Connect a new AI app**. It copies the address,
   and for the next 15 minutes the app will accept a new connection. Do
   steps 2 to 4 within those 15 minutes.
2. On claude.ai: **Customize → Connectors → Add custom connector**.
3. Name it **Budget** if it asks for a name, and paste the address. If it
   asks how to sign in, choose **Sign in now**; if it asks about the OAuth
   client, choose **Register automatically**, not **Use Claude's published
   identity** (Claude marks that one as recommended, but Supabase cannot
   use it yet). Press **Add**, then **Connect**.
4. The budget app opens a page called **Connect an AI app**. Check it says
   **claude.ai** in bold. Sign in if it asks. Press **Allow**. If it says
   the connection was not started from the app, go back to step 1.
5. In a chat, press **+ → Connectors** and switch **Budget** on. Ask "How is
   my month going?"

You're done when Claude answers with your own figures. The desktop and
iPhone apps pick the connector up by themselves.

**Connecting ChatGPT** (once, on a computer; menus as OpenAI's help pages
described them on 2026-09-30):

1. The same first step in the budget app: **Connect a new AI app**, then
   steps 2 to 4 within 15 minutes.
2. On chatgpt.com: **Settings → Security and login**, turn on **Developer
   mode**. ChatGPT shows a warning; that is expected.
3. Go to **chatgpt.com/plugins**, press **+**, name it **Budget**, paste the
   address, and choose **OAuth**. If it asks how ChatGPT should register,
   choose dynamic registration (DCR). Press **Create**.
4. On the budget app's **Connect an AI app** page, check it says
   **chatgpt.com** in bold, and press **Allow**.
5. In a chat, press **+ → Developer mode** and pick **Budget**. When ChatGPT
   asks to confirm adding something, say yes only if it is right.

If a button has moved, Help's article for that app is the one to trust; it
is updated when the apps change (§2.11).

### What the AI can and cannot do

**It can:** read your figures (a month, week, pay period or year; what is
left in each category; the forecast; your savings goals; your debts),
search your approved charges, see what is waiting in Review, see your
category names, and add a purchase or money received to Review.

**It cannot:** approve, reject, change or delete anything; change budgets,
categories, goals, settings or keys; see receipt photos; use the app's own
AI keys; or do anything at all while AI apps are switched off.

**Limits:** 300 look-ups (one question may take a few) and 30 additions
a day, across all AI apps together. They reset at midnight your time.

**A wrong figure in a chat.** The app hands the AI its figures ready to
quote. What the AI then writes in its own chat is the AI's. If a chat says
something different from your screen, your screen is right.

**Other connectors in the same chat.** Shop names come from your
statements, and anyone can name a shop to look like an instruction. The
app sends every name as data, and all Budget can do is add to Review, but
an AI that also has a connector that can send email or messages could be
tricked into sending your figures on. Use Budget in chats where the only
other connectors switched on are ones that cannot send anything.

### What data goes where

- **When the AI asks the app something, the answer goes to the company that
  runs that AI**: Anthropic for Claude, OpenAI for ChatGPT. That includes
  figures, category names, shop names and dates. It is kept in your chat
  history there. You agreed to this for Anthropic on 2026-09-30, and asked
  for ChatGPT to work too, which means OpenAI receives the same. Whether
  your chats are used to improve their models is a setting in each AI app;
  look for it in that app's privacy or data settings.
- **Signing in tells the AI app your email address.**
- **Never sent:** your password, the AI keys you saved in the app, receipt
  photos.
- **What the app keeps:** which AI apps are connected, when each last asked
  something, how many questions and additions there were today, and when
  you last pressed **Connect a new AI app**. Nothing the AI writes is kept,
  except the items it adds to Review.
- **Your budget stays in Supabase**, where it is now.

### How to switch it off

- **Everything, at once:** **Settings → AI apps**, turn off **Let AI apps
  connect**. It takes effect straight away.
- **One app:** **Settings → AI apps → Disconnect** beside it. It has to
  sign in again to come back.
- **In Claude or ChatGPT:** remove the connector there as well.
- **In an emergency:** first turn off **Let AI apps connect** in the app,
  which stops every AI app at once. Then Supabase → **Authentication →
  OAuth Server** → turn it off, so no AI app can sign in again or renew its
  sign-in.

### What you do once (about 20 minutes, on a computer)

First, HANDOFF §3's steps: the Cloudflare site live with its Site URL set in
Supabase, and the updates `0015` to `0018` and the AI helper pasted. The
site must be running this version: **Help → One-time updates** lists
`0019`. Then, with One-time updates open in the app (it checks each step
and has **Copy** buttons):

1. **Paste two database updates, one at a time:** `0019` then `0020`, in
   Supabase's **SQL Editor**, as before. Each one stops, and says which
   update to paste first, if the one before it is missing.
2. **Paste the AI helper again.** Its new version refuses AI apps, so a
   connected AI cannot spend your AI keys. If **Edge Functions** also lists
   `read-receipt`, either paste its new version the same way (One-time
   updates has its **Copy**) or delete it: the AI helper reads receipts
   without it, and its old version lets anyone who has the app's public
   key use your Gemini key.
3. **Check the signing key.** One-time updates reads your own sign-in and
   says whether this step is needed. If it is: first open the `ai`
   function's settings in Supabase (and `read-receipt`'s, if you kept it),
   turn **Enforce JWT verification** off, and save. Supabase's own guide
   warns that changing the key with that switch on can break a function,
   and both now check every caller themselves. Then Supabase → **Project
   Settings → JWT Keys** (the JWT signing keys page) → **Rotate keys**, so
   the current key is the **ECC (P-256)** one. Do not revoke the old key.
   Sign out of the app and back in, and press **Check again**. ChatGPT
   cannot sign in without this key.
4. **Turn on sign-in for AI apps.** First check **Authentication → URL
   Configuration → Site URL** says `https://aaron-budget-app.pages.dev`:
   the page that asks you to Allow is found from it. Then **Authentication
   → OAuth Server** → **Enable**. Set **Authorization Path** to
   `/oauth/consent`. Turn on dynamic client registration (the switch that
   lets apps register themselves). **Save**.
5. **Keep sign-ups closed and email changes safe:** **Authentication →
   Sign In / Providers**: **Allow new users to sign up** stays off. Under
   **Email**, keep **Secure email change** on, and turn on any setting that
   asks for the current password before a password change.
6. **Deploy the AI apps server:** Supabase → **Edge Functions → Deploy a new
   function → Via Editor**. Name it exactly `mcp`. **Copy** "The AI apps
   server" from One-time updates and paste it over everything in the
   editor. Turn **Enforce JWT verification off** for this one, and press
   **Deploy**. Off is right here: the server checks every caller itself,
   and Claude and ChatGPT can only find the sign-in page if the server
   answers them first. After any later re-paste, check the switch is still
   off.
7. Press **Check again** on One-time updates. It should say **All done**.
8. **Connect Claude or ChatGPT** as above, starting with **Connect a new AI
   app**.

**A first test:** ask the AI "list my categories", then "add a test coffee
for $1.00 today". The coffee should appear in **Review**; reject it there.

---

## 2. The technical design

### 2.1 The shape

```
Claude / ChatGPT / other MCP client
   │  1. POST /functions/v1/mcp, no token → 401 + where to sign in
   │  2. OAuth 2.1 with Supabase Auth (DCR, PKCE); the consent page is the app's /oauth/consent
   │  3. POST /functions/v1/mcp with the owner's own access token (carries client_id)
   ▼
Edge Function `mcp` (built from packages/ai-apps; the official MCP SDK; packages/core bundled in)
   │  checks the token with GET /auth/v1/user, then its claims
   │  POST /rest/v1/rpc/ai_app_* with the caller's token (RLS applies as the owner)
   ▼
Postgres: RLS owner policies + restrictive "AI apps cannot write" policies (0019)
          + the access switch, daily limits, "AI apps read only through a
            counted function", and the one add function (0020)
```

The server computes every figure with `packages/core`, from rows the
database returns under the owner's own row-level security. It holds no
provider key, calls no model, and never uses `service_role`.

### 2.2 Transport and runtime

**Where it runs:** a Supabase Edge Function named `mcp`, at
`https://bnodrfghxbavlopxkgju.supabase.co/functions/v1/mcp`. Supabase is
where the app's server code already lives, it reaches PostgREST on the same
project, and the owner already deploys functions by pasting. Cloudflare
Pages stays static (ADR 0001).

**Protocol library:** the official TypeScript SDK,
`@modelcontextprotocol/server` **2.2.0**, pinned exactly. Its
`createMcpHandler(factory, { legacy: 'stateless', responseMode: 'json' })`
serves both protocol eras in use: the 2025-06-18 and 2025-11-25 revisions
(`initialize`, sessions optional) and 2026-07-28 (`server/discover`, the
`Mcp-Method` headers, `resultType`, cache hints). Its only dependencies are
`zod ^4.2.0` and `@modelcontextprotocol/core` 2.2.0, whose only dependency
is zod (checked in both packages' `package.json` on the npm registry,
2026-09-30; 2.2.0 was published 2026-09-28). Supabase's MCP guide now
shows `@supabase/server`'s `withOAuthProtectedResource()` for this job.
Rejected: mcp-lite (last release before the 2026 revision),
hand-written JSON-RPC (we would own conformance for two protocol eras of a
spec that moved twice this year), and `@supabase/server` (needs `jose` and
supabase-js, for what `whoIs` plus about twenty lines already does).

- **Stateless.** No sessions, no sampling, nothing kept between requests.
  A 2026-07-28 request is answered as one JSON body (`responseMode:
  'json'`). A 2025-era request goes through the SDK's stateless fallback,
  which `responseMode` does not govern and which may answer as a
  one-message server-sent event stream; the spec requires clients to
  accept either, and nothing streams for longer than the request. `GET`
  and `DELETE` on `/mcp` answer 405. Request bodies are capped at 64 KB
  (`maxRequestBodySize`).
- **Nothing is cacheable.** The 2026-07-28 revision puts cache hints only
  on list and resource results: `tools/list` goes out with the SDK's
  default `{ ttlMs: 0, cacheScope: 'private' }`, and a tool's result
  carries no hint, so no client is told it may keep a figure. Every
  response also carries `Cache-Control: no-store`, so no proxy keeps one
  either (CLAUDE.md: never cache a derived money value).
- **Outbound calls** go only to `SUPABASE_URL`'s `/auth/v1/user` and
  `/rest/v1/rpc/ai_app_*`, with `redirect: 'error'`, so the owner's token
  can never follow a redirect anywhere else.
- **Paths served** (from the function's view, `/mcp…`):
  - `POST /mcp`: the MCP endpoint; needs a token.
  - `GET /mcp/.well-known/oauth-protected-resource`: the RFC 9728 metadata;
    no token.
  - `GET /mcp/health`: `{ ok, version, tools }`, where `tools` is the count
    the server registers, so a deploy that cannot load the SDK or convert a
    schema shows at once. No token; CORS for the app's origins only, so
    One-time updates can check it.
- **Where the code lives:** a new package, **`packages/ai-apps`** (module
  `ai-apps`, CAPABILITY-MAP.md). Ordinary TypeScript that imports
  `@budget/core`, `@budget/money-primitives`, `@budget/statement-parsers`,
  `@budget/schema`, `zod` and the SDK by their package names, tested by
  vitest on Node like every package. `src/handle.ts` exports
  `handle(req, env, fetchFn)`; `src/deno.ts` calls `Deno.serve` only when
  `Deno` exists, as the `ai` helper does.
- **The pasteable file is built, not committed.** `packages/ai-apps/build.ts`
  exports `bundleMcpFunction(): Promise<string>`, which runs vite's
  `build()` API (vite is already the app's build tool; §3, M3) over
  `src/deno.ts` with `write: false`, no minifying, the `zod` and SDK imports
  rewritten to `npm:zod@4.6.5` and `npm:@modelcontextprotocol/server@2.2.0`
  and left external, and a first-line banner naming the file and its
  version. `apps/web/setup-files.ts` (ADR 0007) emits the result as
  `setup/mcp-function.ts` when the site is built, and the dev server
  answers it the same way. So the file the owner copies is always built
  from the same commit as the site that offers it.
  - **Why not a committed file:** a generated file would change by
    thousands of lines on every source change (CLAUDE.md's 300-line rule),
    could go stale unless a freshness gate caught it, and would sit under
    `supabase/functions/`, where CONSTRAINTS.md says a function imports zod
    alone. Built at site build, none of that applies, and nothing
    generated is tracked.
  - **What is checked:** `scripts/check-bundle.mjs` holds `setup/` to its
    list, now including `mcp-function.ts`, and checks that file's only
    imports are the two pinned `npm:` URLs and that it holds no
    `SERVICE_ROLE`, `SECRET_KEYS` or AI service host. A test in
    `packages/ai-apps/test` builds it, imports it (vitest aliases the two
    `npm:` names to the installed packages), and runs `initialize`,
    `server/discover` and `tools/list` through its `handle`.
- **Size and time.** The research put the SDK at 224–348 KB; the 2.2.0
  tarballs say more. Deno resolves the SDK's `_shims` export to its Node
  build, which brings a vendored JSON Schema validator (ajv 8.18.0, 274 KB),
  so the SDK a cold start fetches and compiles is about 800 KB of
  unminified JavaScript (336 KB of protocol code, 104 KB of server, 80 KB
  of `core`, the validator), plus our own file, expected near 150 KB with
  the core and parser pieces. Compiling that is a cold-start cost, not a
  per-request one; each request's own work is well inside the free plan's
  2 s of CPU and 150 s of wall clock. Measured after the first deploy (K4,
  §2.14).
- **Environment** (parsed with zod: the env boundary): `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` (both provided by Supabase), and the optional
  `EXTRA_ORIGINS` the other functions read. The schema has no field for a
  service key, and a test fails if the source names one.
- **Origin.** Claude and ChatGPT call from their servers and send no
  `Origin`. A request that sends one is refused with 403 unless it is one of
  the app's origins (the spec's DNS-rebinding rule). CORS headers are sent
  on `/mcp/health` only.

### 2.3 Sign-in (auth)

#### Primary: Supabase Auth's OAuth 2.1 server, with dynamic registration

**Why:** ChatGPT's developer mode offers OAuth, no sign-in, or a mix of
the two, and no API-key header (OpenAI's developer-mode guide); claude.ai
accepts a fixed header only in a beta for "a limited set of organizations"
(Anthropic's connector authentication guide). Supabase's own OAuth 2.1 server is on
every plan, including Free, at no extra charge; its access tokens are the
owner's ordinary Supabase JWTs with an added `client_id` claim, so
row-level security sees the owner and works unchanged. Every popular client
registers itself by Dynamic Client Registration (DCR), which Supabase
supports. Rejected: a separate identity service (a new service and cost,
and its tokens would not be Supabase JWTs, so the server would need
`service_role` to act for the owner, which CLAUDE.md forbids), and a
personal token alone (it locks out ChatGPT and claude.ai).

**What Supabase does not do, and what covers it:**

| Gap | Cover |
|---|---|
| No Client ID Metadata Documents (CIMD); `client_id` must be a UUID | DCR, which Claude and ChatGPT fall back to when CIMD is not advertised; the owner must pick **Register automatically** in Claude's dialog (§1) |
| No RFC 9207 `iss` in the redirect back | Claude does not require it. ChatGPT then uses a per-connection callback, `https://chatgpt.com/connector/oauth/{callback_id}`, instead of its stable one (OpenAI's auth guide), and the consent allowlist accepts that form (§2.10). Gemini CLI 0.61+ requires it, hence the fallback below |
| Redirect addresses match exactly, port included (Supabase discussion 41695, June 2026) | Claude's and ChatGPT's callbacks are fixed https addresses. Desktop tools whose loopback port changes per sign-in are expected to fail until Supabase applies RFC 8252's port rule (§1's table) |
| No custom scopes; `resource` is said to be validated but not copied into `aud` (research; K8) | The server requires `client_id` instead of an audience (below). Optional hardening: a Custom Access Token hook setting `aud` to the server's address (§5) |
| Tokens carry the owner's full power at the Data API, the Auth API and every RPC ("full access to user data (same as regular session tokens)", Supabase's OAuth flows guide) | The database refuses every write from a token carrying `client_id` except the one add function (0019), and lets it read only inside a counted `ai_app_*` call (0020); the `ai` and `read-receipt` helpers refuse such tokens (M1b). The Auth API cannot be scoped (K5, §4) |
| Open DCR: anyone can register a client named "Claude" with any https redirect | The consent page allows only Claude's and ChatGPT's exact callback addresses, and only within 15 minutes of the owner pressing **Connect a new AI app** (§2.10) |

**Discovery.** The metadata at `…/functions/v1/mcp/.well-known/oauth-protected-resource`:

```json
{
  "resource": "https://bnodrfghxbavlopxkgju.supabase.co/functions/v1/mcp",
  "authorization_servers": ["https://bnodrfghxbavlopxkgju.supabase.co/auth/v1"],
  "scopes_supported": ["email"],
  "bearer_methods_supported": ["header"]
}
```

Both addresses are built from `SUPABASE_URL`, never from the request.
`resource` must equal the address the owner pastes, exactly, and there is
one authorization server only (Claude uses the first). No custom scope is
ever advertised: Supabase refuses a sign-in that asks for one.

**The challenge.** A request with no token, or one the checks below
refuse, gets `401` with
`WWW-Authenticate: Bearer resource_metadata="<the metadata URL>", scope="email"`,
plus `, error="invalid_token"` when a token was sent. Never 403 for a bad
token: Claude treats a 403 without `insufficient_scope` as final. Serving
`/.well-known` at the project's root is impossible on Supabase, so this
header is how every client finds the sign-in.

**The token check, on every request:**

1. `GET {SUPABASE_URL}/auth/v1/user` with the caller's token and the anon
   `apikey`, the `ai` helper's `whoIs` (`supabase/functions/ai/index.ts`,
   lines 284–307). Supabase checks the signature, the expiry, that the user
   exists and that the session still exists, so a revoked grant fails at
   once. A 401 or 403 from Auth becomes our 401 challenge; anything else,
   503.
2. Then, and only then, decode the same token's payload (base64url, no
   verification of our own) and require: `iss` equals
   `${SUPABASE_URL}/auth/v1`; `role` is `authenticated`; **`client_id` is a
   UUID**. A token without `client_id` is the owner's own browser session,
   not an AI app: `403` with a plain message. Anon, publishable and secret
   keys fail step 1 or 2.
3. Requiring `client_id` stands in for audience checking: in this project,
   every OAuth client exists only to reach this server. Registering an
   OAuth app in this project for any other purpose would weaken this (§4).

**Data access** uses the same token: `POST {SUPABASE_URL}/rest/v1/rpc/<fn>`
with `apikey: <anon key>` and `Authorization: Bearer <caller's token>`, so
PostgREST applies row-level security as the owner. The token goes nowhere
but this project's Auth and PostgREST.

**Signing keys.** ChatGPT asks for the OpenID scopes Supabase advertises,
and Supabase issues an ID token only with an asymmetric signing key. The
project's published key set holds one ES256 key (live probe, 2026-09-30,
repeated in review), but whether it is the current key cannot be seen from
outside. One-time updates reads the `alg` in the header of the owner's own
session token, locally, and shows the "signing key" step until it says
ES256 (§1, step 3). Supabase's signing-keys guide warns that rotating
while a function has Verify JWT on "might break your app", so step 3 turns
it off first for `ai` and `read-receipt`, which after M1b both identify
every caller through `/auth/v1/user` themselves.

#### Fallback F1, designed and not built: a personal key that wraps a grant

**For:** clients that cannot finish Supabase's OAuth (Gemini CLI 0.61+
until its issue 29477 is fixed), and scripts that can only send a header.
**Not for:** ChatGPT (no API keys) or claude.ai (outside the header beta).

- The owner registers one **public** OAuth client in Supabase ("Budget app
  keys", redirect `https://aaron-budget-app.pages.dev/oauth/key-callback`),
  and the consent allowlist gains that one exact address.
- **Making a key, in the app:** the app runs PKCE against that client; the
  owner approves on the same consent page; the app makes `bmcp_` plus 32
  random bytes (base64url), seals the refresh token with AES-256-GCM under
  an HKDF key derived from the personal key, additional data
  `user_id:key_id` (ADR 0004's sealing, keyed by the token instead of a
  server root), and stores `sha256(key)`, the ciphertext, a label, an
  expiry and a `lease_until` through an owner-only function. The table has
  RLS, the owner policy, and every grant revoked from `anon` and
  `authenticated`, like `ai_provider_keys`. The key is shown once.
- **Using a key, in the server:** an anon-granted SECURITY DEFINER function
  takes the **raw** key and hashes it in SQL (keyed by the hash, a leaked
  hash would be a working key), and claims it with one conditional
  `UPDATE … SET lease_until = now() + '20 s' WHERE key_hash = … AND
  revoked_at IS NULL AND expires_at > now() AND (lease_until IS NULL OR
  lease_until < now()) RETURNING …`. The server decrypts, refreshes at
  `/auth/v1/oauth/token` as a public client when the cached access token
  has under 60 s left, stores the rotated refresh token back, and from then
  on is identical to the primary path: a real owner JWT with `client_id`.
- **Revoking:** the app deletes the row and calls `revokeGrant`.
- **Why not built now:** Claude and ChatGPT, the owner's two asks, do not
  need it; it adds a table, a sealed secret, a lease and a second callback
  page. **Build it** as its own slice when the owner wants a client that
  cannot sign in, or if Claude or ChatGPT stop supporting DCR.

**Fallback F2, only if Supabase's OAuth server becomes unavailable:**
anon-granted SECURITY DEFINER functions taking the raw key, limited to
adding a pending candidate and reading a bounded snapshot, filtered by the
user id on the key's row. This is **not** "row-level security with the
caller's own JWT", so it would be a recorded divergence the owner accepts
first. Not planned.

**Not possible at all:** minting a user JWT in the function (it needs the
legacy JWT secret or a trusted private key, either of which can mint a
`service_role` token); holding `service_role` and passing a user id; a
custom Postgres role through the token hook (only `anon` and
`authenticated` are allowed); storing a raw refresh token as the personal
key.

