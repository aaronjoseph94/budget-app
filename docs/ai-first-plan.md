# AI first: the build plan for the owner's list of 2026-09-24

**Status: planned (2026-09-24).** Nothing below is built yet. Written on branch `main-tnlcto` at `50b601d`, where the first load is 182.34 KB gzipped against the 200 KB gate (`scripts/check-bundle.mjs`), every screen but the Month and More is its own chunk, and the Content-Security-Policy lets the page talk to the Supabase project and nothing else.

This plan was made from three independent designs, each led by one concern (safety and grounding, the owner's experience, and staying useful on free tiers), and from two judges' verdicts, one engineering and one from the owner's side. It takes its architecture and safety from the grounded design; its screens, tone, navigation, Help and Setup from the owner-experience design; and its free-tier budgeting and statistical honesty from the third. §15 records every place the designs disagreed and what was chosen. §16 lists every item the judges said must be fixed and where this plan answers it.

**Every choice in this plan is "Decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions"** unless it says the owner chose it. Where the owner's own words settle something, they are quoted. Nothing here claims the owner chose what they did not.

**The short version, for the owner:**
- **A Coach tab, next to Month.** It shows how far the flight fund has come in hours of flying, what changed since last month, what to trim and how many weeks sooner that gets you flying, and a money quote or tip that fits. On Sundays there is a short check-in.
- **The AI writes the words. Your own numbers write every figure.** For the Coach, the forecast and the reports, the AI is never sent your amounts or balances: it writes around blanks that the app fills from your real figures. A receipt photo, and what you type into Just type it or Ask, are sent as they are (§3.6). If the AI is off, busy or out of free uses, you see the same card in the app's own words. Nothing breaks.
- **Free Google Gemini first.** In AI settings: **Get a free key**, paste it, **Save & test**. If you already added a Gemini key for receipt photos, it is used as soon as the AI helper is pasted, with no key to paste. Other free services (Groq, OpenRouter) and paid ones (OpenAI, Anthropic) can be added. Paid ones are used only if you switch them on.
- **More than one savings goal** (you asked for this later the same day). On Savings, **Add a goal**; choose which one is your main goal, and pause or finish the others. Flight training stays your main goal, in hours of flying, until you choose another.
- **Forecast.** "Safe to spend $31 a day", where the month is heading, the tightest day in the next 30, when you will be flying, and the next three months.
- **Reports.** The month in review, trends, shops and subscriptions, and your spending habits, with Save as PDF and a CSV download.
- **Last month, everywhere.** Month, Week, Paycheck, Year, Savings and Debts show what you did at the same point last month.
- **Help that doesn't leave you lost.** A **?** beside every screen's title, a Getting started guide one step at a time, and a One-time updates page that checks what is installed and has Copy buttons.
- **After the push you do three things, about 15 minutes, once:** paste four database updates, paste the AI helper, paste a free Gemini key (§10). HANDOFF's step 1 (the twelve updates `0003` to `0014`) is done: the owner pasted them on 2026-09-24. Help → One-time updates shows which of the new ones are left.
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

Later the same day the owner added: "I also want the ability to add other goals for saving not just flight... make sure to add that". Slice G1 (§13) builds it.

**Item 2's question, answered.** Today the app uses AI in one place: reading a receipt photo, through the `read-receipt` function, which has not been deployed yet. After this plan it uses AI in sixteen places (§3.11), all through one helper, and every one of them still works with AI switched off.

**Where each item is answered:**

| Item | Where in this plan | Slices (§13) |
|---|---|---|
| 1. Proceed without questions; make a list first | This document is the list; every choice is labelled | A01 |
| 2. AI first; free Gemini; paid optional | §3, §4, ADR 0004, ADR 0005 | A02, A07–A12, A17, A20–A25; G1 (goals the coach can speak of) |
| 3. Forecasting | §5 | A13, A14 |
| 4. The brand out of every push | Rewriting history is done outside these slices. The `brand` gate already keeps it out of every tracked file (CONSTRAINTS.md, N64) | — |
| 5. Help and setup | §8 | A06, A25, A28 |
| 6. Reporting and trends | §7 | A15–A19 |
| 7. Comparisons with last month | §6 | A03, A04 |
| 8. A critical review of the whole app | §2.10, §14, A27 | A27 |
| 9. Mobile friendly | §9 | every screen slice, then A26 |
| 10. Test everything; push to main | §13's rules; A28 | A28 |

**What the instruction approves that CLAUDE.md would otherwise ask first.** ADR 0004 records each one with the owner's words:
- **Adding LLM providers:** the owner asked for free models "like google Gemini" and "the ability to add paid models". Which services is the engineer's choice under that instruction: Gemini first, Groq and OpenRouter (free), OpenAI and Anthropic (paid).
- **Sending financial content to them.** The owner accepted the privacy trade-off for Gemini's free tier in ADR 0002 ("I don't care about privacy... use Gemini free tier."), and the 2026-09-24 instruction asks for AI insights into spending, which cannot be given without sending some of it. The other free services carry the same trade-off, and each one's card in AI settings says so before a key is pasted.
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
    day in August. Cooking at home a few nights this week pulls it back.
 ✨ Spotify went up: $11.99 → $12.99.                            ✕
 ✨ 3 weeks in a row under your Variable budget.                 ✕
 [ Forecast: about $3,100 by 30 Sep → ]  [ Reports: August → ]
 "…a small leak will sink a great ship."
   Benjamin Franklin, The Way to Wealth (1758)
   ✨ Your subscriptions are the little expenses he meant.
 [ Ask anything about your money…                            ✨ ]
```

The hero card is the main goal (G1); the other active goals sit under it as a short list, each with its bar and saved of target. Every figure in these lines, the "3" of "3 weeks" and "August" included, is a blank the app filled from the engine. The AI's own words hold no digit and no number word, so it can write "a few nights" but never "two dinners" (ADR 0005).

- **At most three insight cards,** ranked by how much money each is about. A stale-data card ("Your last statement ends 18 days ago: import the new one for fresh advice") always comes first when it applies, because a stale ledger makes a coach confidently wrong (`docs/ideas/insights.md`).
- **Each card has one action** (See charges, Set a budget, Open goal, Add it as a bill), **✕** to dismiss, and **Why am I seeing this?**, which lists the engine figures behind it. A dismissed card does not come back for the same cause, on any device.
- **Evidence chips are drawn by the app, never written by the AI:** "Based on 2 months", "New: not enough history yet".
- **Tone.** AI settings offers **Cheerleader** (the default: a win first, one thing to try, never shaming) and **Straight talker**. No tone ever sends a bare "you overspent": every card that says to watch something carries one thing to try.
- **Labels.** AI words carry ✨ and, in the card's sheet, "Written by AI from your numbers". The app's own words carry nothing extra, and the status line says "The app's own words: turn on free AI (2 minutes)".

### 2.4 The Sunday check-in (`#/coach/checkin`)

From Sunday the Coach tab shows a dot. The check-in is one screen: last week's recap and a win; one thing to try; a line on the flight goal; up to three questions about last week's biggest discretionary charges ("Was Sushi Place, $84.20, planned?" with **Planned**, **Impulse** and **Needed**); and a one-tap commitment ("Keep Dining out under $60.00 next week?"), which writes that category's weekly budget through the Week's existing save. Answers are kept (0017) and become the "how much of it was impulse" fact the coach can cite. It works with AI off, with the same sections in the app's own words.

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

- **Week, Paycheck and Year** show last week, the last pay period and the previous twelve months beside their totals. **Savings** shows saved this month against last, and holds every goal: **Add a goal**, the main goal, reorder, pause and mark reached (G1). **Debts** shows the schedule's balance against a month ago.
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
- **Codes the app turns into sentences:** `not_signed_in`, `origin_not_allowed`, `bad_request`, `ai_off`, `not_set_up`, `needs_update` (0016 missing), `limit_reached`, `all_resting` (every service rate-limited or cooling down), `all_failed`, `key_rejected`, `keys_locked`.

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

- **Review suggestions** are written as `category_source = 'model'` on pending rows only, by a guarded function (0018). 0004's CHECK still refuses approving a row as `model`. **Approve** records `user` and learns the shop as today. **Approve these 12** calls `approve_candidate` once per row, each a conditional write, after one confirmation.
- **Just type it and receipts** only fill the Add form, and the owner presses **Save**. A quick-add amount must appear, word for word after normalising, in what the owner typed. The receipt path stays form, then Review.
- **The check-in's commitment** writes a weekly budget only when tapped.

### 3.10 Failing soft

Nothing in the app's first load needs a new table or column. `AppDataProvider.refresh()` loads with one `Promise.all`, so a missing table there would fail the whole app; every AI and coach read is its own, and fails on its own. The one new read there, G1's goals, asks for 0015's columns and, when they are missing (42703), reads the goals as before. Every optional panel on the Month sits inside an error boundary, so an engine error hides that panel with one line and never takes the Month down.

| Missing | What still works | What says "Needs a one-time update → Help" |
|---|---|---|
| 0015 | Everything; adding, editing and showing goals work as before, the oldest active goal leading | choosing a main goal, reordering, pausing and marking a goal reached |
| 0016 | Everything, including the Coach in the app's own words, Forecast, Reports and comparisons | AI settings; AI words (the app's own are shown) |
| 0017 | AI works, uncached; the Coach works | ✕ on cards is hidden; the check-in's answers |
| 0018 | Review works as today | the suggestions |
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
| 5 | Encouragement and wins | Coach, check-in | "3 weeks in a row under your Variable budget" | win facts: streaks, personal bests, saved more than last month, milestones (F40, F33) | template | the pack |
| 6 | A quote or tip that fits | Coach, check-in, Reports | a library quote with its source, and "why it fits" | the committed library (§4); the AI picks an offered id | the day's tag-matched pick | the pack |
| 7 | Sunday check-in | `#/coach/checkin` | recap, a win, one thing to try, questions, a one-tap limit | weekly recap facts, questions, suggested limit (F42) | the same sections, in templates | 1 a week |
| 8 | Forecast sentence | Forecast top, Coach | "At this pace September ends near $3,100; your tightest day is the 28th." | forecast facts (F30–F32) | template | the pack |
| 9 | Savings note | Savings | one line on the flight fund's month | goal facts | template | the pack |
| 10 | Month in review | Reports → Overview | a headline, three points, one thing to try next month | report facts (F36), against last month and your usual month | template naming the biggest change each way | about 1 a month |
| 11 | Subscription and unusual-charge alerts | Coach, Reports → Shops | "Spotify went up: $11.99 → $12.99", "Possible double charge at …" | detectors (F38, F39) | template | the pack |
| 12 | Ask | `#/ask`, Coach, every help sheet | an answer card with the engine's figure | the AI picks a fixed intent; `answerQuery` in core computes the answer | question chips answered by core | per question |
| 13 | Help answers | Ask, help sheets | "How do I…" opens the matching article | the AI picks a committed topic id | search over the articles | within Ask |
| 14 | Review suggestions | Review | "✨ Suggested: Groceries", picked, Approve still a tap | the AI picks an offered category alias; stored as `model` (0018) | "You filed a similar shop under…" (not stored) | 1–3 per statement |
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
- **The starting list, each to be re-verified at build:** Franklin, "Beware of little expences; a small leak will sink a great ship" (*The Way to Wealth*, 1758); Franklin, "A Penny sav'd is Twopence clear" (*Poor Richard's Almanack*, 1737, in the almanac's own spelling; the note says "a penny saved is a penny earned" is a later proverb); Thoreau, "the cost of a thing is the amount of what I will call life…" (*Walden*, 1854, "Economy"); Dickens, Mr. Micawber's "Annual income twenty pounds…" (*David Copperfield*, 1850, ch. 12); Seneca, "It is not the man who has too little, but the man who craves more, that is poor" (*Moral Letters to Lucilius*, Letter 2, Gummere); Samuel Johnson, "Resolve not to be poor: whatever you have, spend less" (letter to Boswell, 7 Dec 1782); Clason, "A part of all you earn is yours to keep" (*The Richest Man in Babylon*, 1926); Robin and Dominguez, "Money is something we choose to trade our life energy for" (*Your Money or Your Life*, 1992); Housel, "Spending money to show people how much money you have is the fastest way to have less money" (*The Psychology of Money*, 2020; chapter confirmed at build); Sethi, "Spend extravagantly on the things you love, and cut costs mercilessly on the things you don't" (*I Will Teach You to Be Rich*, 2009); James Clear, "You do not rise to the level of your goals. You fall to the level of your systems" (*Atomic Habits*, 2018, ch. 1); Stanley and Danko, "Big Hat, No Cattle" (*The Millionaire Next Door*, 1996); Wilbur Wright, "If you are looking for perfect safety, you will do well to sit on a fence and watch the birds…" (Western Society of Engineers, 1901); "Once you have tasted flight…" (often attributed to Leonardo da Vinci; written by John H. Secondari for a 1965 film); "Do not save what is left after spending; spend what is left after saving" (often attributed to Warren Buffett; no primary source); "Using money you haven't earned to buy things you don't need to impress people you don't like" (Robert Quillen, 1928; often attributed to Will Rogers); Shakespeare, "Neither a borrower nor a lender be" (*Hamlet*, 1.3). Tips: move the flight money on payday, before spending starts (Clason; Bach, *The Automatic Millionaire*, 2004); make it automatic (Bach); price a purchase in flying time before you buy (Thoreau; Robin and Dominguez); track what comes in and what goes out, and change a budget that real spending keeps missing (FCAC, "Making a budget"); build an emergency fund of three to six months of expenses (FCAC, "Setting up an emergency fund"); pay the smallest debt first and roll its payment on (Ramsey, *The Total Money Makeover*, 2003).
- **Where each can be checked** (the builder records the address used in `sourceUrls`): Founders Online (founders.archives.gov) for Franklin's almanac of 1737 and *The Way to Wealth*; Project Gutenberg for *Walden*, *David Copperfield*, *Hamlet* and Boswell's *Life of Johnson* (the letter of 7 December 1782); Wilbur Wright's "Some Aeronautical Experiments" as printed by the Western Society of Engineers in 1901; Wikisource for Gummere's Seneca; Quote Investigator for the Secondari line (quoteinvestigator.com/2019/01/07/flight/) and for Quillen (quoteinvestigator.com/2016/04/21/impress/); FCAC's pages on canada.ca (`/en/financial-consumer-agency/services/make-budget.html` and `/services/savings-investments/setting-up-emergency-funds.html`); and the named books for the rest, by chapter or page.

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

---

## 7. Reports and trends

**The engine** (`packages/core`, hand-derived tests, each rule in §11):
- `monthlyTotals`: each complete month's Income, Spent and Saved, from `monthSheet`, inside the records.
- `savingsRate` (F36): saved over income, in basis points, half-up; none when income is $0.
- `biggestMovers` (F36): the categories furthest from their usual month, beyond the notable band, three up and three down.
- `categoryTrends` and `trendLabel` (F37).
- `topShops` (F41), `recurringCharges` (F38), `unusualCharges` (F39).
- `spendingGrid`, `weekdayPattern`, `streaks`, `personalBest` (F40).
- A shop is grouped by the normalised merchant `statement-parsers` already makes. The app passes that key in as data, so core still imports only `money-primitives`.

**New charts** in `packages/chart-specs`, each a pure function returning an SVG string on an integer grid, every label escaped through `el`, with a text list of the same figures beside it:
- `balanceLine`: the 30-day line, with the tightest day marked.
- `rangeBar`: the month-end range against today.
- `trendLines`, with a `sparkline` form for a row.
- `pairedBars`: this month against last, by category.
- `heatGrid`: the spending grid.
- The weekday pattern reuses the existing `bars`.
- Chart heights and positions come to the chart in basis points from core, so no chart divides money.

**The screen** is §2.6: four tabs, Overview first, in its own chunk. The report narrative is the `report` pack, asked for once per complete month and cached. The current month is marked "so far".

**Save and download (`report-export`, realised in part).**
- **Save as PDF:** a print stylesheet on Reports. The browser's own print makes the PDF, so nothing new is loaded and nothing leaves the phone.
- **Download CSV:** the month's transactions and the Overview's table, written by a new `packages/report-export`, loaded only when tapped. A text cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe, so a spreadsheet never runs a shop's name as a formula (N4). Amounts are written by the app's formatter as plain `1234.56`.
- **The Excel workbook with charts stays unbuilt.** It needs a library, which is a dependency to ask about first. The Sankey stays unbuilt too.

---

## 8. Help and Setup

**Writing rules for everything in this section:** one action per step; the exact button name in bold; the time it takes ("about 2 minutes"); "Nothing breaks if you stop here"; no engineering words. A migration is a "one-time update", the Edge Function is "the AI helper", Gemini and the others are "AI services", and a key is explained once as "a password the service gives you for the app to use".

### 8.1 Getting started (`#/start`)

One step per screen: a bar ("Step 3 of 9 · about 2 minutes"), a large title, one sentence on why it matters, the real control on the screen (the existing Setup, pay, bill, goal and balance editors, reused), and **Continue** or **Do this later**.

