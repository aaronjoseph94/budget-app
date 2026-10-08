# Screen inventory (read from aaronjoseph94/budget-app@main, 2026-09-29)

## Shell — App.tsx
- Phone bar: Month(calendar) · Coach(sparkles, dot when check-in ready) · Add(plus, centre) · Review(inbox, count badge) · More(menu)
- Desktop bar (md+): Month · Week · Coach · Forecast · Reports · Savings · Debts · Review · Add · More. Switched views (week/year) light Month; everything else, Paycheck included since ADR 0014, lights More.
- Main: max-w-3xl, lg:max-w-7xl on month/week/paycheck/year/calendar. OfflineBanner "You're offline: figures may be out of date". Load error: Alert "Could not load your data" + Try again / Sign out / "Check the one-time updates".
- Every screen: HelpButton (?) beside title → HelpSheet with the screen's article.

## Month — MonthScreen.tsx, MonthSummary.tsx, MonthCharges.tsx, MonthCharts.tsx, MonthCoachLine.tsx, MonthForecastLine.tsx, BudgetEditor.tsx, StartEditor.tsx, PeriodSwitch.tsx
- PeriodSwitch: Week · Month · Year (3 links; Paycheck left the switch for its own screen, ADR 0014)
- Header: "September 2026"; buttons Bill calendar, Prev, Next, ?
- First run card: "New here? Getting started sets up your lists, pay, bills and goals one step at a time, a few minutes each." [Get started] [Open Setup]
- ReviewBanner: "Not filed yet: 3 from September waiting for review" + "— not counted below" | "{n} from other months waiting for review"
- Coach line (tap → Coach; ✨ when AI words)
- "Statement imported up to 18 Sep 2026" | "No statement imported yet."
- Summary: Start (tap → StartEditor; empty "Type your starting bank balance"), Spent, Left to spend (hint "No budgets on Variable expenses yet."; negative pink), End of month (empty "Shown once Start is typed")
  - Forecast line: "Forecast: about $5,100 by 30 Sep" + ⓘ → "End of month counts what has happened and your planned bills; the forecast adds pay still due and spending at your usual pace." link "Two month-end figures"
  - Last month: "By 24 Sep: $X spent · by 24 Aug: $Y" / "▲ $120.40 more (12%)" | before records: "Your records start on 8 Aug. Import the statement before that to compare with August."
- ThirdSwitch "Last column": [Left] [vs 1–24 Aug]
- 6 blocks (phone order Variable, Bills, Subscriptions, Debts, Income, Savings): heading, "$actual of $budget", change chip "▲ $X more"; columns Budgeted/Actual/Left (Income Goal/Actual; Savings Goal/Actual/Difference); tap budget cell → inline editor ($ input, "From this month on" | "Just this month", hint, Save / Cancel / Clear budget); "planned" under amount; negative Left pill; "Show N empty"; empty list "Nothing on this list yet. Add one in Setup"
- Charts: "Income against goals" bars; "Variable expenses by category" doughnut
- TransfersNote: "Paid to your card: $1,450.00 — not counted. What it paid for is already in the blocks above. See these charges"
- Charges sheet: title category, subtitle "Variable expenses · September 2026 · $286.40"; "Last month (same days): $X"; rows merchant / date (· added by hand) / "= 22 min toward Flight training" / amount; [Move to…] → select + "Always file SHOP here" + Move/Cancel; "Show all N"
- StartEditor: $ field, "Overdrawn: the account was below $0", "The bank balance you started September with. Each month has its own." Save/Cancel/Clear balance

## Week — WeekScreen.tsx, WeekBlocks.tsx, WeekGoal.tsx, WeekBudgetEditor.tsx
- Switch; header "This week" / "Week of" + ?; "21–27 Sep · 3 days left"; prev/next (next disabled on this week)
- Review: "3 waiting for review. They are not counted below until you approve them."
- Summary: Spent, Left to spend (hint "No weekly budgets on Variable expenses yet."); CompareLine "14–24 Sep: $X spent · …" / ▲▼
- GoalCard (main goal): icon plane/piggy, name, % badge, progress, "$X of $Y · $Z to go", "Save $X a week to get there by your date.", "This week's spending is 3 h 20 min of flight time." , "2 other goals" link. NoGoal: "No savings goal yet. Add a goal to see what each week needs to reach it."
- Six blocks, weekly budgets. TransfersNote.

