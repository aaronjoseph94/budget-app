# AI first: the build plan for the owner's list of 2026-09-24

**Status: planned (2026-09-24).** Nothing below is built yet. Written on branch `main-tnlcto` at `50b601d`, where the first load is 182.34 KB gzipped against the 200 KB gate (`scripts/check-bundle.mjs`), every screen but the Month and More is its own chunk, and the Content-Security-Policy lets the page talk to the Supabase project and nothing else.

This plan was made from three independent designs, each led by one concern (safety and grounding, the owner's experience, and staying useful on free tiers), and from two judges' verdicts, one engineering and one from the owner's side. It takes its architecture and safety from the grounded design; its screens, tone, navigation, Help and Setup from the owner-experience design; and its free-tier budgeting and statistical honesty from the third. §15 records every place the designs disagreed and what was chosen. §16 lists every item the judges said must be fixed and where this plan answers it.

**Every choice in this plan is "Decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions"** unless it says the owner chose it. Where the owner's own words settle something, they are quoted. Nothing here claims the owner chose what they did not.

**The short version, for the owner:**
- **A Coach tab, next to Month.** It shows how far the flight fund has come in hours of flying, what changed since last month, what to trim and how many weeks sooner that gets you flying, and a money quote or tip that fits. On Sundays there is a short check-in.
- **The AI writes the words. Your own numbers write every figure.** When it writes, the AI is never sent your amounts or balances. It writes around blanks that the app fills from your real figures. If the AI is off, busy or out of free uses, you see the same card in the app's own words. Nothing breaks.
- **Free Google Gemini first.** In AI settings: **Get a free key**, paste it, **Save & test**. If you already added a Gemini key for receipt photos, it is used with no step at all. Other free services (Groq, OpenRouter) and paid ones (OpenAI, Anthropic) can be added. Paid ones are used only if you switch them on.
- **Forecast.** "Safe to spend $31 a day", where the month is heading, the tightest day in the next 30, when you will be flying, and the next three months.
- **Reports.** The month in review, trends, shops and subscriptions, and your spending habits, with Save as PDF and a CSV download.
- **Last month, everywhere.** Month, Week, Paycheck, Year, Savings and Debts show what you did at the same point last month.
- **Help that doesn't leave you lost.** A **?** beside every screen's title, a Getting started guide one step at a time, and a One-time updates page that checks what is installed and has Copy buttons.
- **After the push you do three things, about 15 minutes, once:** paste three database updates, paste the AI helper, paste a free Gemini key (§10).
- **One thing moves.** Week leaves the phone's bottom bar for a **Month · Week · Pay · Year** switch at the top of the Month. It is still one tap away.

---

## 1. What the owner asked

The owner's instructions of 2026-09-24, verbatim (numbering theirs; the workbook vendor's name is replaced by [brand]):

> 1. After the audit is complete... do the below without asking me questions. Make a list first and then execute:
> 2. How much of intelligent ai with Gemini is in here? AI must be the bedrock of this budget app... I told you I want AI in as many places as possible giving me insights into spending, telling me what to cut down on, encouraging me to save, providing insights into goals, giving me money quotes and tips from books and people and other sources. The whole product should be Ai first. Include the ability to add paid models but mostly have an easy way to sync free LLM models like google Gemini (free)
> 3. Build forecasting into this as well...
> 4. Also remove any mention of [brand] or [brand] from any and all github pushes including previous ones...
> 5. Also, create help section and expand the setup section so I understand what to do..without feeling overwhelmed or lost.
> 6. Also use your creativity and create reporting and trends..
> 7. Intelligently add comparisons to the previous month where possible so I can see what I did last month..
> 8. Review the whole application as a whole and critically evaluate it .. I want it to be a well rounded app.
> 9. Ensure its mobile friendly.
> 10. Test everything and push to github main

**Item 2's question, answered.** Today the app uses AI in one place: reading a receipt photo, through the `read-receipt` function, which has not been deployed yet. After this plan it uses AI in sixteen places (§3.11), all through one helper, and every one of them still works with AI switched off.

**Where each item is answered:**

| Item | Where in this plan | Slices (§13) |
|---|---|---|
| 1. Proceed without questions; make a list first | This document is the list; every choice is labelled | A01 |
| 2. AI first; free Gemini; paid optional | §3, §4, ADR 0004, ADR 0005 | A02, A07–A12, A17, A20–A25 |
| 3. Forecasting | §5 | A13, A14 |
| 4. The brand out of every push | Rewriting history is done outside these slices. The `brand` gate already keeps it out of every tracked file (CONSTRAINTS.md, N64) | — |
| 5. Help and setup | §8 | A06, A25, A28 |
| 6. Reporting and trends | §7 | A15–A19 |
| 7. Comparisons with last month | §6 | A03, A04 |
| 8. A critical review of the whole app | §2.10, §14, A27 | A27 |
| 9. Mobile friendly | §9 | every screen slice, then A26 |
| 10. Test everything; push to main | §13's rules; A28 | A28 |

**What the instruction approves that CLAUDE.md would otherwise ask first.** ADR 0004 records each one with the owner's words:
- **Adding LLM providers:** free Google Gemini first, the other free tiers (Groq, OpenRouter), and paid OpenAI and Anthropic.
- **Sending financial content to them.** The owner accepted the privacy trade-off for Gemini's free tier in ADR 0002 ("I don't care about privacy... use Gemini free tier."), and the 2026-09-24 instruction asks for the other providers.
- **Removing the brand from history** (item 4).

