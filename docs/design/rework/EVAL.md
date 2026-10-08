# EVAL — the rework, before and after

2026-10-08. The owner's six decisions of the day, the AI preference and
the brevity rules, built on `main-tnlcto` from `9aa23e7` and measured
again at the end with the same scripts as the baseline.

## How it was measured

- **Before:** `9aa23e7`, the baseline (`eval/baseline.md`).
- **After:** `5a32ffd`, a clean export of HEAD served the same way.
  `3634233` changes only the browser suite's server address, so the app
  measured is the app pushed.
- Same 23 addresses, at 390 × 844 (touch) and 1440 × 900. Light scheme.
  Page clock pinned to 2026-09-24, as the seeded data is September's.
- Same fake Supabase. `?aiwords` on every address, so the Coach's and
  Reports' AI words are the fake's. Typed charges end at the fake's
  refusal (PGRST202), after the same taps the real app takes.
- The scripts live in the session's scratch folder (`eval/*.mjs`), with
  `after.json` and `after.md` beside `baseline.md`. Changes to them:
  - Turn AI on follows the new path, Settings › AI › OpenRouter.
  - Settings' Budgets & goals and Account tabs are measured too. No
    baseline address reaches them.
  - The control list reads Settings' four tabs, not three screens.
- Tests: `vitest run`, one run, at `5a32ffd`. Browser suite: `pnpm e2e`,
  Node 22.23.

## Before and after

| | before | after |
|---|---:|---:|
| Set-up screens | 3: Setup, Settings, AI settings | 1: Settings, 4 tabs |
| Help articles | 32 | 12 |
| Help words | 9,838 | 1,658 |
| Longest Help article, words | 855 | 150 |
| Help sentences over 90 characters | 247 of 518 | 0 of 148 |
| Sentences over 90 characters on the screens, 390 · 1440 | 51 · 51 | 2 · 2 |
| …of them in a screen's first view, 390 · 1440 | not measured | 1 · 1 |
| Ledes over one line at 390 | not measured | 1 |
| Hints over 8 words | not measured | 0 |
| Words in the first view, all screens, 390 · 1440 | 2,118 · 3,867 | 1,948 · 3,394 |
| Words on the whole page, all screens, 390 · 1440 | 6,478 · 7,372 | 4,965 · 5,799 |
| Set-up words, whole page, 390 · 1440 | 1,127 · 1,211 | 943 · 1,053 |
| Controls, all screens, 390 · 1440 | 743 · 1,032 | 900 · 1,167 |
| axe violations · page errors, both widths | 0 · 0 | 0 · 0 |
| Unit and screen tests | 3,895 in 343 files, all pass | 3,937 in 346 files, all pass |
| Browser suite, `pnpm e2e` | none | 176 of 176 pass, here and on GitHub |
| Bug bash | none | 196 views × 2 engines, 21 flows each; 4 found, 4 fixed |

Read with care:

- **Controls rose** only because `#/settings` now opens Lists (234
  controls) where it opened the old cards screen (44). On every other
  address they fell: 33 fewer at 390, 54 at 1440.
- **Set-up words** add up Setup, Settings and AI settings before, and
  the four tabs after.
- **The two long sentences left** are quoted, not the app's own. One is
  a book's line on the Coach's quote card. The other is the fake
  helper's "one thing to try" on Reports, in the first view.
- **The one long lede** is the Forecast's first figure, four lines at
  390. It is the forecast sentence, not a lede (N173).
- **The browser suite** is 8 files on 2 targets. It passed 176 of 176
  here, and on GitHub for the first time at `3634233` (4 m 41 s).

### Taps from the Month

Taps, then fields typed and choices picked.