## Paycheck — PaycheckScreen.tsx, PaycheckPeriod.tsx
- Switch; header "This pay period" + ?; "15–29 Sep · Income 1, paid every two weeks"; prev/next
- Summary (lavender): Spent, Left to spend (+ "No budgets on Variable expenses yet. They are typed on the Month."), CompareLine vs last pay period
- "How this period is counted": chooser "Pay periods from" select; "Bills with no charge yet in this period, and budgets and goals, are September 2026's. You are paid every two weeks, so each shows 12 months over 26 paydays: two weeks' share. Charges count as they are." "Budgets and goals are typed on the Month."
- Six blocks (no editors). NoSchedule: "This shows your budget one pay period at a time. It needs to know when you are paid: in Setup, give an Income row how often it pays and a first payday." [Open Setup]

## Year — YearScreen.tsx, YearGlance.tsx, YearCharts.tsx
- Switch; header "Year" + ?; "January 2026 to December 2026"; StartPicker "Starts in [January] [2026]"
- "Planned bills count up to September 2026, this month. Later months show only what was charged or typed."
- Review line "3 waiting for review — not counted below"
- Glance: "Hi, Aaron!"; Annual totals pie (Income/Expenses/Savings w/ shares); vs last year (Income/Spent/Saved: now · was · change); Left over ("Income, less expenses and savings"), Starting balance, Ending balance ("Not yet" + "Type January's starting balance on the Month to see these"); Biggest expense (name, amount); Best savings month (month, $ of goal); Top 3 expenses (ring + name + $ · %); Savings goals today (bars "$X of $Y"); Debts today (bars "$X left of $Y")
- Tables: phone chips Income · Expenses · Savings · Bills · Debts · Subscriptions · Variable → one table Month/Goal|Budgeted/Actual, current month highlighted, Total row. Desktop: YearTotals panel (Starting month, Current month, Total income, Total expenses, Total savings, Left over, Starting balance, Ending balance) + 7 tables + charts row.
- Charts: "Income and expenses by month" columns; "Annual totals" pie (desktop); "Against goals and budgets" grouped columns.

## Bill calendar — CalendarScreen.tsx, CalendarGrid.tsx
- Header "September 2026" / "Bill calendar"; pill "Due this month $2,832.46"; prev/next/?
- Phone: CompactGrid (S M T W T F S; day number, green circle on payday, dots per bill; legend "a bill due" "payday") + Agenda (per week: "1–5 Sep" + week total; day rows: weekday/number, "Income 1 payday" pill, bill name + amount + "planned"; "Nothing due.")
- Desktop: MonthGrid (Sunday…Saturday + Week column; day cells with payday pill + bills; italics = planned; caption "Bills and paydays by day, with each week's total. Amounts in italics are planned: nothing has been charged for them yet this month.")
- Undated: "No day paid" — "These have a monthly amount but no day paid, so they are not on the calendar or in its totals. The Month still counts them." [Add a day paid in Setup]
- Bill → charges sheet.

## Coach — CoachScreen.tsx, coach/CoachCards.tsx, GoalPace.tsx, GoalLever.tsx, QuoteCard.tsx, CoachStatus.tsx, CheckinLink.tsx, AskBox.tsx, WhySheet.tsx; words: packages/savings-coach/src/templates.ts
- Title "Coach" + ?
- CoachStatus line (xs muted): "In the app’s own words, from your records." | "✨ Words by AI (free Google Gemini) from your numbers. Every figure is the app’s own." | "The app’s own words. Turn on free AI (2 minutes)" ; [Refresh the AI’s words]
- DayLine (lg): "You’ve spent $84.10 less than by this day last month. Nice going!" (cheerleader) / watch: "…There’s still time to ease off."
- GoalsCard: plane icon + "Flight training"; ring % ; "41 h of 60 h" "of flight time"; "$6,150.00 saved of $9,000.00"; goal line "Every lighter week brings Flight training closer. Keep going!"; GoalPace "At your pace: Mar 2027 – May 2027" + chip "Based on 2 months"; "Most likely Apr 2027."; "To reach it by 1 Jun 2027: $94.00 a week."; lever box "Trim Restaurants by $60.00 a month to get there 3 weeks sooner. That’s 24 min of flight time a month." [What if… >]; "Your other goals" rows name, "$X of $Y", progress, "About Jan 2027"; link "All your goals on Savings". No goal: "No goal yet." "Add what you are saving for, and the Coach shows how far you have come." Add a goal
- CheckinLink: "Your Sunday check-in is ready ●" / "Your weekly check-in"; "The week of 21–27 Sep"
- Insight cards (≤3): title, body, tryThis (muted), [action button] + "Why am I seeing this?" + ✕ dismiss. Actions: Import a statement · Open Review · See the Month · See your goals · Open the Forecast · See your shops · See your habits. Empty: "Nothing needs your attention today. The Coach speaks up when a category moves more than it usually does, or a budget runs close."
  e.g. "Past the budget: Restaurants" / "$286.40 spent against a budget of $250.00, so $36.40 over." / "One thing to try: pause it for the rest of the month, or raise the budget if it was set too low."
  "A price went up: SPOTIFY" / "It now charges $11.99, up from $10.99. That comes to $143.88 a year."
  "Charges waiting for you" / "Waiting in Review: 3. Each one counts as soon as you file it."