| # | Step | Done when (read from the data, never stored) |
|---|---|---|
| 1 | Your name | a name is saved |
| 2 | Your lists (the starter list button) | a spending category exists |
| 3 | When you're paid | an Income category has a pay schedule |
| 4 | Your bills | a bill, debt or subscription has a monthly amount |
| 5 | Your goals: the flight goal first ($30,000 at $275 an hour, and what is saved so far), and **Add a goal** for any other (G1) | a savings goal with a target exists |
| 6 | Your first statement, and filing it | an import exists and Review is empty |
| 7 | This month's starting balance, with starter budgets offered | this month's balance is typed |
| 8 | Turn on free AI | the AI helper answers and a Gemini key or the secret works |
| 9 | Put it on your iPhone (optional) | the app is open from the home screen, or ticked by hand |

- **Progress comes from `setupProgress` in core,** which takes one yes, no or "can't check yet" per step and returns the steps in order, how many are done and the next one. A step whose read failed shows "can't check yet", never "done".
- **Do this later** moves a step to the end. The choice, and a hand-ticked step 9, are kept in the sign-in's `user_metadata`, as the name already is (`profile.ts`), so they follow the owner to another device with no migration.
- **Step 7 offers starter budgets (F43):** each spending category's usual month, rounded up to $5, each written only when **Accept** is tapped.
- **Step 8 is honest about time.** If the AI helper or 0016 is not in yet, it first walks through One-time updates (§8.2): "about 15 minutes, once, easiest on a computer". The key itself then takes under 2 minutes on an iPhone. If the `GEMINI_API_KEY` secret already works, the step is already done.
- **Finishing** shows a small paper-plane celebration (none under reduced motion) and "Your coach is ready", then the Coach.
- **The Month's empty state and the first sign-in** open Getting started. More and Settings show "Getting started: 5 of 9 done" until it is finished.

### 8.2 Help (`#/help`, `#/help/<topic>`)