| Task | 390 before | 390 after | 1440 before | 1440 after |
|---|---|---|---|---|
| Set a category budget | 2 + 1 typed | 2 + 1 typed | 2 + 1 typed | 2 + 1 typed |
| Add a savings goal | 4 + 2 typed | 4 + 2 typed | 4 + 2 typed | 4 + 2 typed |
| Add a charge by hand | 3 + 2 typed + 1 picked | same | 3 + 2 typed + 1 picked | same |
| Add a charge, Just type it | 4 + 1 typed + 1 picked | same | 4 + 1 typed + 1 picked | same |
| Turn AI on (+1 on the key site) | 4 + 1 typed | 5 + 1 typed | 5 + 1 typed | 5 + 1 typed |

Turn AI on costs a phone one tap more. More had an AI settings row; now
it is More → Settings → AI. Accepted: one Settings screen is the owner's
decision 3. Settings opens the tab last seen, so the next visit is 4
taps again. Every "turn on AI" link in the app opens the AI tab itself.

### Words per screen

Words in the first view and on the whole page. One number means no
change. `setup` and `settings` both open Lists now; before, `settings`
was the old cards screen.

| Screen | first view 390 | whole page 390 | first view 1440 | whole page 1440 |
|---|---:|---:|---:|---:|
| month | 79 → 78 | 297 → 296 | 137 → 136 | 322 → 321 |
| week | 64 → 63 | 234 → 233 | 165 → 164 | 259 → 258 |
| paycheck | 108 → 111 | 302 → 298 | 198 → 208 | 326 → 322 |
| year | 54 → 53 | 187 → 186 | 129 → 128 | 519 → 518 |
| calendar | 84 | 168 → 167 | 134 | 171 → 170 |
| savings | 115 → 108 | 240 → 229 | 214 → 203 | 268 → 257 |
| debts | 119 → 108 | 309 → 286 | 224 → 204 | 337 → 314 |
| ledger | 77 | 204 | 106 | 233 |
| coach | 120 → 119 | 321 → 315 | 259 → 253 | 348 → 342 |
| checkin | 107 | 159 | 150 | 186 |
| ask | 61 → 51 | 61 → 51 | 88 → 78 | 88 → 78 |
| forecast | 82 | 351 | 147 | 378 |
| reports | 130 → 127 | 311 → 306 | 261 → 256 | 338 → 333 |
| review | 78 → 79 | 163 → 154 | 164 → 163 | 189 → 180 |
| add | 49 → 33 | 49 → 33 | 75 → 59 | 75 → 59 |
| setup (Lists) | 68 → 69 | 485 → 441 | 150 → 133 | 514 → 471 |
| settings | 71 → 69 | 342 → 441 | 218 → 133 | 369 → 471 |
| ai (AI tab) | 92 → 97 | 300 → 210 | 202 → 128 | 328 → 236 |
| help | 204 → 120 | 1,364 → 201 | 291 → 178 | 1,391 → 227 |
| article | 149 → 121 | 341 → 170 | 361 → 247 | 520 → 247 |
| start | 95 → 91 | 124 → 113 | 170 → 165 | 189 → 177 |
| more | 88 → 80 | 142 → 100 | — | — |
| signin | 24 → 21 | 24 → 21 | 24 → 21 | 24 → 21 |
| Budgets & goals tab (new) | 74 | 162 | 130 | 190 |
| Account tab (new) | 97 | 130 | 156 | 156 |

## The decisions and where they landed