- ForecastCard: "Where September is heading" / "At this pace, September ends near $5,120. Safe to spend: $58.30 a day." [Open the Forecast]
- QuoteCard: optional "A TIP" kicker; “quote”; byline "Author, Title (Year), p. 12" / "Advice from X: Title" / "Often attributed to X; not found in their own writing."; note
- AskBox: "✨ Ask anything about your money" input placeholder "e.g. coffee in August?" [Ask]
- WhySheet: title "Why am I seeing this?", subtitle card title; dl rows (So far this month, Same days last month, The difference, Budget, Over budget by…); reason sentence; "Worked out by the app from your own records. No AI was used."

## Check-in — CheckinScreen.tsx, coach/CheckinQuestions.tsx; words checkin-words.ts
- "← Coach"; "Your Sunday check-in" + ?; "The week of 21–27 Sep"
- Last week: "Last week you spent $412.30 on everyday things, $38.20 less than the week before. That left $27.70 of your weekly budgets." win (bold) "You kept within your weekly budgets. Well done!"
- Was it planned?: "Was THE KEG STEAKHOUSE, $121.40 on 22 Sep, planned?" [Planned][Impulse][Needed] (3-col); "Over the last 8 weeks you called 18% of 11 charges impulse." Empty: "No everyday charges of $20.00 or more to ask about last week."
- One thing to try: "Try keeping Restaurants under $60.00 next week." box "Keep Restaurants under $60.00 next week?" [Yes, set it] → "Done: Restaurants’s weekly budget is $60.00. It shows on the Week."
- Your goals: line + rows "Flight training 41 h of 60 h", "Emergency Fund $2,400.00 of $5,000.00"
- Whose words line.

## Forecast — ForecastScreen.tsx, forecast/Ahead.tsx, Goals.tsx, Months.tsx, WhatIf.tsx, parts.tsx
- Title + ?; Sentence (lg): forecast card body
- Safe to spend: "$58.30" (3xl) " a day for 7 days, today included"; "Pay from Side Hustle is not counted: give it a pay schedule in Setup, or a goal on the Month."; nothing_left: "Nothing left to spend safely this month, once your bills and savings are counted."
- End of September: "$4,980 to $5,260" + badge Range + badge "Based on 2 months"; "Most likely $5,120."; range bar (Today $5,405.12 … Most likely $5,120); "Still to come": Pay still due $2,250.00 · Bills not charged yet (already in Spent) $509.99 · Spending at your usual pace about $350 · Savings still planned $0.00 · Spent by the end of September about $5,390
- The next 30 days: "Today: $X. Tightest day ahead: 29 Sep, at $Y." balance line chart; "Counts $41.20 a day of everyday spending, your average over the last 30 days."; "Bills due in the next 7 days" rows date name amount ("Due, not seen yet"); "Leaves out $X you still plan to move to savings this month."
- When you’ll reach your goals: per goal GoalPace; "What if…" goal select; chips "Restaurants −25%" "Restaurants −10%" "Restaurants to your best month" "Groceries −25%"…; "Tap one to see what it changes." result: "Trim Restaurants by $62.50 a month ($14.42 a week)." "Flight training: Feb 2027 – Apr 2027, 4 weeks sooner." "That’s 25 min of flight time a month." "End of September: $5,040 to $5,320 with $62.50 kept this month."
- The next three months: badges; "Where each month ends, worst case to best case. Not a promise."; band bars Oct Nov Dec; table Pay / Bills / Everyday spending / Savings / Left over / Worst case end / Most likely end / Best case end
- Debt-free: "Debt-free by May 2034 on your payoff plan. Open Debts"
- NoStart: "Type this month’s starting balance to see where you’ll end. Open the Month"