Nothing else on CLAUDE.md's "Ask first" list is covered. **No new npm dependency is planned.** WebCrypto, `fetch`, zod (already present) and hand-written SVG charts cover everything. If a builder finds one unavoidable, it gets its own commit with the reason in the body, and a line in the ADR it serves.

---

## 2. What the owner will see, screen by screen

### 2.1 Getting around

**Phone bar, five tabs: Month · Coach · Add · Review · More.**
- **Month still opens first,** as the owner chose on 2026-09-22 (`docs/workbook-views-plan.md` §9a, decision 1). That is not reopened.
- **Coach** takes Week's place on the bar. From Sunday it shows a dot when the weekly check-in is ready.
- **Review** keeps its count. It is the one human step every imported row waits for.
- **Week leaves the bar but stays one tap from the Month.** A switch, **Month · Week · Pay · Year**, sits under the title of those four screens. The old address `#/week` still works. This is the change the owner will notice most, and HANDOFF says so.
- The **Bill calendar** is a calendar button in the Month's header and an item in More.

**Wide screens** (icons from 768 px, words from 1280 px): Month · Week · Coach · Forecast · Reports · Savings · Debts · Review · Add · More. Year and Paycheck are in the switch; the Bill calendar and Setup are in More.

**More, in four groups:**
- **Plan:** Paycheck, Bill calendar, Year, Savings, Debts, Forecast.
- **Understand:** Reports, Ask.
- **Set up and help:** Getting started ("4 of 9 done"), Setup (your lists and bills), AI settings, Settings, Help.
- **Records:** All transactions.

**A ? beside every screen's title** (a 44 px target) opens that screen's Help article in a bottom sheet, with **Show me** (the whole article) and **Ask about this** (Ask, with the screen as its subject).

**New addresses** (ADR 0006, extending ADR 0003's parser): `#/coach`, `#/coach/checkin`, `#/forecast`, `#/reports/2026-09`, `#/ask`, `#/help`, `#/help/<topic>`, `#/start`, `#/ai`, and `#/week/2026-09-21` (a week's Monday, N46). A help topic must be one of the committed topic ids. Anything the parser cannot read still opens the Month.

### 2.2 Month

On a phone, 390 px wide. The figures are illustrative; every one comes from the engine.

```
 ‹  September 2026  ›                              📅   ?
 [ Month | Week | Pay | Year ]
 ✨ You've spent $160.00 less than by this day last month.
    Dining out is the one to watch.                             →
 ┌ Start $2,000.00    Spent $1,020.00    Left to spend $980.00 ┐
 │ End of month $3,240.00                                      │
 │ By 24 Sep: $1,020.00 spent · by 24 Aug: $1,180.00           │
 │   ▼ $160.00 less                                            │
 │ Forecast: about $3,100 by 30 Sep  ⓘ                         │
 └─────────────────────────────────────────────────────────────┘
 Variable expenses          Budgeted    Actual   [Left | vs Aug 1–24]
```

- **The coach line** sits above the summary. It is the day's summary in the AI's words, or in the app's own words with no ✨ when AI is not ready. Tapping it opens the Coach. It loads after the Month has drawn, inside its own error boundary, so it can never slow or break the Month. The summary is made only from what the Month already reads (this month and last), so the Month can tell whether the day's AI words still fit.
- **The comparison strip names both figures and both windows.** It never puts a change under Spent alone: a same-days window counts a planned bill only on its due day (F8), while Spent counts every planned bill for the whole month (§6).
- **The forecast line** shows for the current month once a starting balance is typed. It is labelled "Forecast", and ⓘ explains it in one line: "End of month counts what has happened and your planned bills; the forecast adds pay still due and spending at your usual pace." It links to Help → "Two month-end figures". The Month never shows two unlabelled month-end figures.
- **The third-column switch, Left | vs Aug 1–24,** swaps each row's Left for its change against the same days last month. Left is the default, and the choice is remembered on this device. The phone never grows a fourth column.
- **Tapping a row** opens its charges as today, plus "Last month (same days): $X". Each Variable charge also shows its cost in flying time ("= 21 min of flying"), the tradeoff framing in `docs/ideas/savings-coach.md`.

### 2.3 Coach

```
 Coach                                                         ?
 AI: free Gemini · written this morning
 ✨ A calmer week: you spent $61.40 less than last week.
 ┌ ✈ Flight training ─────────────────────────────────────────┐
 │ (ring)  46 h of 109 h · $12,650.00 of $30,000.00            │
 │ At your pace: about Oct 2027          [Rough: 2 months]     │
 │ ✨ Trim Dining out by $60.00 a month: fly 7 weeks sooner     │
 │ [ What if… → ]                                              │
 └─────────────────────────────────────────────────────────────┘
 ┌ Your Sunday check-in is ready ●                           → ┐
 ✨ Dining out is running ahead: $212.40 more than by this       ✕
    day in August. Two home-cooked dinners this week pull it back.
 ✨ Spotify went up: $11.99 → $12.99.                            ✕
 ✨ Three weeks in a row under your Variable budget.             ✕
 [ Forecast: about $3,100 by 30 Sep → ]  [ Reports: August → ]
 "…a small leak will sink a great ship."
   Benjamin Franklin, The Way to Wealth (1758)
   ✨ Your three subscriptions are the little expenses he meant.
 [ Ask anything about your money…                            ✨ ]
```

