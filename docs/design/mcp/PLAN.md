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