## Reports — ReportsScreen.tsx, reports/Overview.tsx, ReviewCard.tsx, Trends.tsx, Shops.tsx, Subscriptions.tsx, SecondLook.tsx, Habits.tsx, Download.tsx; words report-words.ts
- Title + ?; month nav ‹ September 2026 › (next hidden on this month; hidden on Trends/Habits); tabs Overview · Trends · Shops · Habits; badge "So far"; [Save as PDF]
- Overview: "The month in review" — headline (lg) "A win on Groceries: $112.40 less than usual. Keep an eye on Restaurants: $64.10 more than usual."; points (bullets) "Spent so far $5,041.69. That is $84.10 less than by this day in August." "Saved so far $1,100.00, 15% of what came in." "Restaurants so far: $286.40, $64.10 more than usual by this day."; "One thing to try: Next month, try a weekly limit for Restaurants close to its usual, and check it each Sunday."; whose line "In the app’s own words. The AI reviews a month once it is over."
  "Income, Spent and Saved" — "1–24 Sep, against 1–24 Aug"; rows Income/Spent/Saved with lines "1–24 Aug: $X · $Y more", "Your usual month: …"; "You saved 15% of what came in."; "Your usual month is set beside a whole month, once this one is over."
  "Biggest changes" — More than usual / Less than usual rows name, amount, "$64.10 more than usual by this day ($222.30)"; "Against your usual month over the month before, Variable expenses only."
  "This month and last, by category" — paired bars + "Each row: 1–24 Sep, then 1–24 Aug." list
  "Download CSV" — "Keep this month in a spreadsheet: every charge, or the figures above. The file is made on this device." [Download charges] [Download summary]
- Trends: [6 months][12 months]; "Income, Spent and Saved" "The last 6 whole months, Mar 2026 to Aug 2026" lines chart + labels Rising steadily/Falling steadily/No clear trend/"Not enough months yet: check back in November 2026"; "Each category against its usual month" — "Variable expenses, month by month. The dashed line is your usual month." rows name / label / "Aug 2026 $X · usual $Y" + sparkline. Empty: "Nothing to draw yet: a trend starts from your first whole month of records."
- Shops: "Top shops" "1–24 Sep, against 1–24 Aug. Charges less refunds." rows shop / "4 charges · $66.30 more than August" / amount; "New this month" rows | "No new shops." | "Too early to tell: a shop is called new once your records reach 60 days before the month."
  "Subscriptions and regular charges" — "Charges that come at steady gaps for a steady amount. The next date is a guess from the gaps so far." rows shop [New] price / "Monthly · next about 9 Oct · $215.88 a year" / "Price went up from $10.99 to $11.99" [Not a subscription]
  "Worth a second look" — "Pointed out for you to check. Nothing is hidden, and every charge still counts in your totals." rows "Possible repeat charge: SHOP" detail + help; "Bigger than usual: SHOP"; "First charge from a new shop"; "Maybe counted twice" + Open All transactions
- Habits: "Your spending grid" — "Everyday spending (Variable expenses), each day of the last 7 weeks. Against $41.43 a day: your weekly budgets spread over the week." heat grid (Mon…Sun rows × weeks, 5 levels) + rows "Days with no everyday spending 9 of 49", "Days up to half the allowance", "…up to the allowance", "…up to one and a half times", "…over one and a half times"; details "Each week’s figures"
  "Weeks within budget" — "Your best run yet. Keep it going!"; In a row now 3 weeks; Your longest run 3 weeks; "A week counts when the Week’s Left to spend stays at $0.00 or more."; list "Week of 14 Sep: ✓ within budget, $27.70 left" / "✗ $12.40 over"
  "Which weekday costs most" — "Saturday costs most: $68.20 on average, over the last 6 whole weeks, 10 Aug to 20 Sep." weekday bars + "Each track is your daily allowance, $41.43."
  "Personal bests" — name / "$X in August 2026, your lowest in 3 whole months. Next lowest: $Y in June 2026." | "A best needs three whole months of records: check back in November 2026."