| Decision (2026-10-08) | Where it landed |
|---|---|
| 1. Week · Month · Year; Paycheck its own screen under Plan | ADR 0014, PRD 01 (`01-plan-order.md`). The switch has three segments. Paycheck sits in the sidebar's Plan group beside Bill calendar, and under More on a phone. |
| 2. The Month opens | Unchanged: `HOME` is the Month (`nav.ts`). |
| 3. One Settings screen: Lists · Budgets & goals · AI · Account; sidebar group More: Settings, Help | ADR 0014 §2, PRD 02 (`02-one-settings.md`). The tab is in the address, and `#/setup` and `#/ai` open their tabs. The Setup screen and name are gone. |
| 4. No Meta Muse | ADR 0015, decision 4: no service joins the allowlist. Mistral was looked at and left out (N169). |
| 5. Help is about 12 short articles | PRD 03 (`03-brevity.md`). 12 articles, each 150 words or fewer, 1,658 in all. Tests hold both limits. |
| 6. Getting started is a first-run guide, opened from Help | PRD 02. It opens by itself once, at a new account's first sign-in. After that, only Help's Start here opens it. No Settings card. |
| AI: OpenRouter, Groq, then any fast free service | ADR 0015 and migration `0041_ai_free_order.sql`. Below. |
| Brevity everywhere | PRD 03. `short-sentences.test.ts` keeps every drawn sentence at 90 characters or fewer and every hint at 8 words or fewer. |
| Browser tests, then a bug bash | `04-e2e.md` (the suite, in CI as its own job) and `05-bug-bash.md` (4 fixes). |

## AI: the order and the models

Tried in this order until one answers: **OpenRouter, Groq, Google
Gemini**, then OpenAI and Anthropic only when **Use paid services** is
on. An order the owner never changed moves to this one with
`0041_ai_free_order.sql`; a changed order stays. The helper is version
**`2026-10-08.2`** (`VERSION`, `supabase/functions/ai/index.ts`).

Each service uses the first model on its list unless the owner picks
another. A photo goes to the first model on the list that reads one.

| Service | Models, in order (★ reads photos) |
|---|---|
| OpenRouter, free | ★ inkling-small, ★ gemma-4-26b-a4b-it, ★ gemma-4-31b-it, ★ inkling, ★ nemotron-3-nano-omni-30b-a3b-reasoning, nemotron-3-super-120b-a12b, ling-3.0-flash-sante, nemotron-3.5-lightning, then `openrouter/free` |
| Groq, free | gpt-oss-20b, gpt-oss-120b, ★ qwen3.8-27b |
| Google Gemini, free | ★ gemini-3.5-flash-lite, ★ gemini-3.1-flash-lite, ★ gemini-3.5-flash |
| OpenAI, paid | ★ gpt-5-nano, ★ gpt-5-mini |
| Anthropic, paid | ★ claude-haiku-4-5, ★ claude-sonnet-5 |

OpenRouter's ids end in `:free` and carry their maker's prefix. The app
(`packages/schema`) and the helper hold the same lists, and a contract
test keeps them equal. Nothing was timed against a live key. **Test** on
each service's row times one real call from the owner's own phone.

## Left

- **The owner's steps** (HANDOFF §3). Paste the updates `0015` to `0041`
  after a backup, `0041_ai_free_order.sql` last. Paste the AI helper:
  One-time updates shows ✓ once `2026-10-08.2` answers. Delete
  read-receipt. Then add a free OpenRouter key in Settings › AI and
  press **Test**. Nothing has touched the hosted project or a real AI
  service yet.
- **The browser suite on GitHub** failed on all five pushes from
  `9de9a7b` to `5a32ffd`. Each stopped at the 2-minute start-up wait
  (APP_UNREACHABLE), before any test ran. Vite listened on IPv6 alone;
  the runner waits on 127.0.0.1. Fixed in `3634233`, green since. It is
  not a required check; `gates` is.
- **N174:** the same bare name on each card's actions (Savings, Review,
  Coach, AI keys, the Month's "Show N empty"). Not a WCAG A or AA
  failure. Left recorded.
- **N173:** the Forecast's four-line first sentence at 390, and the
  160-character quote card.
- **N172:** Help's bold-name check reads comments. **N170** and
  **N175:** an ai-apps test and a Lists focus test each failed once under
  load, then passed. Neither timeout was raised.
- The suite cannot set dark mode or touch. The bug bash's scripts did;
  they live in the scratch folder, not the repository.
- These eval scripts also live in the scratch folder.
- GitHub warns that the CI actions target Node 20 (N1, pinned actions).
