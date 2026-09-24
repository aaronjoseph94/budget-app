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