## Ask — AskScreen.tsx, ask/AnswerCard.tsx, ask/suggest.ts; catalogue packages/savings-coach/src/ask.ts
- Title + ?; "Ask about your money in your own words. The app works out every figure from your own records." (from Help: "About: {article}.")
- Input placeholder "e.g. coffee in August?" + [✨ Ask] (busy "Reading…")
- ReadByApp line: "AI is off, so the app read your question itself." | "The app read your question itself. Turn on free AI (2 minutes)" | "The AI is resting, so the app read your question itself. Why?"
- AnswerCard: "✨ I read that as: How much you spent · Restaurants · September 2026"; figure (3xl) "$286.40"; sentence; "1–24 Sep, against 1–24 Aug"; list rows; onward link "See it on the Month" / "Open Reports" / "Open the Forecast" / "Open Savings" / "Open Debts"; what-if AmountChip "A month’s saving $[50.00] From your question: change it to see another."
- Not answerable: "I can’t answer that from your figures yet. Try one of these:"; help answer card: article title, summary, "Open this article"
- "Try asking" chips: "How much did I spend this month?" "How much is safe to spend today?" "When will I reach my goal?" "Where did my money go last month?" (others: "Am I spending more than last month?" "What are my subscriptions?" "What if I saved $50 a month?" "When will I be debt-free?" "How did last month go?" "How much do I have left this week?" "Which shops did I spend most at this month?" "Where will this month end?")
- "Your last questions" list + [Clear these] + "Kept on this phone or computer only."

## Savings — SavingsScreen.tsx, GoalActions.tsx, FundEditor.tsx, AddGoalSheet.tsx
- Header "Savings goals" + ?; "Your goals: what each needs, and what to put in it each month to get there by its date."
- "Saved this month" card + CompareLine (saved)
- [+ Add a goal]
- Goal cards (main first): title (name) + badge "Main goal"/"Paused"/"Reached 12 Aug 2026"; "$6,150.00 saved of $9,000.00"; bar + %; "Amount needed" box $2,850.00 ("· goal reached"); Start date / Goal date / Months remaining / Monthly contribution; why-no-monthly ("No dates yet. Add a start date and a goal date to see what to save each month."); "$5,000.00 typed on 8 Aug 2026, and $1,150.00 moved in since."; "About 19 hours of flight time to go."; lever box "Trim Restaurants by $60.00 a month to get there 3 weeks sooner."; fund CompareLine; actions [Edit goal] [Make main goal] [↑][↓] / [Pause] [Mark as reached] [🗑 Remove] (remove confirm: "Remove X? Its fund stays on your Savings list, with everything filed under it." [Remove goal] [Keep it]; holds money → explanation)
- Loose goal: "On no savings fund yet, so money moved to savings does not count toward it." [Make it a fund]
- "Funds with no goal yet": card "No goal yet." [Set a goal] / [Use “X” for this fund]
- details "Reached and paused (2)"
- Empty: "Your Savings list has no funds yet. Each fund on it gets a card here." [Add funds in Setup]

## Debts — DebtsScreen.tsx, DebtStrategies.tsx, DebtEditor.tsx, DebtExtras.tsx
- Banner "Debt payoff" + ?; "These are the loans and card balances you are paying down, to plan when each is paid off; they are separate from the Month’s Debts list, which counts the payments you make each month." + xs "A card you pay off from your bank can go here too, but give it no monthly amount on the Month’s Debts list: what you bought on it is already counted there."
- Alert per never-paid-off: "X is never paid off" — "Its minimum payment does not cover its interest, so its balance never goes down. Raise its minimum to plan it."
- Summary: Current debt total $21,733.00 · Debt-free by May 2034 · Paid this month $775.00 · Payoff progress 18% ($3,912.00 of $21,733.00) + ring; "End of August: $X" "▼ $612.40 less (3%)"
- Debt cards: name (title face); Balance today; "▼ $X less than at the end of August"; ring; Starting balance / APR / Minimum payment / Paid off in; [Edit]
- [Add a debt]
- "Ways to pay it off" — "The same amount each month, spent three ways: what you pay now, plus what a paid-off debt frees up." Minimums only / Snowball / Avalanche: Debt-free by, Interest paid, how
- Editor sheet includes Extra payments: "A one-off payment on top of the minimum, in the month you make it." rows month/amount/Remove; Month + Extra ($) + Add