- **At most three insight cards,** ranked by how much money each is about. A stale-data card ("Your last statement ends 18 days ago: import the new one for fresh advice") always comes first when it applies, because a stale ledger makes a coach confidently wrong (`docs/ideas/insights.md`).
- **Each card has one action** (See charges, Set a budget, Open goal, Add it as a bill), **✕** to dismiss, and **Why am I seeing this?**, which lists the engine figures behind it. A dismissed card does not come back for the same cause, on any device.
- **Evidence chips are drawn by the app, never written by the AI:** "Based on 2 months", "New: not enough history yet".
- **Tone.** AI settings offers **Cheerleader** (the default: a win first, one thing to try, never shaming) and **Straight talker**. No tone ever sends a bare "you overspent": every card that says to watch something carries one thing to try.
- **Labels.** AI words carry ✨ and, in the card's sheet, "Written by AI from your numbers". The app's own words carry nothing extra, and the status line says "The app's own words: turn on free AI (2 minutes)".

### 2.4 The Sunday check-in (`#/coach/checkin`)

From Sunday the Coach tab shows a dot. The check-in is one screen: last week's recap and a win; one thing to try; a line on the flight goal; up to three questions about last week's biggest discretionary charges ("Was Sushi Place, $84.20, planned?" with **Planned**, **Impulse** and **Needed**); and a one-tap commitment ("Keep Dining out under $60.00 next week?"), which writes that category's weekly budget through the Week's existing save. Answers are kept (0016) and become the "how much of it was impulse" fact the coach can cite. It works with AI off, with the same sections in the app's own words.

### 2.5 Forecast (`#/forecast`)

It leads with one sentence and safe to spend, then the detail:
1. **The sentence**, from the day's AI pack or the app's own words: "At this pace September ends near $3,100; your tightest day is the 28th, just before payday."
2. **Safe to spend: $31.40 a day for 7 days.**
3. **End of this month:** a range bar ($3,050–$3,180), with what is still to come: pay still due, bills still due, and spending at your usual pace.
4. **The next 30 days:** a balance line with the tightest day marked, and the bills due in the next 7 days.
5. **Your flight date:** a date range and **What if** chips (Dining out −25%, Groceries −10%, your best month). A tap recomputes the date and the month end on the phone, with no network call.
6. **The next three months:** bars with a band, and a table.
7. **Debt-free date**, from the existing payoff plan.

With no starting balance typed, the balance parts say "Type this month's starting balance to see where you'll end", and pace, the flight date and the three months still show. Before the 7th of a month, or with under three months of records, figures are labelled **rough** and shown as one "about" figure rather than a range.

### 2.6 Reports (`#/reports/2026-08`)