- **Articles are committed data** (`apps/web/src/help/articles.ts`: id, title, summary, steps, "You're done when…", "Stuck?", the screen it belongs to, related ids). They are drawn as text and lists, never markup, and a search box filters titles and text.
- **Each article follows one pattern:** one line on what it is, numbered steps with the exact button names in bold, "You're done when…", and "Stuck?".
- **The topics:** Start here (Getting started's progress) · One-time updates · Month, Week, Pay and Year · Bring in a statement · Why things wait in Review · Add: type it, a photo, just type it · Budgets and bills · Savings and your goals · Add a savings goal (G1) · Debts · What the Coach does, and never does · The Sunday check-in · How the forecast works · Two month-end figures · Reports and trends · Comparisons with last month · Ask · Turn on free AI · More AI services, paid ones too · What the AI sees · Why the AI sometimes rests · Why does a number look wrong? (a statement not imported yet, rows waiting in Review, no starting balance, card payments not counted, planned against real, typed and imported twice) · Messages with a code in brackets · Put it on your iPhone · Words the app uses.
- **The ? beside every title** opens that screen's article in a bottom sheet, with **Show me** and **Ask about this**.

**One-time updates (`#/help/updates`, ADR 0007)** checks what is actually there and shows only what is left:
- It probes each table and function from 0005 to 0018 (an empty read or call; PGRST205 or 42P01 means a table is missing, PGRST202 a function), sends the AI helper `ping` (a 404 means it is not deployed), and reads the key status. It shows "3 of 4 installed", a ✓ or ✗ on each, and the exact next file. When 0005 is missing it starts the list at 0003, HANDOFF's first, and says that a file already pasted is refused rather than applied twice, so a repeat does no harm.
- **Copy buttons** fetch `/setup/0015_savings_goals_order.sql` and the rest, and `/setup/ai-function.ts`. A small Vite plugin, `apps/web/setup-files.ts`, using Node's `fs` and no new dependency, copies those committed files into the build, and serves them in dev. It copies only migrations from 0015 on and the `ai` helper's source, never anything from the environment. A test checks that each served file is byte for byte the committed one. The files are public on the site; they hold no secret (gitleaks scans them where they are committed), and reading the schema gives nobody access, because row-level security does.
- Each step has the exact Supabase clicks (§10.2), then **Check again**. With nothing left it says "All done".
- **Every "needs a one-time update" line in the app links here,** and the old messages that name a migration number ("0008 in the setup guide") are reworded to point here (A27).

### 8.3 AI settings (`#/ai`)

- **A sentence at the top** says what is true now: "AI is on, using free Google Gemini", "AI is on, using your receipts key", or "AI is off. Everything still works; the Coach uses the app's own words."
- **Free Google Gemini (recommended),** three numbered steps: 1. **Get a free key** (opens https://aistudio.google.com/apikey in a new tab, `rel="noopener noreferrer"`), then **Create API key** and copy it. 2. Paste it (a password-style field with a Show toggle; autocomplete, autocapitalise and spellcheck off; 16 px text). 3. **Save & test**. The result: "Works · key ending …abcd", "Google says this key isn't valid: check you copied all of it", or "Busy right now: saved, and it will be tried again".
- **More options, collapsed:** Groq (free), OpenRouter (free), OpenAI (paid) and Anthropic (paid), each with a get-a-key link, the same paste and test, one line on cost and privacy, **Check which models work**, and a model choice from the listed models the key can use. Then **Try in this order** with up and down buttons, **Use paid services** (off), **Daily limit** (40, from 10 to 150) with "Today: 7 of 40", coach tone, **Share shop names with the AI**, an on/off switch for AI, and **What the AI sees** (§3.6).
- **Remove key** on each saved one. The key is never shown again; only "ending …abcd".

---

## 9. Mobile

**Target:** designed at 390 px; must work at 320 px. Checked at 320, 375, 390, 430, 768 and 1280 px, light and dark, and with text at 200% (N58), in the preview harness's Chromium. WebKit cannot run here (N41), so HANDOFF asks the owner to look at the Month, the Coach and Forecast on the iPhone.

**Rules for every new screen and every change:**
- One column below 768 px, with a 16 px side gutter (12 px below 360 px) and no sideways page scroll. A wide table (Year, the three months ahead) scrolls inside its own box.
- `min-w-0` on flex children. Amounts use tabular digits, do not wrap, and align right; names truncate with the full name in `title` and in the row's sheet.
- Text inputs are 16 px so iOS does not zoom; amounts use `inputmode="decimal"`. Tap targets are at least 44 × 44 px. Nothing depends on hover.
- The phone bar's five tabs are about 64 px each at 320 px, clear of the home indicator. The **Month · Week · Pay · Year** switch is four segments of about 72 px; at large text sizes it scrolls inside its own box with an edge fade, as the Reports tabs do.
- Comparison chips wrap under their figures below 360 px. The Month's **vs last month** replaces Left rather than adding a column.
- Bottom sheets (the existing sheet) hold help, "Why am I seeing this?" and the editors, inside the safe areas. The Ask box sits in the normal page flow and scrolls into view on focus; a fixed box would slide under the iOS keyboard.
- Charts use a `viewBox` at 100% width with a minimum label size, and a text list beside them.
- AI words that arrive late replace the app's own in an `aria-live="polite"` region, with a crossfade, or none under reduced motion.
- Every new colour has a light and a dark token, the coach's sky-blue accent included, each checked at 4.5:1 or better.
- A one-line banner, "You're offline: figures may be out of date", when a read fails for lack of a network.
- Every new screen is its own chunk, and everything added to the Month (the strip, the switch, the coach line) is measured against the 200 KB first-load gate in the commit that adds it; the coach line and the forecast line load after the Month draws.

**Checks:** a committed static test fails on an arbitrary width class wider than 320 px in `apps/web/src`. The harness sweep asserts `document.documentElement.scrollWidth <= innerWidth` on every screen at 320 and 390 px, that the bottom bar is visible and unobscured, and saves screenshots to the scratchpad's `shots/`, never the repo. It stays in the scratchpad until a Playwright dev dependency is approved, so CONSTRAINTS.md gains a Pending row naming it (A26).

---

## 10. Migrations, and what the owner does after the push

0001 and 0002 were applied to the hosted project on 2026-09-22, and 0003–0014 on 2026-09-24, when the owner wrote "the pasting to supabase is done" (`docs/setup.md`). None of 0001–0014 changes. This phase adds four, forward-only, one per capability (0015 is G1's savings goals, added after the plan was written) so each can be missing on its own without breaking anything else. Every table enables RLS and adds the `user_id = auth.uid()` policy in the same file.

### 10.1 What each one adds

**`0015_savings_goals_order.sql`** (G1)
- `savings_goals` gains `sort_order int not null default 0`, `status goal_status not null default 'active'` (an enum: active, paused, reached) and `reached_on date`, with a CHECK that `reached_on` is set exactly when the goal is reached. Nothing is backfilled: every goal already there is active at position 0, which is F45's order by when each was made, so the main goal is the one the app showed before. RLS already covers the table (0004).

**`0016_ai_foundation.sql`** (A09; the service-role functions' bodies filled by A10 and A11)
- `ai_provider`, an enum: gemini, groq, openrouter, openai, anthropic.
- `ai_settings`, one row per user, which the browser reads and writes: `enabled` (default true), `provider_order ai_provider[]` (no repeats), `models jsonb` (a model per service; the helper re-checks each against its list), `daily_cap` (10–150, default 40), `allow_paid` (default false), `tone` (`cheerleader` or `straight`, default `cheerleader`), `share_shop_names` (default true).
- `ai_provider_keys (user_id, provider, ciphertext, iv, kek_id, key_v, key_hint, status, model, tested_at, updated_at)`, primary key `(user_id, provider)`. `key_hint` is at most 4 characters and `status` is ok, busy, rejected or locked. It has the policy, then `revoke all … from anon, authenticated`, so the browser cannot select, insert, update or delete a row, not even its own.
- `ai_usage (user_id, day, provider, model, task, attempts, tokens_est, ok)`. The browser can read it (for "Today: 7 of 40"), not write it.
- `ai_provider_state (user_id, provider, model, cooldown_until, last_code, updated_at)`. Read only, as above.
- **Functions for the helper alone**, SECURITY DEFINER with `search_path` pinned, each `revoke all … from public, anon, authenticated` then `grant execute … to service_role`, each taking an explicit `p_user`: `ai_context_for` (settings, the key ciphertexts, today's use and the cooldowns in one call), `ai_key_put`, `ai_key_mark`, `ai_usage_claim` (one statement: insert, or update where every limit still has room, returning whether the attempt may go; the total limit is read from `ai_settings`), and `ai_note_outcome` (records a code and a cooldown).
- **Functions for the browser**, SECURITY DEFINER with `search_path` pinned (the browser has no grant on the table they read), each `revoke all … from public, anon` then `grant execute … to authenticated`, and each acting only on rows where `user_id = auth.uid()`, taking no user id: `ai_key_status()` (service, hint, status, model, tested date; never ciphertext) and `ai_key_forget(p_provider)` (deletes the caller's key for that service, and nobody else's).
- `supabase/local-stub.sql` gains a `service_role` role, as Supabase has, so the schema gate can prove each grant and each refusal.

**`0017_coach_memory.sql`** (A12)
- `ai_text_is_clean(jsonb)`, IMMUTABLE: false when the text holds an ASCII digit, a fullwidth digit (U+FF10–FF19), an Arabic-Indic digit (U+0660–0669, U+06F0–06F9), a Devanagari digit (U+0966–096F), `$`, `＄`, `%`, `％`, `€`, `£`, `¥`, `¢` or `₹`. It is the backstop; the app's rule (ADR 0005) is wider and runs first. `scripts/verify-migrations.sh` creates its throwaway database as UTF-8 (`initdb -E UTF8 --locale=C`), as Supabase's is, so these ranges mean characters.
- `ai_notes (id, user_id, surface, scope, facts_sig, prompt_v, body, card_sigs, fact_keys, provider, model, created_at)`: `surface` is daily, checkin or report; `scope` like `day:2026-09-24`; `facts_sig` 64 hex characters; `body jsonb` passes `ai_text_is_clean` and is at most 8 KB; unique `(user_id, surface, scope, facts_sig)`. A trigger keeps each user's newest 30 rows per surface; its function is an ordinary invoker one, so row-level security limits it to the inserting user's rows. The browser writes its own rows after checking the words.
- `insight_dismissals (user_id, insight_key, dismissed_at)`, primary key `(user_id, insight_key)`; the key is the cause, such as `subscription_price_up:<shop>:2026-09`.
- `transactions` gains a unique constraint on `(id, user_id)`. It is additive and cannot fail on existing rows, because `id` is already unique. It lets the next table name a charge and its owner together.
- `coach_answers (user_id, transaction_id, answer, asked_week, answered_at)`: `answer` is planned, impulse or needed; primary key `(user_id, transaction_id)`; foreign key `(transaction_id, user_id)` to `transactions (id, user_id)`, on delete cascade, so an answer can never name another person's charge.

**`0018_category_suggestions.sql`** (A21)
- `suggest_candidate_categories(p jsonb) returns integer`, SECURITY DEFINER, `search_path` pinned, at most 200 items of `{candidate, category}`. It sets `category_id` and `category_source = 'model'` only on the caller's candidates that are pending with no category or a model's, and only to the caller's categories that are not on Not spending. It returns how many it set. It never touches a row the owner or a learned rule filled.
- `clear_candidate_suggestion(p_candidate uuid)`, SECURITY DEFINER, `search_path` pinned: puts a suggestion back to none, only on the caller's own candidate (`user_id = auth.uid()`) that is pending with `category_source = 'model'`; any other row is left alone and it returns false.
- Both are revoked from public and anon and granted to authenticated, and both join the schema gate's anon-execute list. The gate also proves each refuses another user's candidate.

**The schema gate** (`supabase/tests/schema-assertions.sql`) attempts every refusal, and each assertion is seen to fail once by deleting what it proves: the browser selecting or writing `ai_provider_keys`; the browser writing `ai_usage` or `ai_provider_state`; anon or authenticated running a helper-only function; `ai_usage_claim` past a limit; `ai_key_status` returning ciphertext or another user's row; `ai_key_forget` removing another user's key; an `ai_notes` body holding `$412`, `2026`, a fullwidth digit, an Arabic-Indic digit or `＄`, while `{{A.change}}` passes; a `coach_answers` row naming another user's charge; a suggestion on an approved, user-filled or rule-filled row, on another user's candidate or category, or on Not spending; clearing another user's suggestion; approving as `model` (0004, again); RLS isolating two users on every new table.

### 10.2 What the owner does after the push

**Already done: HANDOFF's step 1.** The owner pasted `0003` to `0014` on 2026-09-24, and `0001` and `0002` before that: do not run them again. One-time updates (A06) shows which of these are still missing; they are copied from GitHub as HANDOFF says, because the app's Copy buttons carry only `0015` on.

**Then three things, in this order, about 15 minutes, once. Easiest on a computer.** Until they are done, everything that worked before still works, and the new screens use the app's own words. In the app, **Help → One-time updates** checks each step and has Copy buttons, so there is no need to open GitHub.

1. **Paste the four new database updates, one at a time, after `0014`.** Supabase → **SQL Editor** → **New query**. In the app, Help → One-time updates → **Copy** beside `0015_savings_goals_order.sql`. Paste, press **Run**, and wait for "Success. No rows returned." Then a new query for `0016_ai_foundation.sql`, then `0017_coach_memory.sql`, then `0018_category_suggestions.sql`. If one says anything other than "Success", stop there. Nothing is lost, and the message says which line.
2. **Paste the AI helper.** Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**. Name it exactly `ai`. In the app, **Copy** beside "The AI helper", paste it over everything in the editor, keep **Enforce JWT verification** on, and press **Deploy**. There are no new secrets: `GEMINI_API_KEY` and `EXTRA_ORIGINS` are reused if you set them for receipt photos.
3. **Turn on free AI.** In the app: More → **AI settings** → **Get a free key**. Google AI Studio opens in a new tab: **Create API key**, copy it, come back, paste it, and press **Save & test**. You should see "Works · key ending …abcd". If you set `GEMINI_API_KEY` for receipts earlier, the screen already says "AI is on" and there is nothing to paste.

Then **Check again** on One-time updates says "All done".

**Optional:** if you deployed `read-receipt` earlier, paste its new version the same way. It moves off a Google model that stops working in mid-October. The AI helper reads receipts itself, so this matters only as a fallback.

### 10.3 Why pushing before pasting is safe

`main` deploys itself when pushed (HANDOFF step 2). Nothing in the first load needs anything from 0015–0018 (G1's goals read falls back to the columns before 0015), every new read fails soft on its own, and a missing helper is a 404 that becomes one quiet line (§3.10). A28 proves it by walking every screen with each piece missing in turn. This covers only the four new updates; 0003–0014 are already in (2026-09-24).

---

## 11. Formula decisions this phase adds (F24–F44)

None has a workbook cell, so each is an engineering default, labelled "Decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions", with hand-derived tests. **The slice named transcribes each into `docs/formula-decisions.md`, with a worked example, before its code.** Money is integer cents throughout; "half-up" is the rounding `money-primitives` already defines.

| F | Rule | Slice |
|---|---|---|
| F24 | **History start.** The earliest statement period's start; with no statement, the earliest ledger date. A window that starts before it is not compared or used as a baseline. A **complete month** lies wholly between history start and the start of `asOf`'s month. **Evidence:** thin with 0–2 complete months, some with 3–5, solid with 6 or more | A03 |
| F25 | **Comparison windows.** A month running on day d: days 1..d against days 1..min(d, last month's length). A past month: whole against whole. A week: Monday to `asOf`'s weekday against the same days of the week before. A pay period: its start to `asOf` against the previous period's start plus the same number of days, capped at its end. A Year: against the twelve months before. Both sides through `periodSheet` (F8) | A03 |
| F26 | **A change.** `change = now − before`. `changeBp = change × 10000 ÷ |before|`, half-up; none when before is 0. Under 100 cents either way is "same". Meaning by list: on Bills, Debts, Subscriptions and Variable, up is "watch"; on Income and Savings, up is "good". A change slot is drawn as the amount and its direction word ("$40.00 more", "$40.00 less", "about the same") | A03 |
| F27 | **Usual month and the notable band.** Usual = the median of a category's totals over up to 6 most recent complete months (F24). MAD = the median of each month's distance from it. Band = max(2500, 15% of usual half-up, 3 × MAD) with 3 or more complete months, else max(2500, 25% of usual). For a window of d days in a month of D, the band is scaled by d ÷ D, half-up, never below 2500. The summary's totals (this month and this week against the same days before) use max(2500, 15% of the earlier figure), so the Month can size them from the two months it reads. **Size:** slight under the band, clear from 1 to under 2 bands, big from 2 bands | A07 |
| F28 | **Category pace.** From day 7 of the current month: `actual × D ÷ d`, half-up; none before day 7 or for a past month. Over budget by `pace − budget` when a budget is set and that is above 0 | A07 |
| F29 | **Pay still due.** For each Income category with a schedule (on Income, per N27): paydays after `asOf` this month × its usual pay (the median of its last 3 receipts inside the records). With no receipt, the monthly goal ÷ paydays in the month (F15's `payShare`). With a goal and no schedule, max(0, goal − received). With neither, none, and the forecast says pay is not included | A13 |
| F30 | **The month's end.** Variable still to come, per scenario: pace (from day 7) gives max(0, pace − actual); each of up to 6 complete months i gives `(D − d) × V_i ÷ D_i`, half-up. End = start + income received + pay still due − Spent (F7, planned bills counted) − variable still to come − saved − savings still planned (Σ max(0, goal − saved) over Savings rows). The range is the minimum, median and maximum of the scenarios, each rounded half-up to 1000 cents. Rough (one "about" figure, the median) before day 7 or under 3 complete months; nothing before day 7 with no complete month. No balance without a typed start (D17); the projected Spent still shows | A13 |
| F31 | **Safe to spend.** Available = start + income received + pay still due − Spent − saved − savings still planned. Per day = available ÷ (D − d + 1), rounded down to the cent, when available is above 0; else 0, "nothing left to spend safely this month". None without a typed start | A13 |
| F32 | **The next 30 days.** Today's balance = start + income received to date − real spending to date − saved to date. Each day after `asOf` for 30 days: paydays × usual pay (F29); each Bills, Debts or Subscriptions plan on its due day (F8, D6 for days 29–31), unless a real charge already replaced it this month (D5); a plan past its day with no charge counts tomorrow as "due, not seen yet"; a daily variable amount = real variable spending over the last min(90, days of records) days ÷ those days, half-up, only with 14 days or more. Gives the line, the lowest day and balance, and bills due in the next 7 days. Savings not yet moved are left out, and the card says so | A13 |
| F33 | **Flight date and milestones.** Monthly contributions into the goal fund's category over up to 6 complete months; p25, median and p75 by nearest rank; weekly = monthly × 12 ÷ 52, half-up; each to a date by `projectGoal`. Under 3 months: the median only, rough. All zero: "no date at your current pace", with the top lever. Hours saved = `timeEquivalent` at the goal's hourly rate, whole hours; a milestone when the hours cross a multiple of 5 since the last complete week | A08 |
| F34 | **Levers.** For each Variable category with a usual month (F27): 10% and 25% of it, and "your best month" (usual − its lowest complete month, when that is at least 500 cents), each rounded half-up to 500 cents. Weekly = monthly × 12 ÷ 52, half-up. Weeks sooner = ⌈remaining ÷ pace⌉ − ⌈remaining ÷ (pace + weekly)⌉ at the median pace (F33); with no pace, "gets you there in ⌈remaining ÷ weekly⌉ weeks". Flying time per month by `timeEquivalent`. At most two categories offered, one lever each, the 25% by default | A08 |
| F35 | **The next three months.** Per month: pay (paydays × usual pay, else the goal); every Bills, Debts and Subscriptions plan in effect (D13); variable spending as p25, median and p75 of complete months' Variable totals (under 3 months, the median only, rough); savings goals in effect (D12). Net = pay − bills − variable − savings. With a typed start, balances chain from F30's median, low with low and high with high, labelled best and worst case | A14 |
| F36 | **Month totals, savings rate, movers.** Totals from `monthSheet`. Savings rate = saved × 10000 ÷ income, half-up; none when income is 0. Movers: categories whose month differs from their usual (F27, the month itself left out) by at least the band; three largest up and three down | A15 |
| F37 | **Trend label.** Needs 4 or more complete months. Over the last up to 6: "rising steadily" when at least 75% of month-to-month pairs rise and last − first exceeds the band; "falling steadily" the mirror; else "no clear trend". Under 4: "not enough months yet", naming the month it becomes possible | A16 |
| F38 | **Recurring charges.** The same shop, 3 or more charges, every gap in one band: 6–8 days (weekly), 12–16 (fortnightly), 26–35 (monthly) or 350–380 (yearly); each amount within max(100 cents, 10%) of their median. Next date = last + the median gap. A year's cost = median × 52, 26, 12 or 1. A price change: the latest differs from the one before by at least 50 cents and 2%. New: the first charge in the series is within the last 100 days | A17 |
| F39 | **Unusual charges.** One charge at least max(5000 cents, 3 × the category's median charge over the last 90 days of records), where the category has 5 or more earlier charges. A new shop at 10,000 cents or more, after 60 days of records. A possible double charge: the same shop and amount within 3 days, two different rows. A typed row and an imported row of the same amount within 3 days: "may be counted twice". Each is flagged, never hidden; duplicates are the dedupe hash's job | A17 |
| F40 | **Habits.** The grid: each day of up to 26 weeks inside the records, Variable spending against a daily allowance (the Variable list's weekly budgets ÷ 7, half-up; with none, the median daily Variable spend), in 5 levels: none, up to half, up to all, up to one and a half, more. Weekday pattern: average Variable spend per weekday over up to 12 complete weeks, needing 4. Streak: complete weeks in a row with Variable spending at or under its weekly budgets (`weekSheet`). Personal best: a category's last complete month is its lowest, with 3 or more complete months | A18 |
| F41 | **Top shops.** Net spending by shop in the window against the same-days window before (F25); the top 10 by amount; shops new this month | A17 |
| F42 | **The check-in.** Questions: last week's (Monday to Sunday) Variable charges of 2000 cents or more with no answer, the largest 3. Suggested limit, for the Variable category that cost most last week: min(last week's actual, its usual month × 12 ÷ 52), rounded down to 500 cents, at least 500. Impulse share: impulse answers ÷ answers over 8 weeks, in basis points, half-up | A20 |
| F43 | **Starter budgets.** For each spending category with a complete month: the median of up to its 3 latest, rounded up to 500 cents. Written only on **Accept**, as "from this month on" (D12) | A25 |
| F44 | **Impact, for ranking.** A fact's monthly effect: a change scaled to a whole month (`change × D ÷ d`, half-up), a lever's monthly saving, a subscription's monthly cost, an unusual charge's amount. Impact = effect × evidence weight (thin 1, some 2, solid 3). Stale data (the latest statement ends more than 10 days before `asOf`) always ranks first; rows waiting in Review second. Only notable facts, and the kinds that are always notable (stale data, waiting rows, milestones, price rises, possible doubles), become cards | A07 |

---

## 12. Records this phase writes

- **ADR 0004** (with this plan): the AI services, the allowlist, keys and failover, with the owner's approvals quoted.
- **ADR 0005** (with this plan): grounded AI text, the placeholder and facts rule, checking, the cache, the quotes library.
- **ADR 0006** (A05): navigation for an AI-first app, extending ADR 0003.
- **ADR 0007** (A09): one-time updates copied from inside the app.
- **ADR 0002** gains a dated note (A02): its default model moves, and its "switching provider is one file" line now means the `ai` helper.
- **Formula decisions F24–F44** (§11), each in its slice before code, and **F45** (G1): the goals' order, the main goal, paused and reached, and progress in hours or dollars.
- **Divergences:** **D26** (A03): the workbook's views gain comparisons with the previous period, and the Month's third column can show them; the workbook shows none, and its figures do not change. **D27** (A07, A13): the Month gains a coach line above its summary and a labelled forecast line inside it. **D28** (G1): Savings holds many goals in the owner's order, one the main goal, reached and paused ones folded away. Any slice that changes a workbook figure adds the next D-number.
- **CONSTRAINTS.md, Enforced:** Edge Functions type-checked, linted, boundary-checked and tested, coverage 80/80/75 (A02); the browser holds no provider host or service key (A09); model text carries no numbers (A12). **Pending:** the mobile sweep at 320 px, activated by a Playwright dev dependency (A26). **Extraction accuracy** stays pending, with the reason in its own commit (A02): no labelled receipts exist, the owner's cannot be committed, and invented ones would measure nothing about the real model. **Engine speed** stays pending, with the reason (A07): a wall-clock assertion is not deterministic in CI, so it is measured once and recorded instead.
- **CAPABILITY-MAP.md and docs/ROADMAP.md** (with this plan).
- **NOTICED-NOT-TOUCHING.md:** retire `read-receipt` once the helper is live; the Excel workbook and the Sankey still unbuilt; anything a slice sees outside itself.

---

## 13. The slices

**Rules for every slice** (CLAUDE.md, CONSTRAINTS.md and the orchestrator's rules; not repeated below):
- Before every commit, `./scripts/gates.sh full` prints `status=GREEN`, and the working tree holds exactly that commit's change. One logical change per commit, at most 300 changed lines excluding the lockfile and migrations; test and fixture lines count. Never weaken, skip or remove a gate, lower a threshold, or delete or skip a test.
- Formula decisions are written before the code. Engine tests are hand-derived, written first and seen failing; every test that is not golden is also seen to fail against a deliberate mutation, named in the commit body. No `toBeCloseTo`, snapshots or mocks in `packages/core`. The 121 golden tests do not change, and the total must not fall.
- Every new core function takes one plain input object with an explicit `asOf` and returns one plain output object. Screens format; they never compute.
- Every new screen is a lazy chunk. A commit that adds to the Month records the first-load size from `scripts/check-bundle.mjs` in its body.
- Screen tests are deterministic: they await what was asked for, never a timer. A flaky test is a race to find.
- Every screen change is looked at in the scratchpad preview harness at 320 and 390 px, with `scrollWidth <= innerWidth` checked, and at 1280 px.
- Each slice adds its Help article, or its part of one, in the same slice.
- The brand word appears nowhere: code, tests, fixtures, docs, file names or commit messages.
- Anything seen outside the slice goes into `NOTICED-NOT-TOUCHING.md`.

### A01: The plan and its records

**Owner items:** 1, 2, 3, 5, 6, 7, 8, 9 · **Depends on:** nothing · **Migrations:** none · **Commits:** docs only, each at most 300 lines; done with this plan and its review, so it is the one slice not held to about six
- **Goal:** this plan (`docs/ai-first-plan.md`), ADR 0004 and ADR 0005, CAPABILITY-MAP.md's new rows and arrows, and docs/ROADMAP.md saying this phase realises the coach and the reports.
- **Acceptance:** every choice labelled; ADR 0004 quotes the owner's approvals; the brand word nowhere; each commit at most 300 lines; gates GREEN.

### A02: Edge Functions under the gates, and receipts off a retiring model

**Owner items:** 2, 8, 10 · **Depends on:** A01 · **Migrations:** none · **Commits:** about 4 · **Why first:** `read-receipt` holds a provider key and no gate executes it today, and its default model is due to be shut down around 16 October 2026.
- **Build:** `supabase/functions` becomes a private workspace package, `@budget/functions` (zod at the version the web app already uses: no new dependency, said in the commit body). It gets a `tsconfig.json` with a small `deno-env.d.ts` (declaring `Deno.env.get` and `Deno.serve`) and a path alias from `npm:zod@4.6.5` to the workspace's zod, referenced from the root `tsconfig.json`; a vitest project `functions` with the same alias; `supabase/functions/**/index.ts` in the coverage include, held at 80/80/75; `supabase/functions` added to the `purity` gate's depcruise command in `gates.sh`, with allowed lines (the source imports zod alone; tests may import `vitest` and `packages/schema`); and an eslint block that allows `console` only inside each file's one `log(code, counts)` helper.
- **`read-receipt`** exports `handle(req, env, fetchFn)` and calls `Deno.serve` only when `Deno` exists. Its behaviour does not change, except `DEFAULT_MODEL` becomes `gemini-3.5-flash-lite` (re-verified at build; if that id cannot be confirmed, the confirmed Flash-Lite id). `docs/setup.md`'s `GEMINI_MODEL` example and ADR 0002 (a dated note) say so.
- **CONSTRAINTS.md:** the Enforced "Edge Functions" row; in its own commit, why Extraction accuracy stays pending (§12).
- **Tests:** `supabase/functions/test/read-receipt.test.ts`: a foreign origin, a missing bearer, a bad body and a bad `GEMINI_MODEL` refused; no key gives `not_configured`; 429, 404 and 5xx mapped; only the reply text passed on; the image, prompt and reply never logged; the file has no relative import, so it can still be pasted.
- **Acceptance:** each new gate is seen RED once (a type error, a lint error, a forbidden import, the tests deleted for coverage) and GREEN after; the outbound request is byte for byte as before apart from the model.

### A03: Last month beside this month, on the Month

**Owner items:** 7, 9 · **Depends on:** A01 · **Migrations:** none · **Commits:** about 4
- **Records first:** F24, F25, F26; D26.
- **Engine** (`packages/core/src/history.ts`, `compare.ts`): `historyStart`, `comparisonWindow`, `periodComparison` (per block and row: now, before, change, `changeBp` or none, direction, meaning).
- **Screens:** the Month reads last month's rows in the same range read; `MonthSummary`'s strip (§2.2); the **Left | vs Aug 1–24** switch on every block (remembered on this device, localStorage in try/catch); block total chips; "Last month (same days): $X" in `MonthCharges`. With the earlier window outside the records, the strip says what to import.
- **Tests:** `packages/core/test/compare.test.ts` (24 Sep against 1–24 Aug; 31 Mar against 1–28 Feb; a past month whole; a bill due on the 28th counted only from the 28th on both sides; before of $0 gives no percentage; 99 cents is "same"; a window before history start gives none); `apps/web/test/month-compare.test.tsx` (the strip names both figures; the switch swaps the column; a failed earlier read hides the strip and the Month still shows).
- **Acceptance:** every figure from `periodComparison`; no fourth column at 320 px; the golden tests untouched; first load recorded.
- **Changed while building (2026-09-24).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **Last month is read beside the month, not in the same range read.** The plan asked for both "in the same range read" and for "a failed earlier read" to hide the strip while the Month still shows; with one read, a failure takes the month with it, so both cannot hold. Last month's rows and where the records start are read in parallel with the month; if they fail, the summary card says so in one line and every block still shows.
  - **One switch for all six blocks,** above them, labelled "Last column: Left | vs 1 – 24 Aug", rather than a switch on each block: six switches that always move together read as six settings. A month already over reads "vs July"; with nothing to compare, the switch is not offered.
  - **Block chips show only a change of $1 or more,** as F27 says of chips, so a quiet list carries no "about the same" chip.
  - **A row with nothing this month but something last month** is not folded behind "Show N empty" while the change column shows.
  - **The strip's wording:** "By 24 Sep: $X spent · by 24 Aug: $Y", then "▼ $160.00 less (14%)". Before the records it reads "Your records start on 8 Aug. Import the statement before that to compare with August."
  - **Help:** no Help section exists yet, so the "Comparisons with last month" article is left to A06, which already lists it.

### A04: Comparisons on the Week, Paycheck, Year, Savings and Debts

**Owner items:** 7 · **Depends on:** A03 · **Migrations:** none · **Commits:** about 3
- **Screens:** Week against last week to the same weekday; Paycheck against the previous period by day offset; Year against the twelve months before, and "vs last year" on its glance cards, only inside the records; Savings, saved this month against last; Debts, the schedule's balance against a month ago.
- **Tests:** one screen test each, including a Year whose earlier window lies before the records (no comparison).
- **Acceptance:** all figures from core; each screen's earlier read failing hides only its comparison.
- **Changed while building (2026-09-24).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **Core did change,** although the slice listed no engine work: "all figures from core" needed `comparisonWindow` and `periodComparison` to take a week, a pay period and a Year, and a new `debtBalanceChange` for Debts. F25 records each rule before its code. `periodComparison` no longer takes budgets, which it never read.
  - **A Year still running is set against the same days a year earlier,** not the whole twelve months before, as the month is (F25). The owner's records start on 8 August 2026, so today the Year's card says what to import and shows no figure.
  - **"vs last year" is one glance card** with Income, Spent and Saved, rather than a line on each card: the other cards (biggest expense, top 3, best savings month, balances) count the Year's whole months, and a same-days figure beside each would read as their change.
  - **Savings reads last month and this month to today in one read,** beside the funds, and shows a "Saved this month" card as well as a line on each fund.
  - **Debts has no earlier read:** a month ago comes from the same schedule, so "an earlier read failing" cannot happen there; a debt never paid off has no schedule and no line.
  - **Help:** as in A03, no Help section exists yet; A06's "Comparisons with last month" article covers these screens.

### A05: Navigation for an AI-first app, and the Coach's flight card

**Owner items:** 2, 8, 9 · **Depends on:** A01 · **Migrations:** none · **Commits:** about 4
- **Records first:** ADR 0006 (the bars, the switch, More's groups, the addresses; Month still opens first; the owner will notice Week moving).
- **Build:** `nav.ts`'s `period` becomes a `param` (a month, a day or a help topic id, per screen), with the new screens of §2.1; the phone bar Month · Coach · Add · Review · More; the wide bar of §2.1; the **Month · Week · Pay · Year** switch on those four screens; More in its four groups; `#/week` and `#/week/<Monday>` both open the Week.
- **Coach screen** (lazy), first version: the flight card from existing core only (`goalProgress`, `timeEquivalent`): the ring, "46 h of 109 h", saved of target. The rest of the Coach arrives in A07 and A08.
- **Tests:** the existing `apps/web/test/nav.test.tsx`, extended (every new address, a bad topic, a bad param, a third segment); the shell's bars at phone and wide widths; the switch on each of the four screens; More's groups; the flight card from the fake database.
- **Acceptance:** Month opens first; Week is one tap from the Month; 320 px has no sideways scroll; first load recorded.
- **Changed while building (2026-09-24).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **Screens not built yet stay off the bars and More,** in their planned places, and show as their slices land; their addresses already read and open one line ("Forecast is on its way. Everything else works as before.") with a link to the Month. So the wide bar is Month · Week · Coach · Savings · Debts · Review · Add · More until A13 and A15, and More shows three groups until Reports gives Understand its first item. The full lists are committed (`DESKTOP_TABS`, `MORE_GROUPS`), and one set in `nav.ts` says what is built.
  - **The switch sits above each title band, not under it,** so the Paycheck shows it while its schedule loads, fails or is missing. Each segment opens that view's own default (this month, this week, this pay period, this year): a month has no one week or pay period to carry across.
  - **A view reached through the switch lights the Month tab on a phone** (it has no tab of its own there), not More.
  - **The Week's arrows now write its Monday into the address** (N46's open point), and a bare `#/week` means this week, so it is written back when the arrows return to this week.
  - **`#/coach/checkin` opens a one-line not-yet screen** until A20.
  - **The flight card's saved amount** is the goal fund's balance when the goal is a fund's (D16), as on the Week and Savings, through one shared helper (`goalSavedCents`). Its hours are `timeEquivalent(...).hours` of the saved amount and of the target, the rule F33 writes down for A08.
  - **The test file is `apps/web/test/nav.test.tsx`,** the name it already had, not `nav.test.ts`.
  - **First load:** 185.13 KB gzipped before the slice, 187.03 KB after (the switch and the Bill calendar button are on the Month; the Coach is its own chunk).
  - **Help:** no Help section exists yet; A06's "Month, Week, Pay and Year" article covers the switch and the Week's move.

### A06: Help, the ? on every screen, and One-time updates

**Owner items:** 5, 8, 9 · **Depends on:** A05 · **Migrations:** none · **Commits:** about 5
- **Build:** `apps/web/src/help/articles.ts` with the pattern of §8.2 and the articles for everything built so far (Start here, One-time updates, Month · Week · Pay · Year, Bring in a statement, Review, Add, Budgets and bills, Savings and your flight goal, Debts, Comparisons with last month, Why does a number look wrong?, Messages with a code in brackets, Put it on your iPhone, Words the app uses); `#/help` and `#/help/<topic>` (lazy) with search; the ? sheet on every screen, with **Show me** (Ask about this arrives in A24).
- **One-time updates:** the live probes of §8.2 for 0005–0014 (0015 on join as their slices land), ✓ and ✗, the next step, **Check again**.
- **Tests:** every article has the full pattern; search; an unknown topic opens the index; a markup string in an article shows as text; each probe state from the fake (PGRST205, 42P01, PGRST202, all present).
- **Acceptance:** every screen has an article, reached from its **?**; plain language, one action per step, each with "You're done when…" and "Stuck?"; articles render as text, never markup; each probe state (table missing, function missing, all present) shows its own line and next step.

- **Changed while building (2026-09-24).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **The screen each article belongs to is `SCREEN_HELP`** (`apps/web/src/help/screen-help.ts`), not a field on the article, so the ? carries no article text into the first load; a test holds every built screen to a written article. Month, Week, Pay and Year share one article; the Bill calendar and Settings open Budgets and bills; More and Setup open Start here; All transactions opens "Why does a number look wrong?". The Coach has its own article, for what it does today, although the slice's list left it out, since every screen needs one.
  - **"An unknown topic opens the index"** means a committed topic whose article is not written yet (such as `forecast`): it opens the list with a line saying so. An address that is not a committed topic still opens the Month, as ADR 0006 says.
  - **The codes and words articles carry a list of terms** beside their steps (an optional `terms` field), since a glossary is read by looking a word up.
  - **The ? sits with the header's buttons on the Month and the Bill calendar,** as §2.2's sketch draws it: beside their large script title it broke "September 2026" onto two lines at 320 px. Everywhere else it is beside the title.
  - **The probes check columns too.** 0005, 0007 and 0013 add columns, not tables or functions, so each is proven by reading its column (42703 means missing). A function is called with the nil id, which 0006's and 0012's functions refuse as not found before writing, so no check changes anything. Any other answer, a dropped connection included, is "could not check", never "missing".
  - **Help opens even when the app's first read failed,** and that failure's alert links to One-time updates: the first read needs 0005 among others, so without this a missing update left the owner nowhere to learn why.
  - **The next file links to GitHub** (`aaronjoseph94/budget-app`, branch `main`), since the Copy buttons carry only 0015 on (A09).
  - **First load:** 187.44 KB gzipped before the slice, 187.75 KB after (the ? on the Month; the sheet and the articles load when it is pressed).

### A07: Coach cards in the app's own words

**Owner items:** 2, 7, 9 · **Depends on:** A03, A05, A06 · **Migrations:** none · **Commits:** about 6
- **Records first:** F27, F28, F44; D27 (the coach line); CONSTRAINTS' Engine speed reason (§12).
- **`packages/savings-coach`,** created in its own configuration commit: package, tsconfig reference, vitest project, coverage 80/80/75, depcruise allowed lines (it may import core's values, and schema and money-primitives as types only; the app may import it), and an eslint purity block like chart-specs' (no clock, randomness, DOM, zod, `crypto` or `@supabase`).
- **Engine** (`packages/core`): `stats.ts` (`median`, `quantile` by nearest rank, `mad`, on integers), `usualMonth` and `notableBand` (F27), `categoryPace` (F28), `factsDigest` version 1 (the summary comparisons, category changes, over or near budget, budget pace, stale data, rows waiting in Review), `impactScore` (F44), `dailyIndex`.
- **savings-coach:** `templates.ts` (a template per kind of fact, Cheerleader and Straight talker, every watch template carrying one thing to try), `segments.ts` (`renderSegments`: text into `{text}` and `{fact, slot}` parts, never markup), `rank.ts` (at most 3 cards, one per category, at most 2 "watch", a win when there is one, stale data first, dismissed causes left out).
- **Screens:** the Coach gains the day's line and up to three cards, each with its action and **Why am I seeing this?** (a sheet listing the engine figures). ✕ is hidden until A17, which stores dismissals in 0017's `insight_dismissals`. The Month gains the coach line: a lazy strip inside an error boundary, drawn after the Month, built from the two months the Month already reads (§2.2). The Coach loads up to 13 months itself, off the Month's path.
- **Tests:** `packages/core/test/stats.test.ts`, `notable.test.ts`, `pace.test.ts`, `digest.test.ts` (stable ids, kinds, at most 12 facts, no UUID in any label); `packages/savings-coach/test/templates.test.ts` (with its blanks removed, no template holds a digit, a currency or percent sign, a number word other than "one", or markup: ADR 0005 §4's rules 1–5, checked by the test itself, because `ModelProse` arrives in A12), `segments.test.ts` (`<img …>` stays text; an unknown blank is refused), `rank.test.ts`; `apps/web/test/coach-cards.test.tsx`; a Month test where the digest throws, and the Month still shows.
- **Acceptance:** the Coach is fully useful with no migration, no helper and no key; figures from core only; first load recorded, the strip outside it.
- **Changed while building (2026-09-24).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **Complete months need what was read, too.** `completeMonths` (core, `history.ts`) takes a `readFrom` as well as history start, so the Month, which reads only last month, never takes eleven unread months for eleven empty ones. The digest takes the same `readFrom`.
  - **The summaries' evidence is thin by definition.** They compare two windows with no baseline, so the Month (reading two months) and the Coach (reading thirteen) make the very same summary facts, and the same line.
  - **Digest version 1 speaks of Variable expenses only.** A change on Bills, Debts or Subscriptions is a bill moving, not a habit; the price-rise detector (F38, A17) will say it.
  - **Budget facts' evidence:** over and near are *solid* (a charge against the owner's own number); a pace is *some* (an estimate). F28 and F44 say so, and set near at 90% of the budget and the notable lines for over ($1.00) and pace (max($25, 15% of the budget)).
  - **Figures:** a change is its own unit, `change`, carrying the engine's direction word, and every fact also offers the slot `name`, drawn from its subject's label; a label is a name, never an id.
  - **The stats helpers** (`median`, `quantile`, `mad`) take one input object, as every core function does, and return the number itself (or none), rather than an object holding one number.
  - **A win in the last place gives way to stale data and Review:** when those two hold two of the three places, the biggest thing to watch keeps the one left, since a win cannot outweigh the only warning.
  - **Actions in version 1** are Import a statement, Open Review and See the Month. Set a budget, Open goal and Add it as a bill arrive with the facts that need them (A08, A17). The Month opens on its own month; a card cannot yet open one row's charges, which the Month keeps in screen state.
  - **The tone is Cheerleader** until AI settings can store a choice (A11, 0016). Both tones' templates are written and tested.
  - **The status line reads "In the app's own words, from your records."** rather than "turn on free AI (2 minutes)", because AI settings is not built yet (A09, A10); a line pointing at nothing would leave the owner lost.
  - **Helpers not named in the plan:** `evidenceOf`, `changeSize`, `budgetStanding` (core); `cardWords`, `dayLine` and `slotsOf` (savings-coach); `ErrorBoundary` (app). Extra tests: `packages/core/test/impact.test.ts`, `packages/savings-coach/test/line.test.ts`, and `apps/web/test/month-coach-line.test.tsx`, which holds the Month's throwing-digest test.
  - **The Month's line** shows only on this month, since it speaks of today, and sits under the Review banner, above the statement line and the summary. It carries no ✨, being the app's own words.
  - **Engine speed,** measured once (CONSTRAINTS.md): the Month's recompute over 5,000 transactions 2.4 ms; the digest 9.1 ms.
  - **First load:** 187.75 KB gzipped before the slice, 188.22 KB after (the line's loader and the error boundary, and `completeMonths` in a module the Month already loads); the line and the Coach are their own chunks.
  - **Help:** the Coach's article now covers the line, the cards and "Why am I seeing this?".

### G1: Savings goals, plural: add, choose a main goal, reorder, pause and finish

**Owner items:** 2, 3, 5, 8, and the owner's later request of 2026-09-24 ("I also want the ability to add other goals for saving not just flight... make sure to add that") · **Depends on:** A07 · **Migrations:** `0015_savings_goals_order.sql` · **Commits:** about 6
- **Why:** `savings_goals` already allows many goals (0004, a unique name) and 0013 links each to a Savings-list fund, but the app treats one goal as *the* goal: Settings edits one (`getGoal`, `saveGoal`), and the Coach's flight card, the Week's goal card and `app-data` load one. There is no obvious way to add another.
- **Records first:** F45 (the order, the main goal, paused and reached, progress in hours or dollars); D28 (Savings in the owner's order, one main goal).
- **Migration:** 0015 as §10.1, with schema assertions for each refusal, and its probe on One-time updates. Fail soft: with 0015 missing, adding, editing and showing goals work as today, and only choosing a main goal, reordering, pausing and marking reached say "needs a one-time update".
- **Engine** (`packages/core/src/goals.ts`): `orderGoals` (active in order, the main goal first; paused; reached), `moveGoal` (up, down, or first among the active goals), `goalsProgress` (every goal's saved, remaining, bar and hours, from goal.ts, the fund balances of D16 and F17's rounding). Nothing flight-specific in a name; each takes a list, so the digest (A08) and the forecasts (A13, A14) can take every goal.
- **Screens:** Savings: **Add a goal** (a bottom sheet, 390 px first: name, target, target date and saved so far optional, and **Show progress in** dollars or hours with their cost), which makes the Savings-list fund and the goal together, or uses a Savings fund of that name, so recorded transfers count; each goal's card with **Make main goal**, **Move up**, **Move down**, **Pause** or **Resume**, **Mark as reached** (a small celebration line, no motion), **Edit** and **Remove** (only when nothing would be lost, otherwise it says why); reached and paused goals in a folded **Reached and paused** group. Coach: the hero card is the main goal (hours when it has a cost per hour), with the other active goals listed under it. Week: the main goal, and "N other goals" linking to Savings. Settings: **Your savings goals**, linking to Savings. `app-data` reads every goal once and gives the list and the main goal. Help: "Add a savings goal", and every article that said "the goal".
- **Tests:** `packages/core/test/goals.test.ts` (order, main goal, moves, progress), seen failing first; `apps/web/test/savings-goals.test.tsx` (add makes the fund and the goal; make main; reorder; pause; reached; remove refused; 42703 on 0015's columns); the Coach's list; the Week's link; the owner's one existing goal shown unchanged; 320 px with no sideways scroll.
- **Acceptance:** a second and third goal can be added from Savings in one sheet each, and their transfers count; exactly one main goal drives the Coach's hero card and the Week's card; nothing about the existing flight-training goal changes; a missing 0015 fails soft to today's behaviour; every figure from core; 320 px clean.
- **Later slices build on it:** A08's flight date, levers and milestones, A13's savings still planned and A14's what-ifs take the goals from `orderGoals` and their progress from `goalsProgress`, the main goal where one goal is shown. A25's step 5 says "your goals".
- **Changed while building (2026-09-24).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **Two reads of the goals, joined by id.** `app-data` reads every goal with 0015's columns, falling back to 0004's when they are missing, so the first load never needs 0013 or 0015; Savings' funds read (`listFunds`, 0013's columns, and the transfers) stays its own, as before. A goal the shared load has and the funds read has not caught up with shows "loading…" for a moment.
  - **A goal on no fund gets a card of its own,** labelled apart from a fund of the same name, with Edit (the fund editor, writing nothing that links it) and **Make it a fund**, which makes or uses the Savings fund of its name and links it as of today. Settings' form was the only editor for such a goal, so this came before Settings changed; the plan had not listed it.
  - **Core's `savingsFunds` gives a goal on no fund a fund's figures** (its typed amount, nothing moved in), so every card draws the same way.
  - **A goal added with a target date starts that day** (F45), so its card shows the months left and a month's share rather than "no dates yet"; with no date it has no start date, as D15.
  - **Set a goal on a fund with no goal keeps its editor,** with the workbook's start date, rather than opening Add a goal; Add a goal uses a Savings fund of the same name when it has no goal.
  - **The main goal is marked only when there are two or more active goals.** A paused goal says "Paused" and a reached one "Reached" with its day. The goal's actions sit on two lines: edit, make main and the arrows; then pause, reached and remove. Resume puts a goal after every other, never back in the main place.
  - **Remove leaves the goal's fund,** and everything filed under it, on the Savings list; the notice says Setup removes the fund. It needs no 0015, so it is offered before it.
  - **A dollar goal shows a piggy bank** on the Coach and the Week, and a goal with a cost an hour the plane.
  - **Before 0013,** which the owner has pasted, a goal can no longer be added or edited anywhere: Settings' old form was the only screen that worked without it (N72).
  - **Help's new topic id is `goals`,** after `savings`. The article "Savings and your flight goal" is now "Savings and your goals".
  - **Tests:** `packages/core/test/goals.test.ts`, `apps/web/test/goals-read.test.tsx` and `apps/web/test/savings-goals.test.tsx` are new; the Coach, Week, Settings, Help and One-time updates tests gained cases. The 42703 fail-soft is covered on the shared load, Savings and adding a goal.
  - **Commits:** 22 rather than about 6, to keep each within 300 lines, with two that keep the first load small: goal progress in its own core module, and the goals' writes in `goal-writes.ts`.
  - **First load:** 188.23 KB gzipped before the slice, 188.94 KB after (the goals' read and core's `orderGoals` in the shared load); it reached 190.32 KB until goal progress and the goals' writes moved out of the modules the first load carries. Savings, the sheet and the Coach are their own chunks.

### A08: What to cut, when you'll fly, and a quote that fits

**Owner items:** 2, 3 · **Depends on:** A07 · **Migrations:** none · **Commits:** about 4
- **Records first:** F33, F34.
- **Engine:** `goalForecast` (F33, the date range and the weekly amount needed), `goalMilestones`, `goalLevers` (F34), and win facts (saved more than last month, a milestone) in the digest.
- **savings-coach:** `library.ts` with the entries of §4, each re-verified at commit with its `sourceUrls`, and `pickQuote(tags, asOf, recentIds)`.
- **Screens:** the Coach's flight card gains the date range with its evidence chip, the top lever and **What if…** (to Forecast from A14; until then, to the Savings screen); the quote card; the Savings flight card's lever line; each Variable charge in a row's sheet shows its flying time.
- **Tests:** `packages/core/test/goal-forecast.test.ts` (under 3 months gives one rough date; all zero gives "no date" and a lever), `levers.test.ts` (a worked example of weeks sooner; the best-month lever needs 500 cents), `packages/savings-coach/test/library.test.ts` (ids unique, lowercase and digit-free; every `wrote` or `said` has a title and year; every `often_attributed` has a note; at least one https source; text at most 400 characters; tags from the set), `pick-quote.test.ts`.
- **Acceptance:** the quote's text and author always come from the library; an entry that could not be verified is not in it.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **Every active goal, not the flight goal alone** (G1). `goalForecast`, `goalMilestones` and `goalLevers` each take one goal and are run for every active goal. The Coach's hero card is the main goal's, titled by its own name, with its date range, evidence chip, top lever and **What if…**; each other goal's row has its date in a few words; each active goal's Savings card has its lever line. Hours only where a goal has a cost an hour, in its own unit's words ("of flight time"); a milestone for a dollar goal is every tenth of its target (F33).
  - **A charge's "flying time" is "= 14 min toward Flight training"**: the main goal's time, named by the goal, only on Variable expenses and only when the main goal has a cost an hour. A refund or a charge under half a minute says nothing (D29).
  - **The pace is the fund's Savings Actual month by month** (`monthActuals`, shared with the digest), so it counts a month exactly as the Month does. The median is F27's; p25 and p75 are by nearest rank. A goal on no fund has no pace and says "Make it a fund".
  - **What the plan left open, decided:** a lever that brings the date no sooner is not offered; the best month is offered only where the quarter rounds to $0; when every date of a range falls in one month it reads "about Jul 2029" with no "Most likely"; a target date adds "To reach it by …: $X a week".
  - **Wins join digest version 1,** not a version 2: nothing reads the version until A12, and A17 keeps version 2 for its detectors. Saved more is a card only when more was saved (a coach does not scold); a milestone is worth one step of its goal, solid, so a cheer that comes every few months ranks just after stale data and Review. Both cards' action is **See your goals**, and "Why am I seeing this?" names their figures and reasons.
  - **The library was checked by search, not by fetching.** Direct fetches of every source site are blocked from the build container, so each entry was checked by a web search restricted to a site holding or documenting the source, and `sourceUrls` holds the pages found. Left out, not verified that way: Johnson's "Resolve not to be poor", Sethi's "spend extravagantly", "Big Hat, No Cattle" and "spend what is left after saving" (found only on quotation sites; the last also has no documented misattribution to cite). The "pay the smallest debt first" tip is left out as advice on the snowball-or-avalanche choice Debts leaves to the owner. A chapter is named only where the page named one. Tips are the app's wording of a named source's advice; a web page's year is the year it was checked. Corrected in review before the first push: Quillen's line is from his column "Paragraphs" in The Detroit Free Press (4 June 1928), as Quote Investigator gives it; and Hamlet's "…nor a lender be" is dated 1623, the First Folio, whose wording it is (the 1603 quarto calls Polonius Corambis, and the 1604 one reads "boy").
  - **The fortnight is a hard rule, the tags a preference:** when every matching entry was shown lately, something fresh that matches nothing is offered rather than a repeat; only when the whole library was shown does the round start again. Today's own pick is not "shown before", so it holds all day. The ids and days are kept on the device (`budget.coach.quotes`, in try/catch).
  - **What if…** opens Savings until A14, as planned.
  - **Fail soft.** This slice adds no migration and no helper. A goal's date needs 0013's columns (the funds read); when they are missing the hero card says "When you will get there needs a one-time update. See One-time updates" and every other part of the Coach shows. `readAll` now throws `ReadRefused` with the database's code so the app can tell a missing update from a lost connection. With 0015 missing, the date shows as before.
  - **Savings reads the year the Coach reads** (`useCoachRead`), for the pace and the levers; if it fails, every card still shows, with no lever line.
  - **Tests:** as planned, plus `packages/core/test/month-actuals.test.ts`, `apps/web/test/coach-quote.test.tsx` and `apps/web/test/savings-lever.test.tsx`; the digest, rank, templates, Coach, Month charges, funds, format and Help tests gained cases. Commits: 24 rather than about 4, each within 300 lines.
  - **First load:** 188.98 KB gzipped before the Month's charge line, 189.87 KB at the end of the slice (the charge line's `timeEquivalent` and minutes formatter, and `ReadRefused`). The Coach and Savings are their own chunks, and the quote card and the library are in the Coach's, so none of them is in the first load.
  - **Seen in the preview harness** (copied from `preview-g1`, the newest), at 320, 390 and 1280 px, light and dark, with no sideways scroll and no console errors: the one-month range and the win cards' "Why am I seeing this?" were fixed from it.

### A09: The AI helper, installed

**Owner items:** 2, 5, 8 · **Depends on:** A02, A06 · **Migrations:** `0016_ai_foundation.sql` · **Commits:** about 6
- **Records first:** ADR 0007 (one-time updates copied from inside the app).
- **Migration:** 0016 as §10.1, with `local-stub.sql`'s `service_role` and the schema gate's assertions, each seen failing once. The function bodies A10 and A11 need land here, as SQL, with their assertions.
- **Helper** (`supabase/functions/ai/index.ts`): the env parse, CORS and origins, identity from `/auth/v1/user`, the database helper (the root in `apikey`, and as a bearer only when it is a legacy JWT), `ping`, and `status` (sources, hints and statuses; `needs_update` when 0016 is missing). `packages/schema` gains `AiProvider` and the request union's types, and a contract test holds the helper's zod request schema to them.
- **App:** `apps/web/src/ai/client.ts` maps every failure to a state (`not_deployed` for a 404, `unreachable`, `needs_update`, `not_set_up`, `off`, `limit_reached`, `all_resting`, `all_failed`), each with a sentence and a link. `apps/web/test/fake-supabase.ts` answers `functions/v1/ai`. `#/ai` (lazy) shows the status sentence, or "The AI helper isn't installed yet → One-time updates".
- **One-time updates** gains the 0016 and helper probes, and the **Copy** buttons with the `setup-files.ts` Vite plugin.
- **Guards:** a static test that no provider API host (`generativelanguage.googleapis.com`, `api.groq.com`, `openrouter.ai/api`, `api.openai.com`, `api.anthropic.com`) and no `SERVICE_ROLE` appears in `apps/web/src`, and that the built JavaScript holds neither (`/setup/` files excluded, since they are the helper's source); `apps/web/test/headers.test.ts` already holds `connect-src` to `'self'` and the Supabase project (SEC-1), and this slice leaves it so: the helper is reached on the project's own address. CONSTRAINTS.md's Enforced "browser holds no provider host or service key" row.
- **Tests:** `supabase/functions/test/ai-identity.test.ts` (no bearer gives 401; a forged `user_id` in the body is ignored; an `sb_secret_` root never sent as a bearer; a legacy JWT root sent as both); `ai-status.test.ts` (the Gemini secret shows as `secret`; no ciphertext in any reply); `apps/web/test/ai-client.test.ts` (each state); `ai-settings.test.tsx` (not installed; 0016 missing); `setup-files.test.ts` (served bytes equal the committed file; nothing outside the list served).
- **Acceptance:** AI settings shows a true status in every state; the rest of the app is unaffected in every state.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **The migration is `0016_ai_foundation.sql`,** since G1 took 0015. `ai_usage_claim` returns why it refused (`daily_cap`, `task_cap`, `service_cap`) or `ok`, takes the task's and the service's limits from the helper (none for a paid service), and holds a per-user transaction lock while it counts, since the day's total spans rows. `ai_note_outcome` never rests a service more than 25 hours. Each helper-side assertion was seen RED by a mutation of 0016 (22 in all); the lock cannot be raced from one session and is left to its comment.
  - **A body with a `user_id` is refused, not ignored:** the request schema is `.strict()`, so no field beyond the action gets in, and nothing is asked of anyone.
  - **The helper reaches the database with the new `sb_secret_` key first,** from `SUPABASE_SECRET_KEYS.default`, then the legacy `SUPABASE_SERVICE_ROLE_KEY`, because a project can switch its legacy keys off. §3.4's order still stands for encryption (A10).
  - **`AiRequest` holds only `ping` and `status`;** each later action is added with its handler, and `ai-contract.test.ts` holds the two in tsc and at run time. The codes gain `method_not_allowed` and `helper_error` (a missing secret, or a database answer other than "not there yet").
  - **`status` shows the Gemini secret's last four characters** as a pasted key's are shown, and the helper's Gemini model follows `GEMINI_MODEL` when the owner chose none and it is on the list.
  - **The app narrows the helper's replies by hand,** not with zod, which CLAUDE.md keeps to four boundaries; the helper is the app's own code, not a model.
  - **AI settings, first version:** the sentence, the five services with where each key comes from, and "Today: N of 40 AI calls". "Turn on free AI (2 minutes)" reads "in a few minutes" until A10 lets the key be pasted in the app, and the new "Turn on free AI" article says how to turn it on today (the receipts secret).
  - **One-time updates** proves 0016 by calling `ai_key_status` (it only reads) and the helper by `ping` (Supabase's own 404 is "not in"; any other failure "could not check"). The helper's step gives the Edge Functions clicks. **Copy** offers a file only when its first line is its own name, so the site's own page is never offered as an update; a refused clipboard shows the text to select.
  - **The static guard is `SERVICE_ROLE` in capitals** and the five hosts, in `apps/web/src` (`no-provider-hosts.test.ts`) and the built JavaScript (`scripts/check-bundle.mjs`). Lowercase `service_role` stays: sign-in warns never to paste that key. `sb_secret_` is not guarded in the build, because supabase-js itself carries the string.
  - **First load:** 189.50 KB gzipped with AI settings in, 189.51 KB at the end; AI settings is its own chunk and the Copy button is in Help's.
  - **Seen in the preview harness** (copied from `preview-a08`) at 320, 390 and 1280 px, light and dark, with no sideways scroll and no console errors: AI on, not set up, not installed, 0016 missing, and One-time updates with 0016 and the helper next.

### A10: Paste a free Gemini key

**Owner items:** 2, 5 · **Depends on:** A09 · **Migrations:** none · **Commits:** about 4
- **Helper:** the allowlist constant with the Gemini entries; the Gemini adapter; encryption (§3.4) with `kek_id` and the `locked` state; `save_key`, `test_key` (also **Check which models work**) and `forget_key`.
- **Screen:** the free Gemini card's three steps (§8.3), **Remove key**, "Already on" when the secret works, and the model choice from the listed models the key can use.
- **Tests:** `supabase/functions/test/ai-crypto.test.ts` (round trip; another user's or service's additional data fails; the `kek_id` picks the right root; a changed root gives `locked`, not an error), `ai-keys.test.ts` (a rejected key is not stored; a busy one is; the key appears in no response or log; a model not on the list falls back; a listed model the service does not offer is shown unavailable), `apps/web/test/ai-settings-gemini.test.tsx` (the field is empty after sending and no key text is anywhere in the DOM; each result sentence). Test keys are obviously fake (`test-not-a-real-key-0001`), so gitleaks stays green without an allowlist.
- **Acceptance:** the whole flow works against the fake; the key round-trips and is never readable back.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **No migration, as planned:** 0016 (A09) already holds `ai_key_put`, `ai_key_mark`, `ai_key_status` and `ai_key_forget`, so this slice adds none.
  - **Remove key is 0016's `ai_key_forget`, called by the browser, not a helper `forget_key` action.** 0016 gives the helper no function that deletes a key, and the browser's own one deletes only the caller's key; a helper action would have needed a new migration for nothing.
  - **Only Gemini takes a pasted key so far.** `save_key` and `test_key` take `provider: 'gemini'`; the other services join with their adapters (A11), so no request promises what nothing answers.
  - **A key's shape** (20–200 of `[A-Za-z0-9_.:-]`) is one rule, `AI_KEY_SHAPE` in `packages/schema`, which the app checks before sending (a paste with spaces around it is trimmed) and a contract test holds the helper's zod to.
  - **What counts as busy:** Google's 429, a 5xx, any 400 other than `API_KEY_INVALID`, a timeout or no route; each keeps the key, marked busy. A 401, a 403 and a 400 with `API_KEY_INVALID` are rejected, and a rejected key is never stored.
  - **Thinking is `thinkingLevel: "minimal"`** on every Gemini model on the list: Google documents it as the lowest level, and the default, for the 3.x Flash-Lite models (found by search; Google's pages cannot be fetched from here). It is not confirmed for `gemini-3.5-flash`; a refusal there would be a 400, a service error, and the next service is tried (A11). A reply counts only when `finishReason` is `STOP`, which is stricter than MAX_TOKENS and SAFETY alone.
  - **The model choice** is kept in `ai_settings.models` (the browser's own row), not the key's row, so the secret's model can be chosen too; the key row's `model` stays empty. It is offered after **Save & test** or **Check which models work**, from their answer, because `status` does not carry the listed models; a committed model the key cannot use is shown and cannot be chosen.
  - **With a key in, the three steps fold** under "Paste a different key", so what the owner comes back for (Check which models work, Remove key, the model) is first. Step 1 is a bordered "Get a free key ↗".
  - **The field is uncontrolled:** the key is read from the form only when sent and the field emptied at once, so it never sits in React state.
  - **N78 settled here:** the helper's version is `AI_HELPER_VERSION` in `packages/schema`, and One-time updates asks for an older copy to be replaced.
  - **Tests:** as planned, plus `supabase/functions/test/ai-adapters.test.ts` (Gemini's request, reply and list; A11 adds the others to it) and `apps/web/test/ai-keys.test.ts` (the app's sentences).
  - **Seen in the preview harness** (copied from `preview-a09`) at 320, 390 and 1280 px, light and dark: no key, a key pasted and checked, the receipts key already on, and a saved key; no sideways scroll, inputs at 16 px, no console errors, and the key nowhere in the page after sending.

### A11: More services, failover and a daily limit

**Owner items:** 2 · **Depends on:** A10 · **Migrations:** none · **Commits:** about 6
- **Helper:** the OpenAI-compatible and Anthropic adapters (§3.3, each re-checked against its provider's current reference at build); the `run` action with the `test` task; the router: the owner's order, paid services only with **Use paid services** on, rested services skipped, `ai_usage_claim` before every attempt, token estimates and per-request budgets, 20 s attempts (30 s for a receipt) inside a 100 s deadline, at most 3 attempts, cooldowns written by `ai_note_outcome` (§3.5), and `all_resting` or `all_failed` with the list of what was tried.
- **Screen:** the other four services' cards, **Try in this order**, **Use paid services**, **Daily limit** and "Today: N of 40"; coach tone (**Cheerleader** or **Straight talker**, which the app's own templates follow from then on) and **Share shop names with the AI**, both kept in `ai_settings` (0016; with it missing, Cheerleader and sharing on).
- **Tests:** `ai-adapters.test.ts` (each request's exact URL, headers and body: the schema's place, no `temperature` where refused, `effort` only on `claude-sonnet-5`); `ai-router.test.ts` (a 429 then success on the next; a 401 marks the key and moves on; a timeout, made with a fetch that never resolves and an abort, never a longer timeout; the deadline stops a third attempt that would not fit; a paid service skipped with the switch off; the limit reached gives `limit_reached` with no call made; a daily-quota 429 rests Gemini until midnight Pacific; a payload over Groq's budget skips Groq); an AI settings test for order, paid, limit, tone and sharing.
- **Acceptance:** no URL is built from anything but the constants; every attempt is counted.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **No migration, as planned:** 0016 (A09) already holds `ai_usage_claim`, `ai_note_outcome` and `ai_key_mark`; the owner's order, paid switch and limit are its `ai_settings` columns, which the browser writes itself.
  - **Every service takes a pasted key.** Each key test spends no quota: Groq's, OpenAI's and Anthropic's model lists, and OpenRouter's key record (`/api/v1/key`), since its free router is one name. Anthropic lists an alias under its dated id (`claude-haiku-4-5-20251001`), which counts for the alias. The Gemini secret stands in for Gemini alone.
  - **No service is sent a temperature (N79 settled).** gpt-5 and Claude Sonnet 5 refuse one, and Google and OpenAI advise the default for Gemini 3 and gpt-oss; the reply's schema and zod steady it instead. Every object in a task's schema is closed (`additionalProperties: false`), as OpenAI's strict mode and Anthropic require, and Gemini now takes the same schema as `responseJsonSchema` rather than the OpenAPI-style `responseSchema`.
  - **Room for thinking:** OpenAI gets the reply's tokens plus 4,000; Groq and OpenRouter plus 2,000 (gpt-oss reasons); Claude Sonnet 5 at least 4,000, with `effort: "low"`; Haiku 4.5 sends no effort, which Anthropic documents it does not support. OpenRouter takes `max_tokens`, Groq and OpenAI `max_completion_tokens`. Checked against Anthropic's reference on 2026-09-25; OpenAI's, Groq's and OpenRouter's pages cannot be fetched from here, so theirs were checked by search.
  - **Tokens are counted on the request actually built** for each service (its body's UTF-8 bytes ÷ 3), so Groq's budget sees the schema written into its prompt.
  - **A rest:** Retry-After (seconds or a date), else Google's RetryInfo delay, else 60 s; a Gemini quota id naming `PerDay` rests until midnight Pacific; a 404 rests that model 25 hours, the longest 0016 allows, rather than "until Check which models work", which would have needed a migration to clear a rest; choosing another model is immediate, since rests are per model. A rejected secret is not rested: it costs one claim a request until it is fixed.
  - **A stored order that leaves a service out** is followed by the rest in their usual order, in the helper and on the screen alike.
  - **`run` takes only the `test` task,** and the app sends it nothing yet; each later task joins with its slice (A12 on). The router is exported as `route` so a test can hand it an oversized request for Groq's budget.
  - **Coach tone and Share shop names move to A12,** where the first things that follow them arrive (the brief and the Coach's words); a switch that nothing obeys would promise what the app does not do. 0016 already holds both columns.
  - **Screens:** the four cards sit folded under "More AI services: Groq, OpenRouter, and paid ones", below Gemini's, so Gemini alone stays the obvious step. "AI services, in the order they are tried" became **Try in this order**, with the key line kept on each row. The daily limit is a list of steps (10, 20, 30, 40, 50, 60, 80, 100, 120, 150), plus any other saved value. The helper's version moved once, to `2026-09-25.3`, for the whole slice: nothing between was pushed.
  - **Help:** "More AI services, paid ones too" and "Why the AI sometimes rests" are written.
  - **Tests:** as planned, plus `ai-limits.test.ts` (limits, the token estimate, rests and midnight Pacific), `apps/web/test/ai-choices.test.ts`, `ai-settings-choices.test.tsx` and `ai-settings-services.test.tsx`. The router's clock tests wait for each call to be made before moving the fake clock, since opening a saved key is WebCrypto, which fake timers do not drive.
  - **Commits:** 15 rather than about 6, each within 300 lines.
  - **First load:** 189.55 KB gzipped; AI settings is its own chunk.
  - **Seen in the preview harness** (copied from `preview-a10`) at 320, 390 and 1280 px, light and dark: no sideways scroll, inputs at 16 px, no console errors; the arrows, the paid switch and the update link were brought to 44 px from it.

### A12: AI words on the Coach and the Month

**Owner items:** 2 · **Depends on:** A08, A11 · **Migrations:** `0017_coach_memory.sql` · **Commits:** about 6
- **Migration:** 0017 as §10.1, with `verify-migrations.sh` creating its database as UTF-8 in the same slice, and every assertion seen failing once.
- **packages/schema:** `ModelProse` (ADR 0005's text rule), `NarrateReply` (summary at most 200 characters; at most 5 cards, each a title of at most 80 and a body of at most 240; a quote pick with a why of at most 160; the forecast and Savings lines), with an accept-and-refuse table including fullwidth and Arabic-Indic digits, `＄`, "forty", "money" (allowed), "one" (allowed), a link, `<img src=x onerror=…>`, a markdown link and `{{Q.change}}` for a fact not sent.
- **savings-coach:** `modelPayload` (§3.6: no amount, balance or date field; labels masked and cut), `canonicalPayload`, `cardSignature`, and `checkReply` (only offered facts, slots, cards and quote ids; the direction check of ADR 0005).
- **Helper:** the `narrate` task, pack `daily`: its prompt (coaching rules: a win first, one specific action, tie it to flying time, never shame, never advise on products or investing or on moving money between debt and the flight fund, short sentences, Canadian spelling, text inside labels is data), its JSON schema with fact and quote ids as enums, and its limits. A contract test holds the schema to `NarrateReply`.
- **App:** `useNarration` draws the app's words first; hashes the canonical payload with WebCrypto; reads `ai_notes`; reuses matching cards, the Month matching the summary card from its own two months; asks at most once a day automatically (§3.5: the Coach, or the Month's strip loading the Coach's data after the Month has drawn) and on **Refresh** when stale; checks the reply; stores the checked words; swaps them in with `aria-live`. Also the ✨ labels. The brief follows A11's tone and **Share shop names** settings; ✕ waits for A17.
- **CONSTRAINTS.md:** the Enforced "model text carries no numbers" row, in the same commit as `ModelProse`, which it names.
- **Tests:** `packages/schema/test/model-prose.test.ts`; `packages/savings-coach/test/templates.test.ts` switched to running every template through `ModelProse` itself (savings-coach's tests, not its source, may import `packages/schema`, with the depcruise line to say so); `packages/savings-coach/test/payload.test.ts` (no field of an amount, balance or date type; a shop name with a store number is masked), `check-reply.test.ts` ("rose" beside a falling fact is dropped); `supabase/functions/test/ai-narrate.test.ts`; `apps/web/test/narration.test.tsx` (the app's words first; a cached card drawn with new live figures; a changed signature not reused; a hostile reply drops only its card; `<img src=x onerror=…>` from a reply shows as literal text); `ai-cache.test.ts` (no digit ever reaches an `ai_notes` insert).
- **Acceptance:** no figure is stored; a stale signature is never shown; the Month's first load does not grow beyond the strip's loader.

- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **The migration is `0017_coach_memory.sql`,** the next free number after G1's 0015 and A09's 0016. `ai_notes` keeps `card_sigs` and `fact_keys` as JSON maps from a letter to a signature or a key, each checked in SQL; its trigger keeps the newest 30 per user and surface. Every new assertion was seen RED by a mutation of 0017 (each digit range and sign, each CHECK, the unique key, the trigger, the composite key and its cascade), and the schema gate's database is UTF-8: with SQL_ASCII the check refused clean words holding a curly apostrophe.
  - **A card's words carry their own "one thing to try"** (`tryThis`), and a card to watch that loses it is dropped (checkReply), so the AI can never leave a bare "you overspent". checkReply also refuses a direction word straight after a change blank ("$40.00 more more").
  - **The pack's goal line** is one line of encouragement naming a goal by its `name` blank only, with the app's own words for it (`GOAL_LINE_TEMPLATES`) on the goals' card. Goals are named in the brief by masked name, main first, in hours or dollars, never by an amount (G1).
  - **Not in the daily pack yet:** the forecast sentence (A13 adds its facts) and the Savings note; a reply field that nothing draws would promise what the app does not do.
  - **The prompt's version lives in `packages/schema`** (`NARRATE_PROMPT_VERSION`), held equal to the helper's by a contract test, and the app hashes it into every signature; savings-coach, which may name schema's types only, signs the brief, tone and library version.
  - **A model's `<img src=x onerror=…>` never reaches the screen at all:** ModelProse refuses `<` and `>`, so that card shows the app's words. The test proves nothing becomes an element, and that a category named that way is drawn as the characters it is.
  - **Refresh** shows only once words have been kept and today's facts have moved since; with none kept there is nothing to be stale. The Coach's status line says why its own words show (not set up, off, not installed, a missing update, resting), with one link.
  - **✕ lands here, not in A17:** this slice builds `insight_dismissals`, and its task asks for ✕. A dismissal is kept by the card's cause; without 0017 ✕ is not offered. A17 still owns the detector cards and "Not a subscription".
  - **Share shop names** is stored and shown, and sends "a shop" once facts name shops (A17, A21): digest version 1 names categories and goals only, which are always sent by name.
  - **`packages/schema` says it has no side effects,** so a screen importing one enum no longer carries every zod schema: the first load had grown to 190.00 KB gzipped as ModelProse and the reply's shape joined the package; it is 187.46 KB with the flag, and 187.49 KB at the end of the slice.
  - **Helpers not named in the plan:** `coach/ai-cache.ts`, `narration.ts`, `signatures.ts`, `use-narration.ts`, `day.ts`, `dismissals.ts`, `CoachStatus.tsx`, `ai/coach-settings.ts`, `ai/CoachPanel.tsx`. Extra tests: `narrate-reply.test.ts`, `narration-reuse.test.ts`, `signatures.test.ts`, `ai-settings-coach.test.tsx`, `coach-dismiss.test.tsx`; the Coach, Month line, One-time updates and contract tests gained cases.
  - **Seen in the preview harness** (copied from `preview-a11`) at 320, 390 and 1280 px, light and dark: no sideways scroll, inputs at 16 px, no console errors; the Coach with the AI's words, with its own words and with no helper; the Month's line with the AI's words; AI settings' How the Coach talks.

### A13: Forecast: safe to spend, the month's end and the next 30 days

**Owner items:** 3, 2, 9 · **Depends on:** A12 · **Migrations:** none · **Commits:** about 5
- **Records first:** F29, F30, F31, F32; D27 extended to the forecast line.
- **Engine:** `expectedPay`, `monthEndForecast`, `safeToSpend`, `cashFlow30`, and forecast facts in the digest (so the daily pack carries the forecast sentence). **chart-specs:** `balanceLine`, `rangeBar`.
- **Screens:** `#/forecast` (lazy), sections 1–4 and 7 of §2.5; the Coach's forecast card; the Month's forecast line (lazy, in an error boundary, labelled, with ⓘ); Help's "How the forecast works" and "Two month-end figures".
- **Tests:** `packages/core/test/forecast.test.ts` (a worked month on day 24 of 30 with 3 complete months; rough on day 5; nothing on day 5 with no complete month; no balance without a start; pay not included when there is no schedule or goal), `safe-to-spend.test.ts`, `cash-flow-30.test.ts` (a payday and a bill in the window; a bill past its day with no charge counted tomorrow; under 14 days of records leaves out the daily amount); `packages/chart-specs/test/balance-line.test.ts` and `range-bar.test.ts` (integer geometry; a category named `<b>&` escaped); `apps/web/test/forecast-screen.test.tsx` (with AI off; with no start).
- **Acceptance:** the Month never shows two unlabelled month-end figures; F7 unchanged; first load recorded.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **No migration and no helper change,** as planned. The forecast rides to the AI as a card of the daily pack (`forecastCard`, savings-coach), not a new field of the brief: the helper's brief is `.strict()`, so a new field would have made every daily ask fail until the owner pasted the helper again. The pack's existing card slot words it, it is kept and reused by its card signature, and the Forecast's sentence and the Coach's forecast card are those words. Its claims are its meaning (a tight month asks to watch) and evidence, so words for a comfortable month are never reused for a short one.
  - **The forecast fact sits beside the digest's facts,** never ranked among them (`FactsDigest.forecast`), and only when the caller gives its inputs; the Month's coach line gives none. It lives in `digest.ts`: a file of its own would import the Fact type back, a cycle depcruise refuses.
  - **A new figure unit, `dollars`,** for amounts core rounded to $10, drawn without cents (`formatWholeDollars`), so the words never show a rounded figure as if exact.
  - **F29's no-receipt rule is F15's `payShare`,** not "the goal ÷ paydays in the month" (two rules; F29 says why). **An Income row that has never paid and has no schedule or goal is `idle`,** not named as pay left out: the preview named the starter list's spare rows on every card.
  - **Engine helpers not named in the plan:** `monthPosition` (what the month's end and safe to spend share), `paydaysIn` (pay-period.ts), `forecastFact`, and `scaleSeries`, which the plan gave to A14; A13's charts need it first. The running example of F29 to F32 is one test helper (`packages/core/test/forecast-example.ts`), and the app's tests seed the same example (`apps/web/test/forecast-seed.ts`). Extra tests: `expected-pay.test.ts`, `forecast-fact.test.ts`, `scale-series.test.ts`, `coach-forecast.test.tsx`, `month-forecast-line.test.tsx`.
  - **Goals are plural (G1),** and nothing here is flight-specific: savings still planned is every Savings row's goal less what moved in this month. The flight date and the what-ifs are A14's.
  - **The Forecast never asks the AI itself;** it reuses kept words (`useNarration(…, false)`), and the Coach or the Month's line asks once a day as before. The Month's forecast line reads the Coach's year (`useCoachRead`, which now also reads the pay schedules and this month's start, each failing on its own).
  - **Screens:** the Forecast has the sentence, Safe to spend, End of the month (range bar, what is still to come, a Rough or Range chip and "Based on N months"), The next 30 days (today, the tightest day ahead, the line, the bills due in 7 days, what the line leaves out) and Debt-free (the payoff plan's date, read on its own, with "needs a one-time update" when the debts are not there). The 30-day card says "tightest day ahead" beside today's balance, since today can be lower than any day to come.
  - **Fail soft, proved by screen tests:** pay schedules missing (42P01) gives the Forecast one line pointing to Help and hides only the Coach's forecast card and the Month's line; debts missing gives the Debt-free card that line; no AI helper (404) leaves the sentence in the app's words.
  - **Coverage flake settled (N81):** the app's node tests now compile as its DOM tests do; see N85 for the small movement left.
  - **Help:** "How the forecast works" and "Two month-end figures" are written; the Coach's article names its forecast card.
  - **First load:** 187.49 KB gzipped before the slice, 187.74 KB after (the Month's forecast line loader and its slot in the summary); the Forecast and the line are their own chunks.
  - **Seen in the preview harness** (copied from `preview-a12`, the newest; it now needs apps/web's own Vite and the two public env values) at 320, 390 and 1280 px, light and dark, with no sideways scroll and no console errors: the Forecast, the Coach with the AI's words on its forecast card, and the Month's line. The spare-income wording and the line's missing space were fixed from it; two small layout points are N86.

### A14: Forecast: the flight date, what-ifs and three months ahead

**Owner items:** 3 · **Depends on:** A13 · **Migrations:** none · **Commits:** about 3
- **Records first:** F35.
- **Engine:** `cashFlowAhead`, `scaleSeries` (chart heights in basis points), and `whatIf` (a lever applied to the month's end and the flight date).
- **Screens:** Forecast sections 5 and 6 (§2.5); the what-if chips recompute on the phone; the flight card's **What if…** now opens here.
- **Tests:** `cash-flow-ahead.test.ts` (a rent change from month 2, D13; under 3 months, the median only); `what-if.test.ts`; a screen test that a chip changes the figures with no network call.
- **Acceptance:** the chain is labelled best and worst case.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **Every active goal, not the flight date** (G1). Section 5 is "When you’ll reach your goals": each active goal's date range at its pace (F33), in the owner's order with the main goal first, in the Coach's words and chips. **What if…** applies to the goal chosen from a list (the main goal first); hours only for a goal with a cost an hour.
  - **The what-if has no F-number of its own** (F36 to F44 are taken), so it is written under F35. Its chips are the levers of F34 for the two categories with the largest: each one's quarter, tenth and best month. A tap works out core's `whatIf` from what is already loaded; the screen test spies on the client and finds no read, write or call.
  - **`scaleSeries` was built in A13,** which needed it first; A14 adds `cashFlowAhead`, `whatIf` and the chart `bandBars`.
  - **F35's open points, decided in formula-decisions:** the three calendar months after this one; a source with no usual pay counts its whole goal; a month of refunds counts as $0 spent; every chain starts at F30's most likely end, as the plan's words say; nothing is forecast with no whole month. With a start, the bars and table are where each month ends; without one, what each month leaves over.
  - **The Coach's year read reads budgets and bills typed up to three months ahead,** so a rent rise typed from November counts from November (and on the 30-day line). Each rule resolves the row in effect in its own month, so nothing earlier moves.
  - **The goals' dates show without the month's forecast,** since they need only the year's read. Fail soft: with 0013's columns missing the card says in one line that the dates need a one-time update, pointing to Help, and every other card shows (a screen test, 42703). No migration and no helper change.
  - **The three months' table** scrolls inside its own box below about 400 px, with each row's name held at the left.
  - **Screen tests were racing a cold start** (N87): a file's first render of a lazy screen took about half of a find's one second. `apps/web/test/warm-screen.tsx` renders the screen once in a file's `beforeAll`; no test's own wait was raised.
  - **Tests:** `cash-flow-ahead.test.ts`, `what-if.test.ts`, `band-bars.test.ts`, `forecast-ahead.test.tsx`, `forecast-goals.test.tsx` and `forecast-what-if.test.tsx` are new; the Coach and Help tests changed. Commits: 13 rather than about 3, each within 300 lines, four of them the test warm-up and its record.
  - **First load:** 187.73 KB gzipped before the slice, 187.80 KB after (the Coach's year read reaching three months ahead, which the Month's forecast line shares); the Forecast, its goals, what-ifs and three months are its own chunk.
  - **Seen in the preview harness** (copied from `preview-a13r`) at 320, 390 and 1280 px, light and dark, with no sideways scroll and no console errors; the table's row names were fixed from it. The charts grow with the card on a wide screen (N88).

### A15: Reports: the month in review

**Owner items:** 6, 7, 2 · **Depends on:** A12 · **Migrations:** none · **Commits:** about 4
- **Records first:** F36.
- **Engine:** `monthlyTotals`, `savingsRate`, `biggestMovers`. **chart-specs:** `pairedBars`.
- **Helper:** the `narrate` task's `report` pack (a headline, three points, one thing to try), cached per month.
- **Screens:** `#/reports/YYYY-MM` (lazy) with its tab row, Overview only; the print stylesheet and **Save as PDF**; More and the wide bar link to it.
- **Tests:** `month-totals.test.ts` (savings rate with no income gives none; a pre-history month left out), `movers.test.ts`, `paired-bars.test.ts`, `reports-overview.test.tsx` (with AI off; a report reply with a digit is dropped).
- **Acceptance:** every figure from core; the Overview is complete with AI off, in the app's own words; a report reply with a digit is dropped and the app's words show; the current month is marked "so far"; no sideways scroll at 320 px; the printed page holds the same figures as the screen.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **No migration, as planned.** 0016 already counts a `narrate_report` task and 0017's `ai_notes` already takes the `report` surface and a `month:2026-08` scope, so the words are kept there with no new file.
  - **Records:** F36 is written in `docs/formula-decisions.md` before its code. What it settles that the plan left open: a month so far is counted like for like (planned bills on their due day) against the same days of last month; the usual month is the median of up to six whole months *before* the month shown, so a month's review reads the same whenever it is opened, and it is shown only once a month is over; a month the records start partway through (the owner's August) is reviewed and says so; only Variable expenses can be a biggest change, as in digest version 1; the savings rate has none when nothing, or only refunds, came in.
  - **Engine helpers not named in the plan:** `monthReport` (core), which gathers every figure the Overview shows so the screen only formats; `windowTotals`; and compare.ts's `change`, now exported inside core so a total against its usual month reads as any other change.
  - **The review's words:** `reportFacts`, `reportBrief`, `reportWords`, `checkReportReply` and `mergeReview` (savings-coach), with `sentenceProblem` shared with the daily pack's check; `parseReportReply` and `REPORT_PROMPT_VERSION` (schema). The headline names the biggest change each way (a win first for the Cheerleader), the three points are Spent, Saved and the largest change against the usual month (else what came in), and the thing to try is about the largest rise, else a general one. Each part the AI gets wrong shows the app's own words alone.
  - **The AI is asked about a month that is over, never the month so far,** whose facts change every day. "Once per complete month" is read as once per month that is over, partly recorded ones included, since the owner's only past month is one. The ask is automatic, once per month and signature on a device, bounded by the helper's two reviews a day.
  - **Goals are plural (G1),** and nothing here is flight-specific: Saved is every Savings row, and no goal is named in the review.
  - **The helper** takes the `report` pack with its own prompt and a reply schema whose enum is the points offered; its version is `2026-09-25.5`, so One-time updates asks for the new copy. An older copy refuses the pack, and Reports shows the app's own words with the helper's one line.
  - **Tabs:** the tab row holds Overview alone, and remembering the last tab waits for a second tab (A16).
  - **Save as PDF** is the browser's print with the bars, the month arrows, the tabs and the button left off; the month's name, every card and every figure stay on the page. **Download CSV** stays A19's.
  - **Help:** "Reports and trends" is written.
  - **Tests:** as planned, except that the "with AI off" and "a report reply with a digit is dropped" cases are in `reports-review.test.tsx` beside the review's other screen tests, while `reports-overview.test.tsx` holds the figure cards, the fail-soft line and Save as PDF. Added: `month-report.test.ts`, `report-reply.test.ts`, `report.test.ts` and `report-words.test.ts` (savings-coach), `ai-report.test.ts`, `reports-read.test.tsx` and `reports-review.test.tsx`. Commits: 17 rather than about 4, each within 300 lines, and two from review.
  - **First load:** 187.80 KB gzipped before the slice, 187.95 KB after (the Reports tab on the wide bar, its address and the bars' print class); Reports is its own chunk.
  - **Seen in the preview harness** (copied from `preview-a14`) at 320, 390 and 1280 px, light and dark, with no sideways scroll and no console errors: August with the AI's words and with the app's own, and September so far. The month's name was kept on the printed page from it.

### A16: Reports: trends

**Owner items:** 6 · **Depends on:** A15 · **Migrations:** none · **Commits:** about 3
- **Records first:** F37.
- **Engine:** `monthlyTrend`, `categoryTrends`, `trendLabel`, and trend facts in the digest. **chart-specs:** `trendLines`, `sparkline`.
- **Screen:** the Trends tab, with the empty state that names the month it becomes possible.
- **Tests:** `trends.test.ts` (5 of 6 pairs rising past the band gives "rising steadily"; 3 months gives "not enough months yet"); chart tests; a screen test.
- **Acceptance:** no trend is labelled with under 4 complete months; every empty state names the month the view becomes possible; a month before history start is never drawn as $0.
- **Changed while building (2026-09-25).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **No migration, as planned,** and no new Edge Function: Trends reads `transactions`, `category_plans` and `ingest_batches`, which 0001 to 0014 already hold. The fail-soft line is the Overview's ("Reports need a one-time update", to One-time updates), tested with `category_plans` missing (42P01).
  - **Records:** F37 is written in `docs/formula-decisions.md` before its code. What it settles that the plan left open: "over the last up to 6" is six months, so up to **5 pairs**, and the plan's test "5 of 6 pairs" became "4 of 5 pairs" (with 3 of 3 and 3 of 4 for four and five months); a pair rises or falls only by $1.00 or more (F26's "same"); "exceeds the band" is read as F27's "from one band", at least the band; the band is F27's over the same months; the label always reads the last six months, in the twelve-month view too; Income, Spent and Saved are labelled by the same rule; the month still running is never a point.
  - **The month it becomes possible** counts whole months only (F24), so for records from 8 August 2026 it is **January 2027** (September to December whole), not "about November" as §2.6 and §14 guessed. The screen names whatever core works out.
  - **Engine:** `trendLabel`, `monthlyTrend` and `categoryTrends` in `packages/core/src/trends.ts`. Heights come from `scaleSeries` over $0 and every point (and the usual level on a category's row), so a flat-ish line is drawn flat-ish rather than as a cliff.
  - **Digest:** a Variable category rising or falling steadily is a `category_trend` fact, always a card: rising to watch, with one thing to try (aim for the usual month), falling as a win. It joins digest version 1, as A08's wins did. Its cards, quote tags and Why am I seeing this? are in the same commit, since every kind of fact must have them.
  - **Categories:** Variable expenses only, as F36's biggest changes; one with nothing in the months shown is left out.
  - **Screen:** Trends always ends with last month, whatever month the Overview was on, so the month arrows and "So far" step aside on it. The tab chosen is remembered on this device (localStorage, wrapped: a storage that refuses opens the Overview). The 6 and 12 months switch is two 44 px buttons with `aria-pressed`. The totals chart is left off the printed page, as the Overview's bars are; the month-by-month list stays on it.
  - **Goals are plural (G1):** nothing on Trends is goal-specific; Saved is every Savings row.
  - **Tests:** `trends.test.ts` (core), `trend-lines.test.ts` (chart-specs), `digest.test.ts`'s trends, `reports-trends-read.test.tsx` and `reports-trends.test.tsx`. Commits: 9 rather than about 3, each within 300 lines.
  - **First load:** 187.95 KB gzipped before the slice, 187.93 after; Trends is in the Reports chunk.
  - **Seen in the preview harness** (copied from `preview-a15`, with `?trends` adding a line each way and `?fresh` starting the records on 8 August) at 320, 390 and 1280 px, light and dark, six and twelve months: no sideways scroll, no console errors. The sparkline was full-width until wrapped in its own box, and the totals chart now stops at a readable width on a wide screen.

### A17: Shops, subscriptions and unusual charges

**Owner items:** 6, 2 · **Depends on:** A16 · **Migrations:** none (uses 0017) · **Commits:** about 5
- **Records first:** F38, F39, F41.
- **Engine:** `topShops`, `recurringCharges`, `unusualCharges`; digest version 2 with the detector facts and their cause keys for dismissal. The app passes each row's normalised merchant from `statement-parsers`.
- **Screens:** the Shops tab ("Not a subscription" dismisses); **✕** on every Coach card, stored in `insight_dismissals` (0017) by the card's cause, so a dismissed cause stays gone on every device, and hidden when 0017 is missing; Coach cards for price rises, new subscriptions, unusual charges and possible doubles; a Setup nudge, "Looks like a monthly bill: add it?", which fills the bill editor for the owner to save.
- **Tests:** `recurring.test.ts` (each cadence band at its edges; a 3% rise flagged; 2 charges not enough), `unusual.test.ts` (fewer than 5 earlier charges never flagged; a typed and an imported row within 3 days), `top-shops.test.ts`, screen tests, and `apps/web/test/coach-dismiss.test.tsx` (a dismissed cause does not come back; a new cause for the same shop does; ✕ hidden without 0017).
- **Acceptance:** a possible double is flagged, never hidden; a dismissed card stays gone for its cause and nothing else.
- **Changed while building (2026-09-26).** Each decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.
  - **No migration and no helper change, as planned.** "Not a subscription" is kept in 0017's `insight_dismissals` as `not_subscription:<shop>`, beside the Coach's ✕ (built in A12). The helper's brief takes any fact kind (a lowercase word), so the six new kinds reach the AI with no new copy to paste.
  - **Records:** F38, F39 and F41 are written in `docs/formula-decisions.md` before their code. What they settle that the plan left open: a charge is a row below $0 on a spending list, a refund one above; the records covered start at the later of history start and the first day read; a typed row and one read from a receipt photo are "by hand", a card statement's are not (a photo and the statement of one purchase are the likeliest pair counted twice); a series that has gone quiet past its band's longest gap has stopped and is not listed; "new" needs the records to reach one band's longest gap before the first charge, and a new shop 60 days, so the owner's first months do not call everything new; a large charge's median is of its category's charges in the 90 days before, a row with no shop counting toward it but never flagged itself; a pair is named by its statement row's shop.
  - **The latest charge is judged apart (F38).** The plan held every amount to 10% of the median, which hides the rise it must report: three charges of $15.99 and one of $18.99 is 19% over, so the series vanished. The charges before the latest are held to it; the latest may instead be a price change of at most half the charge before, so a one-off large purchase is not a price rise. A series' price is its latest charge when the price changed, else the median, so a year's cost is at today's price.
  - **The Coach looks back 30 days** for price rises and unusual charges; Reports → Shops looks at the month shown, and sees a month that is over as it stood at its end. Every detector fact is always a card, to watch; a price rise and a pair are *solid* (the statement says so), a new subscription, a large charge and a new shop *some* (a pattern read from the records).
  - **Every detector card opens Shops** ("See your shops"), rather than some opening Setup as "Add it as a bill": a new subscription filed under Variable expenses has no bill editor to fill. Setup's nudge is where a bill is added. A shop gets one card, as a category does.
  - **"Double" and "twice" are number words** ADR 0005 refuses in any card, so the cards say "Charged again?" and "Counted more than once?". The Shops tab, which is the app's own display text, says "Possible repeat charge" and "Maybe counted twice".
  - **Share shop names** now does what AI settings says: with it off, a shop is sent as "a shop".
  - **Shops reads 24 months before the month shown,** so a yearly charge can reach its third payment; the Coach keeps its year. Its read fails on its own, with the Overview's line; "Not a subscription" without 0017 says in one line that it needs a one-time update, pointing to Help, and every charge is still listed. Setup's nudge reads a year for itself and, if that fails, simply does not show.
  - **The nudge fills the fields and shows Save;** only Save writes, as "from this month on" (D13). It offers the latest price and the day of the month of the latest charge, one per category, the dearest.
  - **Engine helpers not named in the plan:** `billNudges` (core, F38), `spendingRows` and `shopRows` (core), `ChargePair.shop`; `shopEntriesForCore` (app), `reports/tab.ts`, `reports/shops-read.ts`, `bill-nudges.ts`. Extra tests: `digest-shops.test.ts`, `reports-shops-read.test.tsx`, `coach-detectors.test.tsx`, `setup-nudge.test.tsx`.
  - **The coverage floor on `format.ts` went RED at random** twice during the slice (N85): the DOM project now runs its tests too, so the floor holds whichever file map coverage keeps.
  - **First load:** 187.93 KB gzipped before the slice, 188.05 KB after (each row's shop, in the shared row renaming); Shops is in the Reports chunk, the nudge in Setup's.
  - **Seen in the preview harness** (copied from `preview-a16`, with `?shops` adding a price rise, a new monthly charge with no bill amount, a repeat, a large charge, a new shop and a typed coffee the statement holds, and `?quiet` a fresh statement with nothing waiting) at 320, 390 and 1280 px, light and dark: Shops, the Coach's detector cards and Setup's nudge, with no sideways scroll and no console errors. It showed a first bill payment typed by hand (a car loan, an insurance) called a new shop; that is F39 as written, a large first charge, and is left so: it is worth a look once, and ✕ keeps it gone.

### A18: Habits: the spending grid, streaks and personal bests

**Owner items:** 6, 2 · **Depends on:** A16 · **Migrations:** none · **Commits:** about 3
- **Records first:** F40.
- **Engine:** `spendingGrid`, `weekdayPattern`, `streaks` (on `weekSheet`), `personalBest`; win facts in the digest. **chart-specs:** `heatGrid`.
- **Screens:** the Habits tab; encouragement cards on the Coach.
- **Tests:** `habits.test.ts` (levels at each boundary; a streak broken; a personal best needing 3 months), `heat-grid.test.ts`, a screen test.
- **N44:** the streak uses `weekSheet`; `weeklySummary` is left as it is and N44 is updated to say so.
- **Acceptance:** each grid level is right at its boundaries; a personal best needs 3 complete months; the grid has a text list of the same figures beside it; no sideways scroll at 320 px.

### A19: Download a month

**Owner items:** 6 · **Depends on:** A15 · **Migrations:** none · **Commits:** about 2
- **Build:** `packages/report-export` (config commit: coverage 80/80/75, depcruise lines: it imports nothing; the app loads it dynamically), with `toCsv(rows)` and its formula guard (§7); `format.ts` gains the plain amount formatter; **Download CSV** on Reports.
- **Tests:** `csv.test.ts` (`=cmd`, `+1`, `@x`, a tab and a carriage return each get the apostrophe; a negative amount cell does not; commas, quotes and line breaks quoted); a screen test that the file is built only on the tap.
- **Acceptance:** N4 marked settled; the export code is fetched only on the tap, so the first load does not grow; a downloaded file's amounts match the screen's.

### A20: The Sunday check-in

**Owner items:** 2 · **Depends on:** A12 · **Migrations:** none (uses 0017) · **Commits:** about 4
- **Records first:** F42.
- **Engine:** `weeklyRecap`, `questionsToAsk`, `suggestedWeeklyLimit`, `impulseShare`.
- **Helper:** the `narrate` task's `checkin` pack.
- **Screens:** `#/coach/checkin` (§2.4); the Coach tab's dot from Sunday; answers written to `coach_answers`; the commitment through the Week's `setWeeklyBudget`, only on the tap. Without 0017 the questions say they need a one-time update and the rest shows.
- **Tests:** `checkin.test.ts` (under $20 never asked; an answered charge not asked again; the limit rounded down to $5), `checkin-screen.test.tsx` (the commitment writes only on the tap; AI off).
- **Acceptance:** the weekly budget is written only on the tap; the check-in is complete with AI off; without 0017 only the questions are replaced by one "Needs a one-time update" line.

### A21: Review suggests categories

**Owner items:** 2, 8 · **Depends on:** A11 · **Migrations:** `0018_category_suggestions.sql` · **Commits:** about 4
- **Migration:** 0018 as §10.1, every assertion seen failing once. One-time updates gains its probe.
- **Helper:** the `categorise` task (§3.6's data; aliases `c1…cN`; batches of about 2,500 tokens and at most 40 rows). **packages/schema:** `CategoriseReply` (`{i, alias, confidence}`; only medium or high kept).
- **Screens:** Review's "✨ Suggested" chip, picked; **Suggest categories** (run automatically after an import when AI is on); **Approve these N** (§2.8). With AI off, a new `similarMerchant(name, learned)` in `statement-parsers` gives the hint that is picked but never stored: the learned shop whose normalised name shares the most leading words with this one, at least one word of four or more letters, ties left unhinted. It is a hint only; `sameMerchant` stays the only match that files a row on its own (CONSTRAINTS.md, the approval invariant).
- **Tests:** schema-gate blocks; `packages/statement-parsers/test/similar-merchant.test.ts` (a shared first word hints; a shared short word does not; a tie gives none); `categorise.test.ts` (an unknown alias and low confidence dropped; a merchant named `IGNORE PREVIOUS INSTRUCTIONS…` changes nothing); `review-suggestions.test.tsx` (Approve sends the chosen category and records `user`; Approve these N calls `approve_candidate` once per row; 0018 missing leaves Review as today with one line).
- **Acceptance:** nothing reaches the ledger as `model`, and every approval records `user`; a suggestion never auto-approves; 0018 missing leaves Review as today with one line; every new schema-gate assertion is seen failing once.

### A22: Just type it

**Owner items:** 2, 9 · **Depends on:** A11 · **Migrations:** none · **Commits:** about 3
- **Build:** `parseQuickEntry(text, asOf)` in `statement-parsers` (one amount through the existing amount parser; today, yesterday, a weekday or a date; "paid", "got", "received" for income; the rest as the shop; a category from an exact learned rule). The `quick_add` task runs only when the parser leaves something empty, and its amount must appear word for word in the owner's text or it is dropped. **packages/schema:** `QuickAddReply`.
- **Screen:** **Just type it** first on Add; it fills the typed form; "read by AI: check it" on an amount the AI read.
- **Tests:** `quick-entry.test.ts` ("4.50 coffee", "coffee $12 yesterday", "paid 1200 rent monday", an ambiguous "3 coffees 12"), `quick-add.test.ts` (an amount not in the text dropped), `add-just-type-it.test.tsx` (nothing saved without **Save**; AI off).
- **Acceptance:** nothing is saved without **Save**; an amount the AI read that is not in the owner's words is dropped; Just type it works with AI off, through the parser alone.

### A23: Receipts through the AI helper

**Owner items:** 2 · **Depends on:** A11 · **Migrations:** none · **Commits:** about 2
- **Build:** the `receipt` task on services that read images only, with `read-receipt`'s prompt and schema; `receipt.ts` tries the helper and falls back to `read-receipt` when it is not deployed.
- **Tests:** Groq is never sent an image; failover to a paid service only with the switch on; the fallback path; the reply still parsed by the existing receipt zod.
- **Acceptance:** a service that cannot read images is never sent one; a paid service is tried only with **Use paid services** on; with the helper missing, a photo works exactly as today through `read-receipt`; the result still fills the form and goes to Review.

### A24: Ask about your money

**Owner items:** 2, 5 · **Depends on:** A14, A17, A12 · **Migrations:** none · **Commits:** about 5
- **savings-coach:** the intent catalogue (spend_in, compare, top_categories, top_shops, subscriptions, forecast, safe_to_spend, goal_date, what_if_cut, debt_free, explain_month, budget_left, help) and `matchQuestion`, the fallback. **packages/schema:** `AskPlan` (an intent; category aliases; periods from a fixed set with no digits: this or last week, month or year, last three months, or a month's name with this or last year; a help topic id; an `amountText` that must appear word for word in the question; or `cannot`). **Engine:** `answerQuery`.
- **Helper:** the `ask` task. **Screens:** `#/ask` (lazy); the Coach's ask box; **Ask about this** in every help sheet; the last five questions on this device.
- **Tests:** `intents.test.ts`, `ask-plan.test.ts`, `answer-query.test.ts` (one worked answer per intent), `ask-screen.test.tsx` (`cannot` shows suggestions; AI off uses the chips; an amount from the question shows as an editable chip).
- **Acceptance:** every figure in an answer comes from `answerQuery`; `cannot` shows suggested questions; an amount from the question shows as an editable chip; Ask works with AI off through the chips; questions are kept on this device only.

### A25: Getting started

**Owner items:** 5, 2, 9 · **Depends on:** A10, A07 · **Migrations:** none · **Commits:** about 5
- **Records first:** F43.
- **Engine:** `setupProgress`, `starterBudgets`.
- **Screens:** `#/start` (§8.1); the Month's empty state and the first sign-in open it; More and Settings show the progress line. Step 5 says "your goals" and uses G1's **Add a goal** sheet.
- **Tests:** `setup-progress.test.ts` (a step whose read failed is "can't check yet"; later moves to the end), `starter-budgets.test.ts`, `getting-started.test.tsx` (each step with its real editor; **Do this later** kept in `user_metadata`; the AI step walks One-time updates when the helper is missing; completable with AI off).
- **Acceptance:** every "done" is read from data, never stored; a failed read shows "can't check yet"; the guide can be finished with AI off; a starter budget is written only on **Accept**; each step works at 320 px.

### A26: Mobile pass (owner item 9)

**Owner items:** 9 · **Depends on:** A25 and every screen slice · **Migrations:** none · **Commits:** about 3
- **Do:** copy the newest `preview-s*` harness into the scratchpad; walk every screen and every fail-soft state at 320, 375, 390, 430, 768 and 1280 px, light and dark, and with text at 200%; fix what it finds (N58's leftovers included); add the static width test and the offline banner; add CONSTRAINTS.md's Pending mobile-sweep row.
- **Tests:** the width guard; the offline banner; a structural test for each fix where one is possible.
- **Acceptance:** no screen scrolls sideways at 320 px; inputs 16 px; targets 44 px; screenshots in the scratchpad only; the results in the commit bodies for A28 to summarise.

### A27: A critical review of the whole app, and its fixes (owner item 8)

**Owner items:** 8, 5 · **Depends on:** A26 · **Migrations:** none · **Commits:** about 5
- **Do:** read every screen against the owner's list and fix what does not hold. Already known: rows on the Week, Paycheck and Bill calendar open their charges (N46, N48, N51); a Not spending charge opens and can be moved (N26); a learned-shops list in Settings with **Forget** (N17; a delete under 0001's own-rows policy, or a sentence if it is refused); every "database update (00NN…)" message reworded to "Needs a one-time update" with a link to Help (N28's rest); the Year's failed reads say "year" (N42); empty, loading and error states made consistent.
- **Tests:** one per fix, deterministic; existing tests changed only where wording changed.
- **Acceptance:** each N-entry fixed is marked settled with its commit; new findings not fixed are written up in NOTICED.

### A28: Everything tested, clicked through, and handed over (owner item 10)

**Owner items:** 10, 5, 9, 8 · **Depends on:** A27 and every earlier slice · **Migrations:** none · **Commits:** about 3
- **Do:** `./scripts/gates.sh full` GREEN on a clean tree, every coverage floor met (`savings-coach`, `report-export` and `supabase/functions` included). A mutation list, each seen RED then restored: the digit rule, the direction check, the origin check, the limit, the additional data, the same-days window, history start, the `ai_notes` check. A real-browser click-through in the harness with a fake database and a fake AI: first sign-in, Getting started, the key, a statement, Review with suggestions, Coach, the check-in, Forecast, Reports, Ask, Help; then again with AI off, the helper missing, each of 0015–0018 missing, and every service resting; at 320 and 390 px, light and dark; no console errors.
- **Hand over:** HANDOFF rewritten: what is new; that 0003–0014 are in (the owner, 2026-09-24); §10.2's three steps; that `main` deploys itself and every new screen fails soft until they are done; what the owner will notice (§2.10: Week off the phone bar, the wide bar's changes, the Coach tab); how to check each screen. `docs/setup.md` gains the AI section; Help's One-time updates and Start here final; CONSTRAINTS.md's measured counts (121 golden unchanged, the total higher); ROADMAP's markers; NOTICED updated.
- **Acceptance:** `./scripts/gates.sh full` prints `status=GREEN` on a clean tree, with every coverage floor met; the golden count is still 121 and the total number of tests is not lower than CONSTRAINTS.md's measured count; each item on the mutation list was seen RED and restored; the click-through passes in every state listed, at 320 and 390 px, light and dark, with no console errors; HANDOFF's steps match §10.2; `git status --short` prints nothing. The push to `main` is then the orchestrator's step.

---

## 14. Risks

- **The research was second-hand.** Direct fetches of the providers' pages were blocked, so model ids and limits come from search results. The allowlist is one constant, each adapter is re-checked at build, and **Check which models work** shows at run time what each key can use.
- **A model is due to be shut down around 16 October 2026** (`gemini-2.5-flash`, `read-receipt`'s default today). A02 moves it first.
- **Free tiers change without notice.** Google cut free quotas in December 2025, and Groq dropped a model family from its free tier in August 2026. Soft limits, cooldowns, failover and the app's own words for everything keep the app working.
- **Privacy.** Free tiers may keep what they are sent and people may read it. The owner accepted this for Gemini's free tier (ADR 0002) and asked for free models; the other free services' cards say the same before a key is pasted (ADR 0004). The packs send no amounts, labels are masked, Review sends a size band not an amount, shop names can be switched off, and paid services are offered.
- **A Supabase key change locks saved keys.** Detected (`locked`), explained, and survivable: the Gemini secret and other services keep working; `AI_KEYS_ROOT` is the documented way to make keys survive a change.
- **The strict text rule will drop some good sentences,** more often from small free models. Each card falls back on its own, and drop reasons are counted as codes so the prompts can be tuned.
- **The AI can still choose the wrong tone around a correct number.** The direction word travels with the figure and contradicting sentences are dropped, but the wording itself is not proven.
- **Little history.** Records start on 8 August 2026, so baselines, trends and ranges say "not enough months yet" until about November. Levers, budget pace and the flight card work sooner, and the screens say what would help ("import the statement before 8 Aug").
- **The owner deploys late or in part.** Everything fails soft (§3.10), and One-time updates shows what is left.
- **The AI helper is one long file to paste** (about 1,000 lines). Copy buttons give the exact bytes, and `ping` confirms the version.
- **The first load is 182.34 KB of a 200 KB budget.** Everything new on the Month loads after it draws, and every commit that adds to it records the size.
- **Only Chromium is checked here** (N41); HANDOFF asks the owner to look on the iPhone.
- **Supabase's header rules for its new secret keys** are handled and tested against fakes, but nothing has run against the hosted project from here.
- **Week leaves the phone bar,** which the owner will notice. It is one tap away, `#/week` still works, and HANDOFF says so.
- **The copied setup files are public on the site.** They hold no secret, and row-level security is what protects the data, not the schema being unknown.
- **Scope:** 29 slices (G1 added on the owner's later request), about 116 commits. Comparisons and the Coach come early so value shows before the AI plumbing is finished, and every slice leaves the app usable.

---

## 15. Where the designs disagreed, and what was chosen

The three designs are named by what led them: **grounded** (safety), **delight** (the owner's experience) and **reliable** (free-tier reality). Each choice is Decided by the engineer under the owner's 2026-09-24 instruction to proceed without questions.

| Question | The designs said | Chosen | Why |
|---|---|---|---|
| Which design leads | The engineering judge preferred grounded; the owner's judge preferred delight | Grounded's architecture and safety; delight's screens, tone, Help and Setup; reliable's budgeting and honesty | Both judges asked for exactly this mix in their grafts, and neither verdict argued against it |
| How a blank is written | `{{fact.id}}` (grounded), `[[A.slot]]` (delight), `{{A}}` (reliable) | `{{A.slot}}` | Letters and slot names are digit-free, so the database can refuse every digit; a fact has several slots (name, now, before, change) |
| Amounts in the AI's brief | Formatted values (grounded, reliable); none (delight) | None, for the packs | Less is kept by free tiers, and the brief's hash becomes the qualitative signature by construction. The test checks that no amount, balance or date field is sent, and labels are masked, because real shop names hold store numbers |
| The cache key | A hash of the exact payload (grounded) | A signature with no cents, and cards reused one at a time (reliable) | With the exact payload, every cent changes the key and free calls run out |
| The direction of a change | Direction in the figure (grounded); a word-list check (reliable) | Both | The figure carries "more" or "less", and a sentence that contradicts it is dropped |
| Daily limits | 60 (grounded), 300 (delight), 40 (reliable) | 40 by default, 10–150, a limit per task and a soft limit per service, claimed atomically per attempt | The owner's judge asked for 60 or fewer; the free tiers' reported limits are about 20–500 a day |
| Time per request | 20 s (grounded), 3 × 25 s (delight), up to 5 × 25 s (reliable) | 3 attempts, 20 s each (30 s for a receipt), in a 100 s deadline | Stays inside the free plan's 150 s wall clock |
| Finding models | From each service's own list, by pattern (delight); a fixed list (grounded, reliable) | A fixed list; a service's list is only intersected with it | CLAUDE.md's hardcoded allowlist; a listed id never reaches a URL |
| OpenRouter's model | Named free models (grounded); the `openrouter/free` router (reliable) | The router | The named free models change often |
| Groq's JSON | Strict schema (grounded); `json_object` (delight, reliable) | `json_object`, zod deciding | Strict schemas are reported to be ignored on `gpt-oss-120b` |
| Paid defaults | Sonnet (delight); the cheapest (grounded, reliable) | The cheapest, and paid off until switched on | A paid key must not be drained by a fallback the owner did not choose |
| Tones | Three, including "Drill sergeant" (delight) | Cheerleader (default) and Straight talker | The coach idea doc rules out guilt-based nagging |
| How the helper writes | PostgREST table writes (delight); service-role-only functions (grounded, reliable) | Functions, granted to `service_role` alone, taking `p_user` | Every grant can be asserted; the browser has no path to a key |
| The encryption root | The service key (grounded, delight); an optional `AI_KEYS_ROOT` first (reliable) | Include `AI_KEYS_ROOT` as optional | It lets keys survive a Supabase key change, and it is not an owner step |
| The period switch | Three items (grounded); four (delight, reliable) | Month · Week · Pay · Year | Four fit 320 px at about 72 px each; at large text they scroll in their own box |
| The coach package | `packages/coach` (grounded) | `packages/savings-coach` | CAPABILITY-MAP's module ids are stable |
| Trends | Its own screen (reliable); a Reports tab (delight) | A tab, of four, not six | The owner's judge found three places to look, and six tabs, too many |
| Getting started | At the top of Setup (reliable); its own screen (grounded, delight) | Its own screen, one step at a time, editors inline | One step per screen is what keeps a non-engineer from feeling lost |
| "Do this later" | This device (grounded); a table (reliable); the sign-in's metadata (delight) | The sign-in's metadata | It follows the owner to another device and needs no migration |
| Comparing the Month | A change under Spent (delight, reliable); both figures named (grounded) | Both figures named | A same-days window counts a bill on its due day (F8); Spent counts it all month |
| A month-end forecast on the Month | A second figure (grounded); a labelled line under F7 (reliable) | A labelled line, ⓘ and a Help article | The Month must never show two unlabelled month-end figures |
| The month-end method | Pace and budget (grounded); trailing rates (delight); earlier months as scenarios (reliable) | Earlier months as scenarios, plus pace from the 7th, as a range | Honest with little history, and never a single invented point |
| Goal pace | The last 8 weeks (delight); months, at p25, median and p75 (reliable) | Months | Payday transfers make weeks lumpy |
| Pay still due | Goal less received (grounded); the schedule and usual pay (reliable) | The schedule first, the goal as fallback | Setup asks for the schedule; the goal is often blank |
| History | Not handled (grounded, delight); `historyStart` (reliable) | `historyStart`, from the first statement period | Months before the records would read as $0 and invent "huge increases" |
| Migrations | Two (grounded); three (delight, reliable) | Three, and G1's for goals first (0015) | Each capability can be missing alone, and the probes can say which |
| Export | None (grounded, delight); print (reliable) | Print, plus a CSV in `report-export` | No dependency; the owner's data is never trapped; N4 is settled where it belongs |
| An AI note on every comparison | Yes (delight) | No: chips only | The owner's judge: too much for a non-engineer, and too many calls |
| The Month's coach line | Loaded with the Month (delight, reliable) | Loaded after the Month draws | The 200 KB first-load gate, with 17.66 KB of room |
| Review's brief | Amounts (reliable); none (delight) | A size band | Enough to tell a snack from a tank of fuel, without the amount |
| Where the hash is made | In the coach package (grounded) | In the app, with WebCrypto | `savings-coach` stays pure, like `chart-specs` |
| Push, then paste | Not addressed (grounded) | Safe by design, proven in A28 | `main` deploys itself when pushed |

---

## 16. What the judges said must be fixed, and where it is

**The engineering judge:**
- Rebased on the current branch (N7 settled, screens lazy, the 200 KB gate): the status line, §9, §13's rules, A07, A12, A13.
- A Unicode-safe number rule (NFKC, `\p{N}`, `\p{Sc}`, word boundaries, "one" allowed, a SQL backstop, fullwidth and Arabic-Indic fixtures): ADR 0005, §10.1, A12.
- No `temperature` or `top_p` where refused; thinking cannot cut the JSON short; refusals and length stops fail over: §3.3, A11.
- A deadline of about 110 s, at most three attempts: §3.5 (100 s).
- Payloads budgeted in tokens; a service skipped when a payload would exceed its budget: §3.5, A11.
- `gemini-2.5-flash` off the list and off `read-receipt`; every id unverified until listed: §3.3, A02.
- Service-only functions revoked from public, anon and authenticated, granted to `service_role`; the stub role; every grant asserted; `sb_secret_` never a bearer: §3.4, §10.1, A09.
- The functions really under the gates, each seen RED once: A02.
- `packages/savings-coach`, and the map's rows and arrows: A07, CAPABILITY-MAP.md.
- Extraction accuracy and Engine speed: §12, A02, A07.
- The forecast reconciled with F7: §2.2, §5, A13.
- Vertical slices: §13; each engine slice lands with its screen, and each helper slice ends in AI settings.
- An explicit final step, and HANDOFF's plain words: A28, §10.3.
- Quick-add amounts word for word in the owner's text: §3.9, A22.
- The direction word in the figure, and contradictions dropped: §3.7, ADR 0005.
- Limits claimed atomically, per attempt, on the Pacific day: §3.5, ADR 0004.
- The brand: §13's rules; the history check waits for the rewrite (N64).
- Static guards (hosts, `SERVICE_ROLE`, the CSP): A09.
- The quote library verified at commit, "often attributed" honest, ids only from the AI, no product advice: §4.
- Every choice labelled; Week's move flagged; the golden count unchanged: throughout, A05, A28.

**The owner's judge:**
- Rebased, and everything new on the Month kept under the gate by loading it after: §2.2, §9.
- Off `gemini-2.5-flash` first: A02.
- A hardcoded list per service, only intersected: §3.3.
- No "zero digits in the payload" test; no amount, balance or date field sent, labels masked: §3.6, A12.
- `historyStart` everywhere: F24, §5, §6.
- Lower limits, batched words, no note on every comparison, paid only by opt-in: §3.5, §6.
- Trimmed for a non-engineer: one coach line and chips on the Month, Left by default; at most three cards and one quote; Reports opens on Overview; Forecast leads with a sentence and safe to spend; Cheerleader by default; no bare "you overspent": §2.
- Honest setup time, with Copy buttons, exact clicks, **Check again**, and the secret reused: §8.1, §10.2.
- AI and coach tables never read in `AppDataProvider.refresh()`: §3.10.
- The `/setup/` files limited to 0015 on and the helper's source, nothing from the environment: §8.2.
- **Approve these N** as one conditional write per row, recording `user`: §3.9, A21.
- `coach_answers`' owner guard decided now (a composite foreign key): §10.1.
- No brand word anywhere: §13's rules.