## Add — AddScreen.tsx, add/JustTypeIt.tsx, ImportScreen.tsx (CSV mapping)
- Title "Add" + ?; "A statement from your bank, a receipt photo, or one by hand: cash, pay or a move to savings."
- Segmented tabs: [file] Statement · [camera] Photo · [pencil] Type it
- Statement picker (dashed): upload icon, "Choose a statement", "PDF or CSV from your bank", xs "Read on this device. The file itself is never uploaded." | "Reading statement.pdf…"
- PDF preview: file name + [Choose another]; card "Statement · 19 Aug 2026 – 18 Sep 2026" / "42 transactions" + badge "✓ Matches your statement" | "Does not add up"; tiles Purchases $2,418.55 · Payments & credits $1,450.00; alert (bad) "Nothing will be imported from this file" + discrepancy lines; "3 rows could not be read" "They will be recorded so nothing goes missing silently."; [Import 42 transactions] (lg, full); outcome "12 filed automatically from your past choices, 30 waiting for review." [Go to review]; xs "Merchants you have filed before go straight in. New ones wait for you in Review."; preview list date / merchant / amount
- Photo: dashed "Take or choose a receipt photo" "Flat, in good light, with the total visible" xs privacy note "The photo goes only to an AI service that reads photos, such as free Google Gemini, and is not stored. A free service may use it to improve its products."; after: thumbnail + badge "✨ Read by free Google Gemini" "Check each field before sending." [Use another photo]; form Where / Total spent / Date; [Send to review]; "For cash. A card purchase also on your statement would count twice."; outcome "Sent to Review. Pick a category there and it counts."
- Type it: "✨ Just type it" input "e.g. coffee 4.50 yesterday" [Fill in]; hint "Say what, how much and when; “got paid 2100” is money in. Nothing is added until you press Add." / "✨ The AI filled in the rest. Check each field, then press Add."; divider; segmented radio ✓ I spent | I received; "Every field is needed."; Amount (0.00) + "✨ Read by AI: check it"; What was it? (e.g. Farmers market); Date | Category (Choose…, groups, + New…); new: New category name | On the list; [Add] (lg); "Still needed: an amount and a category."; outcome "Added $4.50 — Coffee."; xs "For what a card statement never shows: cash, pay and moves to savings. A card purchase typed here and later imported from your statement would count twice."

## Review — ReviewScreen.tsx, review/SuggestBar.tsx, review/ApproveAll.tsx
- Title + ?; "3 waiting for a category. Nothing reaches your budget until you approve it." | "Nothing waiting."
- SuggestBar: line + [✨ Suggest categories]; "✨ Asking the AI to suggest categories…" / "✨ Suggested a category for 2 rows. Check each before you approve it." / "Turn on free AI to have categories suggested. Turn on free AI (2 minutes)"
- [Approve these 3] → card "Approve these 3?" "Each goes into your budget under the category shown. Change any row below first if it is wrong." list shop → category; [Approve all 3] [Cancel]
- Notes: "Added. Future charges from this merchant will be filed the same way automatically." | "Removed from the queue. It will not be counted." | "Filed 3. Future charges from these shops will be filed the same way automatically."
- Row card: merchant (raw), date, amount; select "Choose a category…" (groups) + "+ New category…" (→ name input "Category name, e.g. Groceries" + Which list?); [✓ Approve] [✕] ("Not a real transaction — remove"); hint: badge "✨ Suggested" "How you filed this merchant last time." | badge "✨ Suggested: Clothing" "By AI from the shop’s name. Check it." [Not this] | "You filed a similar shop under Restaurants."
- Paging: [Show the next 25] "Showing the oldest 25 of 240. Approve some and the rest will load."
- Empty: check icon "All caught up" "Import a statement and anything it finds that you have not categorised before will wait here." [See this month]
- Unreadable: alert icon "2 lines could not be read" + explanation "These were left out of your budget. Find each one on the statement, and if it is a real charge, add it yourself with Add, then Type it. Dismiss a line once you have dealt with it. A PDF statement's rows are counted from its first transaction."; batch "Card statement (PDF) · imported 19 Sep 2026"; rows "Row 14" reason [Dismiss]

## All transactions — LedgerScreen.tsx
- Title "All transactions" + ?; "September 2026"; prev/next
- Tiles Money out $X · Money in $Y (income colour); xs "Every row as it is, card payments and savings moves included. The Month counts spending by list."
- Search "Search merchant or category"
- Day groups (uppercase date) → card rows: merchant, category badge, "added by hand", amount, trash → [Remove]
- Empty: list icon "Nothing this month" "Approved transactions appear here." | "No matches" "Try a different word."