Four tabs in a scrolling row, opening on **Overview**. The last tab chosen is remembered on this device.
- **Overview:** the month in review (AI or the app's own words), Income, Spent and Saved against last month and against your usual month, the savings rate, the biggest changes up and down, and this month against last as paired bars. **Save as PDF** (the browser's print, with a print stylesheet) and **Download CSV**.
- **Trends:** 6 or 12 months of Income, Spent and Saved; each category's line against its usual level, labelled "rising steadily", "falling steadily", "no clear trend" or "not enough months yet: check back in November".
- **Shops:** the top 10 shops against last month, new shops, subscriptions (how often, next date, a year's cost, price changes, "Not a subscription"), unusual charges and possible double charges.
- **Habits:** the spending grid (a day-by-day heat map of discretionary spending, the "contribution grid" the ROADMAP promised), which weekday costs most, no-spend days, streaks and personal bests.

### 2.7 Ask (`#/ask`)

A question box on the Coach, an **Ask about this** in every help sheet, and an item in More. "How much did I spend on coffee in August?" gets an answer card: the engine's figure, one ✨ sentence, "I read that as: Coffee · August 2026", and a link to the matching report. A how-to question opens the matching Help article. A question the figures cannot answer gets "I can't answer that from your figures yet", with suggested questions. The last five questions are kept on this device only.

### 2.8 Review and Add

- **Review:** a row the app has not learned yet shows "✨ Suggested: Groceries", already picked. **Approve** is still the owner's tap and teaches the shop as today. **Approve these 12** lists the twelve, asks once, and approves each in turn. With AI off, a row can show "You filed a similar shop under Groceries", which is picked but never saved on its own.
- **Add → Just type it** comes first: "coffee 4.50 yesterday" or "got paid 2100" fills the form (amount, date, shop, category, spent or received), and nothing counts until **Save**. An amount the AI read is labelled "read by AI: check it".
- **Add → Photo:** as today, but when Gemini is busy another service that reads images answers. It still goes to Review.

### 2.9 AI settings, Help and Getting started

- **AI settings (`#/ai`)** opens with a sentence ("AI is on, using free Google Gemini", or "AI is off. Everything still works; the Coach uses the app's own words.") and the free Gemini card in three steps (§8.3). Below it, collapsed: more services, the order they are tried in, **Use paid services** (off), the daily limit with today's use, coach tone, **Share shop names with the AI**, and **What the AI sees**, in plain words.
- **Help (`#/help`)** has short articles in plain words, a search box, **One-time updates** with live checks and Copy buttons, and "Why does a number look wrong?" (§8.2).
- **Getting started (`#/start`)** is one step per screen with the real control on it, "about 2 minutes", **Continue** and **Do this later** (§8.1).

### 2.10 The other screens, and what the whole-app review fixes

- **Week, Paycheck and Year** show last week, the last pay period and the previous twelve months beside their totals. **Savings** shows saved this month against last. **Debts** shows the schedule's balance against a month ago.
- **Rows that open nothing today will open their charges** on the Week, Paycheck and the Bill calendar (N46, N48, N51), and so will a charge filed under Not spending (N26).
- **A list of learned shops, with Forget,** in Settings (N17).
- **Every "needs a database update (00NN…)" message** says instead "Needs a one-time update" and links to Help → One-time updates.
- **What the owner will notice has moved:** Week off the phone bar, into the switch; on wide screens, Year and Paycheck into the switch, and the Bill calendar and Setup into More; a new Coach tab. HANDOFF lists these.

---

## 3. How the AI works

### 3.1 The rule

**The engine decides what is true; the AI decides how to say it.** `packages/core` computes every figure and decides which facts are worth saying: its detectors fire or they do not, as `docs/ideas/insights.md` requires. `packages/savings-coach` ranks them into cards and builds the AI's brief. The AI writes words with blanks. The app fills each blank with a live engine figure at the moment it draws. The full rules are ADR 0005.

### 3.2 The AI helper: one Edge Function, `ai` (ADR 0004)

- **One self-contained file,** `supabase/functions/ai/index.ts`, so the owner can paste it into the Supabase dashboard as with `read-receipt`. Its only import is `npm:zod@4.6.5`, the version `read-receipt` pins. It exports `handle(req, env, fetchFn)` for tests and calls `Deno.serve` only when `Deno` exists.
- **Who is calling** comes from `GET {SUPABASE_URL}/auth/v1/user` with the caller's token, never from the body. "Enforce JWT verification" stays on as a second lock. CORS uses `read-receipt`'s origins plus `EXTRA_ORIGINS`. POST only.
- **Environment** is parsed with zod (the "env loading" boundary): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, the key roots (§3.4), and the optional `GEMINI_API_KEY`, `GEMINI_MODEL`, `EXTRA_ORIGINS` and `AI_KEYS_ROOT`.
- **The request body** is a zod union on `action`, `.strict()`, so no URL or host field can be sent (the "Edge Function request bodies" boundary):

| Action | What it does | Returns |
|---|---|---|
| `ping` | Proves the helper is deployed | `{ok, version}` |
| `status` | What is set up, never a key | per service: source (`saved`, `secret`, `none`), last 4 characters, status, chosen model, listed models; today's use and the limit |
| `save_key` | Checks the key's shape (20–200 characters of `[A-Za-z0-9_\-.:]`), tests it on the service's list-models endpoint (no quota spent), and encrypts and stores it only if it works or is busy | status, last 4, the listed models the key can use |
| `test_key` | Re-tests a saved key or the Gemini secret. This is also **Check which models work** | status, the listed models the key can use |
| `forget_key` | Deletes a saved key | `{ok}` |
| `run` | One task: `narrate` (pack `daily`, `checkin` or `report`), `categorise`, `quick_add`, `ask`, `receipt` or `test` | the model's reply as text, with the service and model used; or a code |

- **Tasks carry data, never prompts.** Each task's system prompt, JSON schema and output limit live in the function, and the app sends only the task's data, each field bounded by zod: a label of at most 40 characters, a typed entry or question of at most 300, at most 24 facts, 6 quote ids, 40 rows and 200 categories, and an image of at most 6 MB of base64. The helper cannot be used as a general-purpose proxy.
- **The reply comes back as text.** The app parses it with zod in `packages/schema` (the "model responses" boundary), as `receipt.ts` does now. The helper only checks that the text is a JSON object, to decide whether to try the next service.
- **Logs** carry the action, task, service, outcome code and counts only. A test spies on `console` and fails if a key, a prompt, a payload value or a reply appears.
- **Codes the app turns into sentences:** `not_signed_in`, `origin_not_allowed`, `bad_request`, `ai_off`, `not_set_up`, `needs_update` (0015 missing), `limit_reached`, `all_resting` (every service rate-limited or cooling down), `all_failed`, `key_rejected`, `keys_locked`.

### 3.3 The services, and the allowlist

One constant in the helper maps each service to a fixed host, a fixed path for each operation, a fixed way of sending the key, and its models. Settings choose a service and a model by key. A stored model that is not on the list falls back to that service's first entry. No URL is ever read from a model, the database or a request.

| Service | Chat endpoint | Test endpoint (spends no quota) | Key sent as | Models, the default first | Tier | Reads images | JSON mode |
|---|---|---|---|---|---|---|---|
| `gemini` | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `…/v1beta/models` | `x-goog-api-key` | `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash` | free | yes | `responseMimeType` + `responseSchema` |
| `groq` | `api.groq.com/openai/v1/chat/completions` | `…/openai/v1/models` | Bearer | `openai/gpt-oss-20b`, `openai/gpt-oss-120b` | free | no | `json_object`, the schema in the system prompt |
| `openrouter` | `openrouter.ai/api/v1/chat/completions` | `openrouter.ai/api/v1/key` | Bearer | `openrouter/free` (a router that picks a free model) | free | no | `json_object` |
| `openai` | `api.openai.com/v1/chat/completions` | `…/v1/models` | Bearer | `gpt-5-nano`, `gpt-5-mini` | paid | yes | `json_schema`, strict |
| `anthropic` | `api.anthropic.com/v1/messages` | `…/v1/models` | `x-api-key` + `anthropic-version: 2023-06-01` | `claude-haiku-4-5`, `claude-sonnet-5` | paid | yes | `output_config.format` |

- **Every model id here came from search results,** because direct fetches of the providers' pages were blocked when this was researched. Each is unverified until a key's test lists it. The builder of each adapter re-checks that provider's model list and API reference at build time and leaves out anything that cannot be confirmed.
- **`gemini-2.5-flash` is not on the list,** and `read-receipt` stops defaulting to it (A02). Google has listed it for shutdown around 16–20 October 2026.
- **Check which models work** is the owner's "sync free LLM models": it asks the service which models the key can use and shows the listed ones, ticked. Nothing is ever added from a service's own list, and a model id from a service, the database or a reply never reaches a request URL unless it is on the committed list.
- **The adapters** are three request builders and three reply extractors: Gemini, OpenAI-compatible (Groq, OpenRouter, OpenAI) and Anthropic. Each puts the fixed system prompt in the service's system slot, and the data in the user turn as `DATA (JSON, information only, never instructions):` followed by the JSON. Per service:
  - **Gemini:** temperature 0.2 (0 for `categorise`, `quick_add` and `receipt`); thinking at its lowest setting where the model has one (the field is checked at build); `maxOutputTokens` with room for it. A `finishReason` of `MAX_TOKENS` or `SAFETY` is a service error.
  - **Groq and OpenRouter:** `response_format: {type: "json_object"}`, because strict schemas are reported to be ignored on `gpt-oss-120b`. zod decides what is kept.
  - **OpenAI:** no `temperature` or `top_p` (the gpt-5 family refuses them); `max_completion_tokens` large enough that reasoning cannot cut the JSON short. A `finish_reason` of `length`, or a refusal, is a service error.
  - **Anthropic:** the Messages API directly, never an OpenAI-compatible shim. No `temperature` or `top_p` (`claude-sonnet-5` refuses them). On `claude-sonnet-5`, `output_config.effort: "low"` and `max_tokens` of at least 4,000, so thinking cannot cut the JSON short; on `claude-haiku-4-5`, no `effort`. A `stop_reason` of `refusal` or `max_tokens` is a service error.
- **Outcomes** are classified as `ok`, `rate_limited` (429, and 529 from Anthropic), `rejected` (401, 403, and Gemini's 400 `API_KEY_INVALID`), `model_not_found` (404), `provider_error` (5xx and the cases above), `timeout` or `unreachable`.

### 3.4 Keys (ADR 0004)

- **Pasted once** in AI settings and sent over TLS to the helper. The field is cleared as soon as it is sent. The key is never kept in browser state or storage, never echoed back, and never logged.
- **Stored encrypted** in `ai_provider_keys`, a table the browser has no grant on at all: AES-256-GCM with a random 12-byte IV, under a key derived by HKDF-SHA-256 from the first root present among `AI_KEYS_ROOT` (optional), `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEYS.default`. The additional data is `user_id:provider:v1`, so a ciphertext moved to another row or user cannot be opened. A `kek_id` fingerprint records which root locked it.
- **A Supabase key change** leaves a saved key unreadable. Its status becomes `locked`, and AI settings says "Your saved key can't be opened after a Supabase key change: paste it again". The Gemini secret and the other services keep AI working meanwhile.
- **The existing `GEMINI_API_KEY` secret** is used whenever no Gemini key has been pasted, so an owner who set up receipt photos has AI on with no step.
- **The helper reaches the database** only through SECURITY DEFINER functions granted to `service_role` alone (§10.1), using the first root: it always goes in the `apikey` header, and also in `Authorization: Bearer` only when it is a legacy three-part JWT. A new `sb_secret_…` key sent as a bearer token is refused by Supabase.

### 3.5 Staying inside free limits

- **One batched call a day for the daily coach.** The `daily` pack returns, in one reply: the day's summary line, words for up to three cards, the flight card's line, the forecast sentence, the Savings note and a quote pick. At most one is asked for automatically each day: by the Coach when it opens, or by the Month's coach line when the Month opens first, which then loads the Coach's data in the background after the Month has drawn. **Refresh** appears only when the facts have changed since the last pack.
- **A daily limit on every call,** counted in SQL, atomically, before each attempt:

| Task | Limit a day | Typical |
|---|---|---|
| `narrate` daily | 4 | 1 |
| `narrate` checkin | 2 | 1 a week |
| `narrate` report | 2 | about 1 a month |
| `categorise` | 6 | 1–3 per statement |
| `quick_add` | 20 | 0–3 |
| `ask` | 15 | 0–5 |
| `receipt` | 15 | 0–2 |
| `test` | 10 | 0 |
| **All together** | **40 by default; the owner can set 10–150** | 2–10 |

- **Per-service soft limits below the reported free ones:** Gemini Flash-Lite 200 a day (about 500 reported), Gemini Flash 15 (about 20), Groq 300 requests and 150,000 estimated tokens a day (1,000 and 200,000 reported), OpenRouter's free router 40 (50). Paid services count toward the total only.
- **Tokens, not bytes.** Input is estimated as the UTF-8 byte count ÷ 3, rounded up. A daily pack stays at or under about 3,000 input tokens; `categorise` batches are sized to about 2,500 tokens and at most 40 rows. A service is skipped when a request would exceed its per-request budget (Groq's is 6,000 tokens in and out together, under its reported 8,000 a minute).
- **Cooldowns,** kept in `ai_provider_state`: a 429 rests that service for its `Retry-After` or 60 s; a Gemini daily-quota error rests it until the next midnight Pacific; a 401 or 403 marks the key rejected until it is re-tested; a 404 marks the model unavailable until **Check which models work**. A rested service is skipped without spending a call.
- **The day** for every counter is the Pacific day, because the free services reset at midnight Pacific. AI settings says "resets overnight". Counting calls is bookkeeping, not money, so it does not break CLAUDE.md's rule that SQL never computes numbers (ADR 0004 says why).
- **Paid services are used only when Use paid services is on,** and it is off by default. A saved paid key with the switch off says "Saved. Not used until you turn on paid services."
- **Time:** at most three attempts per request, 20 s each (30 s for a receipt), inside a 100 s deadline for the whole request; an attempt starts only if its full timeout fits. The free plan's wall clock is 150 s. The app shows its own words while it waits.

### 3.6 What the AI sees

AI settings shows this table in plain words.

| Task | Sent | Never sent |
|---|---|---|
| The daily, check-in and report packs | what kind of fact each is; up or down; a little or a lot; how much history there is; category names; shop names when **Share shop names** is on (runs of 4 or more digits masked, cut to 40 characters); the names of the blanks; up to 6 quote ids | amounts, balances, dates, account or card numbers, your name, your email |
| Review suggestions | shop names (masked and cut), spent or received, a size band (under $20, under $100, larger), your category names | amounts, dates |
| Just type it | what you typed, today's date, your category names | anything else |
| Ask | your question, today's date, your category names, the Help topic titles | your figures: the app computes every answer |
| Receipt | the photo | anything else |

Free services may use what they are sent to improve their products, and people may read it. The owner accepted this for Gemini's free tier (ADR 0002). With **Share shop names** off, packs say "a shop" and Review suggestions are off.

### 3.7 Grounding and checking (ADR 0005 has the full rules)

- **The AI names a figure only as a blank:** `{{B.change}}`, a letter for the fact and a slot name. It never writes a digit, a currency sign, a percent sign, a number word, a link or markup. A sentence that does is dropped.
- **A change is drawn with its direction word from the engine** ("$40.00 less"), so the AI cannot pair "up" with a fall. A sentence whose own rise or fall words contradict its fact is dropped too.
- **Every fact, card, quote and Help topic the AI names must be one the app offered.**
- **A failing sentence is dropped on its own,** and its card shows the app's own words. Nothing is repaired or guessed.
- **Everything the AI wrote is drawn as plain text,** never as markup or a link.

### 3.8 Caching words, never numbers (ADR 0005)

- `ai_notes` stores only checked words with blanks. A database check refuses any digit and any currency or percent sign, so no figure can be stored.
- Words are keyed by a signature of what the AI was told: the kinds, subjects, directions, sizes and evidence of the facts, the tone, and the prompt and library versions, with no amounts. The words make only those claims, so they are reused exactly while the claims still hold, and the figures in them are always filled fresh.
- Cards are reused one at a time. A new pack is asked for only when more than half of the top cards are no longer covered.

### 3.9 Nothing reaches the ledger without a tap

- **Review suggestions** are written as `category_source = 'model'` on pending rows only, by a guarded function (0017). 0004's CHECK still refuses approving a row as `model`. **Approve** records `user` and learns the shop as today. **Approve these 12** calls `approve_candidate` once per row, each a conditional write, after one confirmation.
- **Just type it and receipts** only fill the Add form, and the owner presses **Save**. A quick-add amount must appear, word for word after normalising, in what the owner typed. The receipt path stays form, then Review.
- **The check-in's commitment** writes a weekly budget only when tapped.

### 3.10 Failing soft

Nothing in the app's first load reads a new table. `AppDataProvider.refresh()` loads with one `Promise.all`, so a missing table there would fail the whole app; every AI and coach read is its own, and fails on its own. Every optional panel on the Month sits inside an error boundary, so an engine error hides that panel with one line and never takes the Month down.

| Missing | What still works | What says "Needs a one-time update → Help" |
|---|---|---|
| 0015 | Everything, including the Coach in the app's own words, Forecast, Reports and comparisons | AI settings; AI words (the app's own are shown) |
| 0016 | AI works, uncached; the Coach works | ✕ on cards is hidden; the check-in's answers |
| 0017 | Review works as today | the suggestions |
| The `ai` helper (a 404) | Everything, in the app's own words; receipts fall back to `read-receipt` | AI settings; AI words |
| No key and no secret | Everything, in the app's own words | "Turn on free AI (2 minutes)" |
| The limit reached, or every service resting | Everything, in the app's own words | "AI is resting until tomorrow: showing the app's own words" |

### 3.11 Every AI feature

Each has its grounding and what the owner sees without AI. "Pack" is the one daily call of §3.5.

| # | Feature | Where | What the owner sees | Grounding | Without AI | Calls |
|---|---|---|---|---|---|---|
| 1 | Coach line | Month (one line), Coach top | "You've spent $160.00 less than by this day last month. Dining out is the one to watch." | summary facts: this month and this week against the same days before (F25, F26) | a template in the chosen tone | the pack |
| 2 | Insight cards, and why each matters | Coach (at most 3) | a card per notable fact, with one action and ✕ | detector facts ranked by money impact (F44); the AI words only the cards it was offered | a template per kind of fact | the pack |
| 3 | What to cut | Coach flight card, Forecast what-ifs, Savings | "Trim Dining out by $60.00 a month: fly 7 weeks sooner, 13 min of flying a month" | levers (F34) and goal pace (F33); the AI may only pick a lever it was offered | the lever that brings the date closest, in a template | the pack |
| 4 | Flight coach | Coach hero, Savings | "46 h of 109 h", the date range, a cheer at every 5 hours | goal facts (F33) from the fund's balance and transfers | template, with the ring and figures | the pack |
| 5 | Encouragement and wins | Coach, check-in | "Three weeks in a row under your Variable budget" | win facts: streaks, personal bests, saved more than last month, milestones (F40, F33) | template | the pack |
| 6 | A quote or tip that fits | Coach, check-in, Reports | a library quote with its source, and "why it fits" | the committed library (§4); the AI picks an offered id | the day's tag-matched pick | the pack |
| 7 | Sunday check-in | `#/coach/checkin` | recap, a win, one thing to try, questions, a one-tap limit | weekly recap facts, questions, suggested limit (F42) | the same sections, in templates | 1 a week |
| 8 | Forecast sentence | Forecast top, Coach | "At this pace September ends near $3,100; your tightest day is the 28th." | forecast facts (F30–F32) | template | the pack |
| 9 | Savings note | Savings | one line on the flight fund's month | goal facts | template | the pack |
| 10 | Month in review | Reports → Overview | a headline, three points, one thing to try next month | report facts (F36), against last month and your usual month | template naming the biggest change each way | about 1 a month |
| 11 | Subscription and unusual-charge alerts | Coach, Reports → Shops | "Spotify went up: $11.99 → $12.99", "Possible double charge at …" | detectors (F38, F39) | template | the pack |
| 12 | Ask | `#/ask`, Coach, every help sheet | an answer card with the engine's figure | the AI picks a fixed intent; `answerQuery` in core computes the answer | question chips answered by core | per question |
| 13 | Help answers | Ask, help sheets | "How do I…" opens the matching article | the AI picks a committed topic id | search over the articles | within Ask |
| 14 | Review suggestions | Review | "✨ Suggested: Groceries", picked, Approve still a tap | the AI picks an offered category alias; stored as `model` (0017) | "You filed a similar shop under…" (not stored) | 1–3 per statement |
| 15 | Just type it | Add | the form fills from "coffee 4.50 yesterday" | a parser first; the AI only for what it could not fill; the amount must be in the owner's words | the parser alone | 0–5 a day |
| 16 | Receipts with failover | Add → Photo | the form fills from the photo | the `receipt` task on services that read images; the existing receipt zod | `read-receipt`, then typing it | per photo |

Also: **Check which models work** in AI settings, which spends no quota.

---

## 4. The quotes and tips library

- **Committed data,** in `packages/savings-coach/src/library.ts`. The AI never writes a quote's text or an author.
- **An entry:** `id` (lowercase words and hyphens, no digits), `kind` (`quote` or `tip`), `text` (exactly as published in the cited edition, at most 400 characters), `by`, `attribution` (`wrote`, `said` or `often_attributed`), `source` (`title`, `year`, `locator` such as a chapter, letter or page), `sourceUrls` (at least one https address), `note` (required for `often_attributed`: how the attribution is known or disputed), and `tags` from a closed set: small_leaks, saving, pay_yourself_first, hours, goal, flight, courage, impulse, enough, over_budget, debt, habits, streaks, subscriptions, levers, milestone.
- **Verified when committed.** The builder checks every entry against a source at commit time and puts the address used in `sourceUrls`. An entry that cannot be confirmed is dropped, or kept as `often_attributed` with its note when the line is famous and the misattribution is itself documented.
- **How attribution shows:** `wrote` or `said` shows the book or speech, year and locator. `often_attributed` shows "Often attributed to X; not found in their own writing", then the note.
- **How one is chosen.** The app offers a shortlist of at most 6 ids: tags matching the top facts, none shown on this device in the last 14 days. The AI may pick one and add one sentence (at most 160 characters, under ADR 0005's rules) on why it fits. Any other id is refused. Without AI, the app shows the first match by the day's rotation (core `dailyIndex(asOf, n)`).
- **Never advice on products or investing,** in quotes, tips or anything the AI writes (`docs/ideas/savings-coach.md`, "Not doing"). Tips come from named books and from public-interest sources such as the Financial Consumer Agency of Canada.
- **Left out on purpose:** "Compound interest is the eighth wonder of the world", because no evidence has been found that Einstein said it.
- **The starting list, each to be re-verified at build:** Franklin, "Beware of little expences; a small leak will sink a great ship" (*The Way to Wealth*, 1758); Franklin, "A penny saved is two pence clear" (*Poor Richard's Almanack*, 1737; the note says "a penny saved is a penny earned" is a later proverb); Thoreau, "the cost of a thing is the amount of what I will call life…" (*Walden*, 1854, "Economy"); Dickens, Mr. Micawber's "Annual income twenty pounds…" (*David Copperfield*, 1850, ch. 12); Seneca, "It is not the man who has too little, but the man who craves more, that is poor" (*Moral Letters to Lucilius*, Letter 2, Gummere); Samuel Johnson, "Resolve not to be poor: whatever you have, spend less" (letter to Boswell, 7 Dec 1782); Clason, "A part of all you earn is yours to keep" (*The Richest Man in Babylon*, 1926); Robin and Dominguez, "Money is something we choose to trade our life energy for" (*Your Money or Your Life*, 1992); Housel, "Spending money to show people how much money you have is the fastest way to have less money" (*The Psychology of Money*, 2020; chapter confirmed at build); Sethi, "Spend extravagantly on the things you love, and cut costs mercilessly on the things you don't" (*I Will Teach You to Be Rich*, 2009); James Clear, "You do not rise to the level of your goals. You fall to the level of your systems" (*Atomic Habits*, 2018, ch. 1); Stanley and Danko, "Big Hat, No Cattle" (*The Millionaire Next Door*, 1996); Wilbur Wright, "If you are looking for perfect safety, you will do well to sit on a fence and watch the birds…" (Western Society of Engineers, 1901); "Once you have tasted flight…" (often attributed to Leonardo da Vinci; written by John H. Secondari for a 1965 film); "Do not save what is left after spending; spend what is left after saving" (often attributed to Warren Buffett; no primary source); "Using money you haven't earned to buy things you don't need to impress people you don't like" (Robert Quillen, 1928; often attributed to Will Rogers); Shakespeare, "Neither a borrower nor a lender be" (*Hamlet*, 1.3). Tips: move the flight money on payday, before spending starts (Clason; Bach, *The Automatic Millionaire*, 2004); make it automatic (Bach); price a purchase in flying time before you buy (Thoreau; Robin and Dominguez); track a month or two before setting budgets (FCAC); build an emergency fund of three to six months of expenses (FCAC); pay the smallest debt first and roll its payment on (Ramsey, *The Total Money Makeover*, 2003).

---

## 5. Forecasting

The workbook has no forecasts, so each rule below is a new formula decision (§11), its tests worked by hand and each seen to fail against a deliberate mutation. Every function is pure, in `packages/core`, with `asOf` passed in. Nothing is stored; everything is recomputed on read.

**Honesty rules, for every forecast:**
- **History starts where the records start** (F24). A month before it is left out, never counted as $0. The owner's statements begin on 8 August 2026, so there is little history yet, and the screens say so.
- **Ranges, not points,** rounded by the engine to $10 and shown without cents.
- **Rough before it can be more.** Before the 7th of a month, or with fewer than three complete months of records, a forecast is one "about" figure labelled **rough**, never an invented range. With nothing to go on, it says when it will be possible ("Too early to tell: check back on the 7th").
- **D17 stands:** with no starting balance typed, no balance is forecast.

**What is forecast** (the full rules are in §11):
- **Category pace (F28):** from the 7th, a category's spending so far scaled to the whole month, and how far over its budget that would go.
- **Pay still due (F29):** the paydays left this month from the pay schedule, each at the category's usual pay (the median of its last three receipts); with no receipt yet, the monthly goal's share per payday; with neither, pay is left out and the forecast says so.
- **The month's end (F30):** a range of scenarios: this month's pace (from the 7th), and each of up to six earlier complete months' rate for the days left. The ending balance range is the typed start, plus income received and pay still due, less Spent (which already counts planned bills, F3), variable spending still to come, saved, and savings still planned.
- **Safe to spend (F31):** what is left after pay still due, bills still due and savings still planned, divided by the days left including today, rounded down to the cent. None when nothing is left, and not shown without a typed start.
- **The next 30 days (F32):** from today's balance, each payday, each bill on its due day (a bill past its day with no charge yet counts tomorrow, as "due, not seen yet"), and a daily variable amount from the last 90 days of records (at least 14 needed). Gives the line, the tightest day and its balance, and the bills due in the next 7 days. Savings transfers not yet made are left out and the card says so.
- **The flight date (F33):** the goal fund's monthly contributions over up to six complete months give a low, middle and high pace (p25, median, p75), each turned into a date by the existing `projectGoal`. The weekly amount needed for a target date comes from the existing `requiredWeeklyContribution`. Milestones fall every 5 hours of flying saved.
- **What to cut (F34):** for each variable category with history, 10% and 25% of its usual month, and "your best month" (its usual month less its lowest), each rounded to $5, turned into weeks sooner for the flight goal and minutes of flying a month.
- **The next three months (F35):** expected pay, planned bills, variable spending as a low, middle and high month, and planned savings, giving a net range; with a typed start, a chain of best and worst cases, labelled "not a promise".
- **The debt-free date** reuses the existing `debtPlan`.

**How the Month's two month-end figures differ.** The Month's End of month is the workbook's figure (F7): the start, plus income so far, less Spent with planned bills counted, less saved. The forecast adds pay still due, variable spending still to come and savings still planned. So the forecast line is labelled "Forecast", ⓘ says so in one sentence, and Help has "Two month-end figures". F7 itself does not change.

---

## 6. Comparisons with last month

- **Like for like (F25).** A month still running is compared with the same days of last month: 1–24 September against 1–24 August, and 31 March against 1–28 February. A finished month is compared whole against the whole month before. The Week is compared with last week up to the same weekday; a pay period with the one before by the same number of days; the Year with the twelve months before, only where they lie inside the records.
- **Both windows use `periodSheet`,** so F8's planned-bill rule applies to each side the same way. Because a partial window counts a planned bill only on its due day, a same-days figure is not the Month's Spent. That is why the strip names both of its own figures and both dates, and never puts a change under Spent alone.
- **Inside the records only (F24).** When the earlier window starts before the records do, there is no comparison, and the strip says what would make one possible: "Import the statement before 8 Aug to compare with August."
- **A change (F26)** is now less before. As a percentage it is the change over the earlier figure, rounded half-up in basis points, and never shown when the earlier figure is $0: the amount shows, a percentage never does. Under $1.00 counts as the same. What a direction means comes from the list: spending up is "watch", income or savings up is "good". Every change is written in words ("more", "less"), never shown by colour alone.
- **Notable (F27).** A change is worth a card only when it is at least the larger of $25, 15% of the usual month and three times the usual variation (the median absolute deviation). With under three complete months, the larger of $25 and 25%. Chips show every change of $1 or more; only notable changes become cards.

**Where comparisons appear:**
- **Month:** the summary strip (§2.2), the **Left | vs last month** switch on each block, block totals, and "Last month (same days): $X" in a row's charges.
- **Week** against last week, **Paycheck** against the last pay period, **Year** against the twelve months before (and "vs last year" on its glance cards, inside the records), **Savings** saved this month against last, **Debts** the schedule's balance against a month ago.
- **Coach cards and Reports** throughout.
- The previous window's rows come in the same read as the current one. If that read fails, the comparisons hide with one line and the screen still shows.
- The workbook shows no comparisons, so adding them to its views is divergence **D26**, written by A03. The workbook's own figures do not change, and the golden tests do not move.