## Setup — SetupScreen.tsx, SetupPlans.tsx, SetupPay.tsx
- Teal band: "‹ More"; "Start here!" + ?; "My name is [your first name]" (underlined input, ✓ saved)
- Starter card (<20 categories): "Fill your lists with example names — Rent, Groceries, Netflix and the rest — plus Card payments and Card interest & fees for your statement. Names you already have stay as they are." [Use the starter list] → success "Added 31 example names" "They are placeholders. Rename each one… None of them has an amount."
- Sections (label in teal): Income [💵 Source — "What type of income do you receive?"; rows + pay fields (how often, first payday)] · Savings ["What are your savings goals?"] · Recurring expenses [🏠 Bills "What bills do you pay each month? Their amounts usually stay the same."; 💳 Debts "What loans are you paying off from the bank? A card you pay off from your bank is not a monthly debt payment here — its purchases are already counted."; 💻 Subscriptions "What are you subscribed to? A statement shows them."; rows with Day paid + Monthly amount columns (from this month on); total tile per card "Bills total" etc.; "Fixed monthly bills" tile + "Bills, debts and subscriptions together, in September 2026."] · Variable expenses ["What transactions have varied amounts?"] · Not spending ["Money that only moves, like paying off your card. Never counted as spending or income."]
- Category row: inline rename input, ↑ ↓, move-to-list (icon over native select "Move to…"), trash. Empty "Nothing here yet." Add row: input "Add to Bills" [+ Add]
- Nudge on a row: "Looks like a monthly bill" (bill-nudges)

## Settings — SettingsScreen.tsx, LearnedShops.tsx
- Title + ?; "Budgets, your savings goals, and your account."
- Getting started card: progress line ("Step 4 of 9 done"-ish) [✓ Open Getting started]
- Your lists: "Your name, and which list each category is on." [Open Setup]
- Weekly budgets: "A limit per category, per week, on the lists the Week counts as spending. Leave one blank for no limit." groups (VARIABLE EXPENSES, BILLS…) rows name + $ input "No limit" (✓ saved); add: New category + list select + [+ Add]; "Budgets save when you leave the field."
- Your savings goals: "3 goals. Your main goal is Flight training, which the Coach and the Week show." [Open Savings]
- Learned shops card "Shops filed by themselves" — "Each shop you have approved or moved with “Always file” is filed the same way from then on. Forget one and its next charge waits in Review again. Charges already filed stay where they are." rows SHOP / category [Forget]; "Show all 42"; note "Forgotten. The next charge from SHOP waits in Review for a category."
- Account: email; [Sign out]

## AI settings — AiSettingsScreen.tsx, ai/KeyCard.tsx, ai/ChoicesPanel.tsx, ai/CoachPanel.tsx
- Title + ?; status card: "AI is on, using free Google Gemini." (lg) link "Show me how" / "Open One-time updates"; [Check again]
- Gemini KeyCard: title "Free Google Gemini" chip "Recommended"; saved: "Your key ending …abcd is saved." | "Already on, with your receipts key ending …abcd. There is nothing to paste." | new: "Free, and about 2 minutes. A key is a password Google gives you for the app to use."; steps: Step 1 [Get a free key ↗] "Google AI Studio opens in a new tab. Press Create API key, then copy it."; Step 2: paste it here [password input][Show]; Step 3 [Save & test]; result "Works · key ending …abcd"; details "Paste a different key"; [Check which models work] [Remove key]; Model select + "The first on the list is the app’s everyday choice: quick, and the most free uses a day."
- Other cards: Groq (Free) "Free, and quick. Free services may keep what they are sent, and people there may read it."; OpenRouter (Free); OpenAI (Paid) "Paid: OpenAI bills you for each use. Tried only when Use paid services is on."; Anthropic (Paid) "More AI services: Groq, OpenRouter, and paid ones" — "Optional. When Gemini is busy or out of free uses, the next service with a key answers instead."
- ChoicesPanel: "Try in this order" list "1. Google Gemini [Free]" / "Key ending …abcd works" ↑↓; "When one is busy or out of free uses, the next is asked."; card switch "Use paid services" + "Off: OpenAI and Anthropic are never asked, even with a key saved, so nothing is billed."; card "Daily limit" select "40 AI calls a day" + "Today: 0 of 40. Resets overnight. Past the limit, the app uses its own words until tomorrow."
- CoachPanel "How the Coach talks": radios Cheerleader "A win first, then one thing to try. Never shaming." / Straight talker "Says it plainly, and still gives one thing to try."; switch "Share shop names with the AI" + "On: when the Coach speaks of a shop, or Review asks for a category, the AI sees its name, with long numbers hidden. It never sees an amount or a date."; link "What the AI sees"

## Help — HelpScreen.tsx, help/HelpSheet.tsx, help/UpdatesPanel.tsx, help/ArticleBody.tsx, help/articles.ts, help/HelpButton.tsx
- Index: "Help" / "Short answers, one step at a time."; search "Search help, such as “budget”"; list rows title + summary + chevron. Titles: Start here · One-time updates · Week, Month and Year · Bring in a statement · Why things wait in Review · Add: a statement, a photo, or type it · Budgets and bills · Savings and your goals · Add a savings goal · Debts · What the Coach does, and never does · The Sunday check-in · How the forecast works · Two month-end figures · Reports and trends · Comparisons with last month · Ask about your money · Turn on free AI · More AI services, paid ones too · What the AI sees, and how the Coach talks · Why the AI sometimes rests · Why does a number look wrong? · Messages with a code in brackets · Put it on your iPhone · Words the app uses
- Article: "‹ Help"; title; (updates: UpdatesPanel first); body (what it is + numbered steps); card "You’re done when…"; card "Stuck?"; "Related" pills
- UpdatesPanel: "4 of 6 in" / "All done"; rows ✓/✗ mono filename + what it adds; next box "Next: paste 0016_ai_foundation.sql, then each file after it in number order, one at a time." [Copy] link "Open 0016_ai_foundation.sql on GitHub"; helper steps list; [Check again]
- HelpSheet (from each ?): sheet title = article; body; [Show me] (primary full); [✨ Ask about this] (outline full)

## Getting started — GettingStartedScreen.tsx, start/steps.ts, start/StepBody.tsx, start/ProgressLine.tsx, start/Finish.tsx
- Title + ?; "Step 3 of 9 · about 1 minute"; 9 segment bar (done filled, current ringed)
- Step title (2xl), why (muted), check line "✓ Done" | "Not done yet" | "Can’t check this yet"; the step's real control (Setup cards, name field, statement picker, balance editor, AI key card, iPhone steps + "It’s on my home screen")
- [Continue]/[Finish] (lg) + [Do this later] (ghost); "Nothing breaks if you stop here. You can come back any time from More."; details "All 9 steps · 3 done" list ✓/·/? + "Later"
- Steps: Your name (under a minute) · Your lists (about 2 minutes) · When you’re paid (about 1 minute) · Your bills (about 3 minutes) · Your savings goals (about 2 minutes) · Your first statement (about 5 minutes) · This month’s starting balance (about 1 minute) · Turn on free AI (under 2 minutes) · Put it on your iPhone (about 1 minute); why lines in start/steps.ts
- End: "6 of 9 done" + "Everything you set up is working now. The rest can wait: the app works with what it has, and says what it is missing." list of left + "Open the Month"; Finish: paper plane flies in
- More row hint: "5 of 9 done" / "All done"

## Sign in — auth.tsx
- "Budget" / "Your statements and your spending, visible only to you."; card: EMAIL ADDRESS (you@example.com), PASSWORD; [Sign in] + "Email me a link instead"; link mode [Email me a link] + xs "Emailed links are limited to a few per hour on this project’s mail settings. A password has no such limit."; sent: "CHECK YOUR EMAIL" "A sign-in link is on its way to X. Open it on this device, in this same browser, and you are in…" [Back]; refused link alert "That sign-in link only works once, and only in the browser that asked for it. Ask for a new link here, or use your password."

## More — MoreScreen.tsx
- "More" + ?; groups Plan (Paycheck wallet "Your budget one pay period at a time"; Bill calendar bills "What is due each day of the month, and paydays"; Year year "Twelve months at a glance, from any month"; Savings piggy "Each fund, what it needs, and what to save a month"; Debts card "Each loan and card balance, and when it is paid off"; Forecast trend "Where this month is heading, and safe to spend") · Understand (Reports report "The month in review, trends and shops"; Ask sparkles "A question about your money, in your own words") · Set up and help (Getting started check "5 of 9 done"; Setup list "Your name, and your lists"; AI settings sparkles "Turn on free AI, and choose services"; Settings settings "Weekly budgets, your savings goals, signing out"; Help help "How each screen works, and what to do next") · Records (All transactions file "Every approved charge and payment")
