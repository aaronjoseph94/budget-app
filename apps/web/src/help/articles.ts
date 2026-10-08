/**
 * Help's articles (plan §8.2): committed words, drawn as text and lists.
 *
 * Every article follows one pattern, so the owner always knows where to
 * look: one line on what it is, numbered steps with the exact button names
 * in bold, "You're done when…", and "Stuck?". A step holds one action. The
 * only formatting is `**Button name**`, which `boldParts` splits out; the
 * screen draws each part as text, so nothing here is ever read as markup.
 *
 * Kept out of the first load: the ? beside each title and the Help screen
 * load this file when opened. Which article each screen's ? opens is
 * `SCREEN_HELP` in screen-help.ts, so the button itself carries no article text.
 */
import type { HelpTopic } from './topics.js'

export interface Article {
  readonly id: HelpTopic
  readonly title: string
  /** One line on what this is. */
  readonly summary: string
  /** One action each, with the button to press in `**bold**`. */
  readonly steps: readonly string[]
  /** Finishes "You're done when…". */
  readonly done: string
  /** What to do when a step does not work. */
  readonly stuck: string
  /** Other articles worth reading next, by id. */
  readonly related: readonly HelpTopic[]
  /** A short list of words and what they mean, for the articles that explain words. */
  readonly terms?: readonly { readonly term: string; readonly meaning: string }[]
}

export interface TextPart {
  readonly text: string
  readonly bold: boolean
}

/**
 * A step split into plain and bold parts at each `**`. An unpaired `**` is
 * kept as the two characters, so a typing slip shows rather than bolding
 * the rest of the step.
 */
export function boldParts(text: string): TextPart[] {
  const pieces = text.split('**')
  if (pieces.length % 2 === 0) return [{ text, bold: false }]
  return pieces.map((piece, i) => ({ text: piece, bold: i % 2 === 1 })).filter((p) => p.text !== '')
}

export const ARTICLES: readonly Article[] = [
  {
    id: 'start',
    title: 'Start here',
    summary: 'Getting started sets the app up in nine short steps.',
    steps: [
      'Press **Open Getting started**, above.',
      'Do what the step shows, then press **Continue**.',
      'Press **Do this later** to put a step off; it moves to the end.',
      'Tap any step in **All 9 steps** to jump to it.',
      'Come back from **Help** any time; this page says how many are done.',
    ],
    done: 'Getting started says “Your coach is ready”.',
    stuck:
      'Do the steps you can and leave the rest. A step that says it can’t be checked yet could not be read just now. If it keeps saying so, open One-time updates.',
    related: ['getting-around', 'add', 'updates'],
  },
  {
    id: 'getting-around',
    title: 'Getting around',
    summary: 'Five buttons along the bottom on a phone; a sidebar on a computer.',
    steps: [
      'On a phone, use **Month**, **Coach**, **Add**, **Review** and **More**.',
      'On a computer, open a sidebar group: **Plan**, **Money**, **Coach**, **Inbox**, **More**.',
      'Tap **Week**, **Month** or **Year** in the switch at the top.',
      'Open **Paycheck** under Plan, or under **More** on a phone.',
      'Use the arrows by the period’s name to step back or forward.',
      'Press **Search or jump to…**, or ⌘K, to search Help.',
    ],
    done: 'you can reach every screen and step back a month.',
    stuck:
      'Paycheck needs **How often** and **First payday** on an Income row in **Lists**. Empty rows fold away: press **Show 3 empty**. A narrow sidebar shows icons only: point at one for its name.',
    related: ['start', 'budgets', 'coach'],
    terms: [
      { term: 'Budgeted, Actual, Left', meaning: 'What you planned, what happened, and the difference.' },
      { term: '% pill', meaning: 'What a list has spent of its budget, on the list’s head.' },
    ],
  },
  {
    id: 'updates',
    title: 'One-time updates',
    summary:
      'Some parts of the app need a one-time update pasted into Supabase, where your budget is kept online, or a setting changed there. This page checks which are in, names the next one, and gives you a Copy button for it. The line at the top says how many are in; the rest take about 35 minutes, once, easiest on a computer. Until they are in, everything that worked before still works, and nothing breaks if you stop part way.',
    steps: [
      'Open Supabase in a new tab and choose your project.',
      'Press **SQL Editor**, then **New query**.',
      'On this page, press the **Copy** button under Next, which names what it copies.',
      'Paste it into the new query, press **Run**, and wait for Success.',
      'Press **Check again** here, and do the next one the same way.',
      'For the AI helper, press **Edge Functions**, **Deploy a new function** and **Via Editor**, name it ai, and paste what **Copy** gives you over everything there.',
      'For the helper’s switch, the signing key, sign-in for AI apps and the AI apps server, do the clicks this page lists under each, then press **Check again**.',
      'Last, open **Settings**, then **AI**, and turn on free AI, in about 2 minutes.',
    ],
    done: 'this page says "All done", and Settings › AI says AI is on.',
    stuck:
      'If Supabase says anything other than Success, stop there: nothing is lost, and the message names the line. A file already pasted is refused with nothing changed, or runs again to the same result, so pasting one again does no harm. The AI helper needs no new secrets: the receipts key is used again if you set one. The signing key, sign-in for AI apps and the AI apps server are for connecting Claude or ChatGPT; until they are done, this page names them next and the rest of the app works. If the signing key still shows after you changed it, sign out and back in, so your sign-in is made with the new key. If **Edge Functions** lists read-receipt, paste its new version over it or delete it: an older copy lets anyone with the app’s public key use your Gemini key. Updates from before this version are copied from GitHub, as the setup guide says; the Copy buttons carry only the newest ones.',
    related: ['start', 'free-ai', 'ai-apps', 'codes'],
  },
  {
    id: 'statements',
    title: 'Bring in a statement',
    summary:
      'Your card statement brings in most of your spending at once. Download it from your bank as a PDF or a CSV file first. About 3 minutes.',
    steps: [
      'Open **Add**: the middle button along the bottom on a phone, or **Add** at the top right on a computer.',
      'Choose the **Statement** tab.',
      'Press **Choose a statement** and pick the file you downloaded.',
      'Check the rows it read, then press **Import 42 transactions** for a PDF, or **Send 42 to the review queue** for a CSV (with your own number).',
      'Open **Review** to give the new rows their categories; after a PDF, **Go to review** takes you there.',
    ],
    done: 'Review lists the new rows, and a statement you bring in again adds nothing twice.',
    stuck:
      'If the app says it could not read the file, try the other format your bank offers (PDF or CSV). **This file has no transactions** means it is empty or has only a heading row: download it again for dates with charges in them. **This is not a text CSV** means the file is something else with a .csv name, such as a spreadsheet: download or save it as CSV again. A CSV that writes amounts like 4,50, common in Europe, needs **Semicolon** under **Column separator** and **Comma** under **Decimal mark**. Lines it could not read wait at the bottom of Review with the reason. If it says **Does not add up**, the rows it read do not match the statement’s printed totals, so nothing is imported: try the CSV instead. A charge you removed from All transactions comes back to Review, not to your totals, if you bring in that statement again: reject it there to keep it out. If the same charge comes in twice in different shapes (a PDF statement and a CSV of the same card, or a receipt photo and then the statement), the second copy waits in Review rather than going into your totals: reject it there.',
    related: ['review', 'add', 'wrong-number'],
  },
  {
    id: 'review',
    title: 'Why things wait in Review',
    summary:
      'Nothing reaches your budget until you approve it. Every imported row waits here for its category, so a wrong guess never counts by itself.',
    steps: [
      'Open **Review**.',
      'At the top, **Suggested changes** lists what an AI app you connected suggested: press **Apply** or **Dismiss** on each (Let Claude or ChatGPT review your budget).',
      'Check the category on each row: **✨ Suggested: …** with “By AI” is the AI’s guess; **Suggested** with “How you filed this merchant last time” is your own rule; “You filed a similar shop under …” is a shop like it.',
      'Choose another category where the pick is wrong, or press **Not this** to clear the AI’s guess.',
      'Press **Approve** on a row, or **Approve these 12** (with your own number), check the list it shows, and press **Approve all 12**.',
      'For a row that is not a real charge, press the **✕** beside it.',
      'At the bottom, press **Dismiss** on a line the reader could not read once you have typed it yourself.',
    ],
    done: 'Review says "Nothing waiting." A shop you approved once is filed the same way next time, without waiting.',
    stuck:
      'If a shop keeps landing in the wrong place, move one of its charges from the Month with **Move to…** and leave **Always file** ticked. With free AI on, categories are suggested by themselves after an import; press **Suggest categories** to ask again, and the line beside it says if something is missing, such as a one-time update. The AI is sent each shop’s name, whether it was money in or out, and whether it was small, medium or large, never the amount or the date, and nothing it suggests counts until you approve it. Turn off **Share shop names** in AI settings to send nothing. To stop a shop filing itself, press **Forget** beside it under **Shops filed by themselves** in Settings.',
    related: ['statements', 'add', 'ai-review', 'wrong-number'],
  },
  {
    id: 'add',
    title: 'Add: a statement, a photo, or type it',
    summary: 'Three ways to put money in: a statement from your bank, a receipt photo, or one entry typed by hand.',
    steps: [
      'Open **Add**: the middle button along the bottom on a phone, or **Add** at the top right on a computer.',
      'For a receipt, choose **Photo**, then **Take or choose a receipt photo**.',
      'Check what it read, then press **Send to review**.',
      'For cash, pay or a move to savings, choose **Type it**.',
      'Choose **I spent** for cash or a move into a savings fund, or **I received** for pay.',
      'Under **Just type it**, write it the way you would say it, such as “coffee 4.50 yesterday” or “got paid 2100”, and press **Fill in**.',
      'Check each field, fill in anything left empty, then press **Add**.',
    ],
    done: 'a photo waits in Review, and a typed entry shows on the Month on its date.',
    stuck:
      'A photo is read by your first AI service that reads photos: free Google Gemini, or OpenAI or Anthropic once **Use paid services** is on; Groq and OpenRouter are never sent one. Before the AI helper is installed, the older receipt reader is used (see One-time updates). You can always type the receipt instead. Once a photo is sent, its fields are locked: to correct one, reject it in Review, then send the photo again. **Just type it** reads what it can by itself; with free AI on, the AI fills in the rest, but only an amount you actually typed, marked “Read by AI: check it”. What you typed, today’s date and your category names are sent to the AI, nothing else. Two numbers, such as “3 coffees 12”, leave the amount for you or the AI; a date with slashes is left for you, since 9/10 can be either month. Nothing is added until you press **Add**.',
    related: ['statements', 'review', 'updates'],
  },
  {
    id: 'budgets',
    title: 'Budgets and bills',
    summary:
      'A budget is what you plan to spend on something. A bill has a monthly amount and a day it is paid, and counts as planned until the real charge arrives.',
    steps: [
      'On the **Month**, tap a row’s Budgeted figure.',
      'Type the amount, choose **From this month on** or **Just this month**, and press **Save**.',
      'For a bill, open **Settings**, then **Lists**, and type its **Monthly amount**.',
      'Choose its **Day paid**.',
      'To see every bill by its day, press the calendar button beside the month arrows, or open **Bill calendar**.',
      'For weekly budgets, tap one on the **Week**, or open **Settings** (on a phone, under **More**) and type them under **Weekly budgets**.',
    ],
    done: 'each list’s head shows what it spent of its budget with a % pill, each row shows Budgeted, Actual and Left, and the Bill calendar shows your bills on their days.',
    stuck:
      'A bill with no charge yet this month counts its planned amount. When the real charge comes in, it takes the planned amount’s place, so it is never counted twice. With no budget typed, a bill’s planned amount is its budget, marked planned, so a bill paid as planned is 100% and 0.00 left; a budget you type, even $0.00, is used instead. When a shop charges a Bills, Debts or Subscriptions row every month and that row has no monthly amount, Lists says **Looks like a monthly bill: add it?** Press **Fill it in**, check the day and the amount, then press **Save**; nothing is saved until you do.',
    related: ['getting-around', 'lists', 'wrong-number', 'start'],
  },
  {
    id: 'lists',
    title: 'Your lists and categories',
    summary:
      'Lists, under Settings, holds your name and your categories, each on one list: Income, Savings, Bills, Debts, Subscriptions, Variable expenses, and Not spending for money that only moves, such as paying off your card.',
    steps: [
      'Open **Settings**, then **Lists**.',
      'Type your name after **My name is**.',
      'With few categories yet, press **Use the starter list** for example names to rename.',
      'To add a category, type its name in the box at the bottom of a list and press **Add**.',
      'To rename one, type over its name, and a tick shows it is saved.',
      'Use the up and down arrows to change its place, the button with two arrows, one each way, to move it to another list, and the bin to remove it.',
      'On Bills, Debts and Subscriptions, type the **Day paid** and **Monthly amount**; on Income, choose **How often** and a **First payday**.',
    ],
    done: 'each category sits on the list it belongs to, and **Fixed monthly bills** shows what your bills come to.',
    stuck:
      'A card you pay off from your bank belongs on Not spending, since what you bought on it is already counted. A category with a monthly amount stays on its list until you press **Stop** under it. A category that still has charges cannot be removed: on the Month, tap its row and use **Move to…** on each charge first. When a shop charges a row every month, Lists says **Looks like a monthly bill: add it?**; press **Fill it in**, check the day and the amount, then press **Save**.',
    related: ['budgets', 'getting-around', 'start'],
  },
  {
    id: 'savings',
    title: 'Savings and your goals',
    summary:
      'Each goal has a fund, a category on your Savings list, and money you move into the fund counts toward the goal. Your main goal is the one the Coach and the Week show.',
    steps: [
      'Open **Savings** (on a phone, under **More**).',
      'Read each goal’s card: what is saved, what is left, what to save a month, and one thing to trim to get there sooner.',
      'Press **Edit goal** to change its name, target, what is saved, or its dates.',
      'Press **Remove** (or **Remove…** inside Edit goal) to delete a goal that has nothing saved in it; its fund stays on your Savings list.',
      'Press **Make main goal** on the goal you want the Coach and the Week to show.',
      'Press the up and down arrows on a goal to put your goals in the order you like.',
      'Press **Pause** on a goal you are putting aside, or **Mark as reached** when it is done.',
      'Each time you move money into a fund, record it on **Add** under **Type it** as **I spent**, filed under that fund.',
    ],
    done: 'your main goal is first on Savings, and the Coach and the Week show it.',
    stuck:
      'If the saved amount looks low, check that each move into the fund was recorded under that fund, and not as spending. A goal that still holds money cannot be removed: set Saved today to 0 and save first, or pause it or mark it reached. Paused and reached goals are folded away under Reached and paused, at the bottom of Savings, where Resume brings one back. When your main goal has a cost an hour, a spending charge opened from the Month also says what it cost in that goal’s time.',
    related: ['goals', 'coach', 'comparisons', 'budgets'],
  },
  {
    id: 'goals',
    title: 'Add a savings goal',
    summary:
      'Save for anything, not only flying: a trip, a car, a rainy-day fund. Each goal gets its own fund on your Savings list. About 2 minutes.',
    steps: [
      'Open **Savings** (on a phone, under **More**).',
      'Press **Add a goal**.',
      'Type the goal’s name and its target.',
      'Type what is saved already and a target date, if you have them.',
      'Under **Show progress in**, choose **Dollars**, or **Hours** with what an hour costs.',
      'Press **Add goal**.',
    ],
    done: 'the goal has its own card on Savings, and its fund is on your Savings list.',
    stuck:
      'A name already used on another list, such as Bills, cannot be a goal’s fund: use another name, or move that category to Savings in Lists. Money you move into the fund after today adds to the goal. Nothing breaks if you stop part way.',
    related: ['savings', 'coach'],
  },
  {
    id: 'debts',
    title: 'Debts',
    summary:
      'The loans and card balances you are paying down, and when each is paid off. These are separate from the Month’s Debts list, which counts each month’s payments.',
    steps: [
      'Open **Debts** (on a phone, under **More**).',
      'Press **Add a debt**.',
      'Type its name, **Starting balance**, the **As of** month, **Minimum payment** and **APR**.',
      'Press **Save debt**.',
      'Read **Ways to pay it off** to see how much sooner Snowball or Avalanche finishes than minimums only.',
    ],
    done: 'each debt shows when it is paid off, and the summary shows the date you are debt-free.',
    stuck:
      'An estimate is fine: the balance is as of the **As of** month. Press **Edit** on a debt to fix a figure, or to add one under **Extra payments**.',
    related: ['budgets', 'comparisons'],
  },
  {
    id: 'coach',
    title: 'What the Coach does, and never does',
    summary:
      'The Coach reads your own records and tells you, in plain words, how the month is going, what changed, when you will reach your goals, and what to trim to get there sooner. With free AI on, the AI writes the words; your own records write every figure.',
    steps: [
      'Open **Coach**, and read the small line under the title, which says whose words these are and offers **Refresh the AI’s words** when today has changed.',
      'Read the line at the top: how your spending compares with the same days last month, or last week.',
      'Read your main goal’s card: what is saved, when you will get there at your own pace, and one thing to trim to get there sooner.',
      'Read the cards under it: at most three, the most important first, each with one thing to try.',
      'Press a card’s button, such as **See the Month** or **See your goals**, to act on it.',
      'Press **Why am I seeing this?** to see the figures behind a card.',
      'Press **✕** on a card you have seen enough of, and it stays gone until something new happens.',
      'Read the quote or tip at the bottom, picked for what your day is about, and type a question in **Ask anything about your money** under it.',
    ],
    done: 'you have read the line, your goals’ dates and the cards, and you know why each one is there.',
    stuck:
      'Words marked ✨ were written by AI. The AI is never sent an amount, a balance or a date: it writes around blanks, and the app fills each blank with your own figure as it draws, so a figure is never the AI’s. A sentence that breaks the app’s rules is dropped, and that card shows the app’s own words. The AI is asked by itself at most once a day, and its words are kept and reused while what they say is still true. The Coach never moves money and never changes a budget without your tap. The date comes from what you really moved into the goal’s fund in each whole month: with under three months it is one rough date, and before a whole month is in, it says when to check back. A goal on no fund has no date until you press **Make it a fund** on Savings. Every quote and tip comes from a book, a speech or a public page, never written by AI; the AI may only pick one and say why it fits. A category shows only when it moves more than it usually does, so a quiet month has no cards. The same line sits at the top of the **Month**; tap it to come here. Under the cards, the forecast card says where the month is heading and what is safe to spend each day; press **Open the Forecast** for the whole of it. Some cards come from your shops: a price that went up, a new regular charge, a charge far above usual or the first at a new shop, the same charge twice, or a charge you added that a statement also holds. Press **See your shops** to see them all on Reports. Some cards cheer you on: two or more weeks in a row within your weekly budgets, or a category whose last whole month was its lowest; press **See your habits** for them on Reports. With **Share shop names** off in AI settings, the AI is told “a shop”, never its name.',
    related: ['savings', 'goals', 'forecast', 'checkin', 'ai-sees', 'free-ai', 'comparisons'],
  },
  {
    id: 'checkin',
    title: 'The Sunday check-in',
    summary:
      'Once a week the Coach looks back at last week with you, Monday to Sunday: what your everyday spending came to, a win, a few questions about your biggest charges, one thing to try next week and how your goals are doing. It takes about 2 minutes.',
    steps: [
      'From Sunday, look for the dot on **Coach**, then press **Your Sunday check-in is ready** (on other days, **Your weekly check-in**).',
      'Read **Last week**: what you spent on everyday things, against the week before and your weekly budgets, and a win.',
      'Under **Was it planned?**, press **Planned**, **Impulse** or **Needed** for each charge; press another to change your answer.',
      'Read **One thing to try**, and press **Yes, set it** (or **Yes, keep it**) to make it that category’s weekly budget on the **Week**.',
      'Read **Your goals**: a line for them and how far each has come.',
    ],
    done: 'you have answered the questions and chosen whether to set next week’s limit.',
    stuck:
      'Until Sunday, the check-in is about the week before; on Sunday it moves on to the week ending that day. It asks only about everyday charges of $20.00 or more, the three largest, and never again about one you have answered. Your answers show how much of your spending you called impulse over the last 8 weeks. The limit it suggests is the lower of what you spent last week and your usual week, rounded down to $5, and never above a weekly budget you already set; nothing is saved until you press the button. If your records do not cover all of last week yet (they start inside it, or your latest statement ends before its Sunday), there is no recap: import the statement that covers it. If the questions say they need a one-time update, see One-time updates; the rest of the check-in still works. Words marked ✨ were written by AI around your own figures; with AI off, the app’s own words show. The dot goes once you open the check-in on this phone or computer.',
    related: ['coach', 'budgets', 'goals', 'updates'],
  },
  {
    id: 'forecast',
    title: 'How the forecast works',
    summary:
      'The Forecast says where this month is heading, how much is safe to spend each day, when you will reach each of your goals and how the next three months look, worked out by the app from your own records, your planned bills and the pay still to come.',
    steps: [
      'Open **Forecast** (on a phone, under **More**), or press **Open the Forecast** or **What if…** on the Coach.',
      'Read the sentence at the top, then **Safe to spend**: what you can spend each day, today included, once your bills and savings are counted.',
      'Read where the month ends: a range, or one rough figure early in the month or with little history, with what is still to come under it.',
      'Read **The next 30 days**: your balance day by day, the tightest day ahead, and the bills due this week.',
      'Read **When you’ll reach your goals**: each goal’s date at your pace, your main goal first.',
      'Under **What if…**, choose a goal and tap a choice such as **Dining out −25%** to see how much sooner you get there and where this month ends; nothing is saved.',
      'Read **The next three months**: where each month ends, worst case to best case, and a table of what makes it up.',
      'Read **Debt-free**, the date on your payoff plan, and press **Open Debts** to change the plan.',
    ],
    done: 'you know what you can spend today, when you will reach your goals, and how the next few months look.',
    stuck:
      'Safe to spend needs this month’s starting balance: type it on the **Month**, under **Start**. It counts your pay still to come from each income’s pay schedule, at what it usually pays; if it says pay is not counted, give that income a pay schedule in **Lists**, or a goal on the **Month**. Savings you still plan to move this month are kept aside, so they are never counted as money to spend. The month’s end is worked out from this month’s pace and each of up to six earlier whole months, rounded to $10: before the 7th, or with under three whole months of records, it is one rough figure, and with no whole month before the 7th it says when to check back. The next 30 days add each payday and each bill on its day, and your everyday spending at its average over the last 90 days once there are 14 days of records; a bill whose day has passed with no charge yet is counted tomorrow. The next three months count your usual pay, the bills and savings set for each month (a change you typed for a later month counts from that month), and your everyday spending in a lighter, a usual and a heavier month you have really had; it is a guide, not a promise. Tap a what-if choice again to clear it. A goal’s date comes from what you have moved into its fund each month. If it says it needs a one-time update, see One-time updates.',
    related: ['coach', 'budgets', 'updates'],
  },
  {
    id: 'month-end',
    title: 'Two month-end figures',
    summary:
      'The Month shows two figures for where the month ends. End of month is your workbook’s: what has happened so far and your planned bills. Forecast adds what is still to come.',
    steps: [
      'On the **Month**, read **End of month**: your start, plus what came in, less what you spent with your planned bills counted, less what you saved.',
      'Read the line under it marked **Forecast**: it adds your pay still due, your spending at your usual pace, and the savings you still plan to move.',
      'Press **ⓘ** beside it for the difference in one line.',
      'Press **Forecast** to open the whole forecast.',
    ],
    done: 'you know which figure counts only what has happened, and which one looks ahead.',
    stuck:
      'Both need this month’s starting balance, typed under **Start**; without it neither is shown. End of month stays as your workbook works it out, so it never moves because of a guess. The forecast shows only on this month, since it speaks of today.',
    related: ['forecast', 'getting-around', 'wrong-number'],
  },
  {
    id: 'reports',
    title: 'Reports and trends',
    summary:
      'Reports reviews a month: what came in, what you spent and what you saved, against last month and your usual month, the categories that moved most, and a short review in words with one thing to try. Trends shows how your months have moved, and which spending is creeping up. Habits shows your everyday spending day by day, your weeks within budget and your best months.',
    steps: [
      'Open **Reports** (on a phone, under **More**).',
      'Press **‹** or **›** to choose a month; this month is marked **So far** and set against the same days of last month.',
      'Read **The month in review**: a headline, three points and one thing to try next month.',
      'Read **Income, Spent and Saved**, each against last month and your usual month, then **Biggest changes** and **This month and last, by category**, with a list of the same figures under the bars.',
      'Press **Trends** for the last **6 months** or **12 months** of Income, Spent and Saved, and each everyday category against its usual month, marked **Rising steadily**, **Falling steadily** or **No clear trend**.',
      'Press **Shops** for the shops you spent most at against last month, the new ones, your subscriptions and regular charges (press **Not a subscription** on any that is not one), and charges worth a second look.',
      'Press **Habits** for the spending grid (each day of up to 26 weeks, darker the more you spent against your daily allowance), how many weeks in a row you stayed within your weekly budgets, which weekday costs most, and any category whose last whole month was its lowest.',
      'To keep a copy, press **Save as PDF** and choose **Save as PDF** where the print window asks for a printer, or, under **Download CSV** at the foot of the Overview, press **Download charges** or **Download summary** for a file a spreadsheet opens.',
    ],
    done: 'you know how the month went, what changed most, and one thing to try next month.',
    stuck:
      'Your usual month is the middle of up to six whole months of records before the one shown, so it needs a whole month of records first. A month your records start partway through says so, and has nothing before it to compare with. Only everyday spending (Variable expenses) can be a biggest change: a bill moving is not a habit. With free AI on, a month that is over is reviewed in the AI’s words (✨) once, and kept; the AI never sees your amounts, and every figure is still the app’s own. A month still running is always in the app’s own words. A trend is only named with four whole months of records: most months moving the same way, and further than that category usually swings, so one dear month is never called a habit. Until then Trends says which month to check back in. A month before your records is left as a gap, never counted as $0. A charge is called regular once it has come three times at steady gaps for a steady amount, and a shop is called new once your records reach 60 days before the month. A charge worth a second look is only pointed out: nothing is hidden or left out of your totals. Your daily allowance on Habits is your weekly budgets for everyday spending spread over seven days; with none set, it is your usual day of spending. A week counts toward a streak when the Week’s Left to spend stays at $0.00 or more, so set weekly budgets on the **Week** to start one. Which weekday costs most needs four whole weeks of records, and a personal best three whole months; until then each says when to check back. A day before your records, or still to come, is left blank, never counted as $0. A downloaded file is made on this device and goes to your downloads: the charges oldest first, or the Overview’s figures. In it, a shop name that starts with = + - or @ begins with an apostrophe, so the spreadsheet shows it as text and never runs it. If it says Reports need a one-time update, see One-time updates.',
    related: ['comparisons', 'coach', 'free-ai'],
  },
  {
    id: 'comparisons',
    title: 'Comparisons with last month',
    summary:
      'Each view shows what you did at the same point last time: this month against the same days of last month, this week against last week.',
    steps: [
      'On the **Month**, read the line under the summary: what you had spent by today, and by the same day last month.',
      'Tap the **vs** choice beside **Last column** to swap each row’s Left for its change since last month.',
      'Tap **Left** to swap it back.',
      'On the **Week**, **Pay**, **Year**, **Savings** and **Debts**, read the line comparing with the time before.',
    ],
    done: 'you can see, row by row, what went up and what went down.',
    stuck:
      'A comparison needs records from last time. If it says your records start later, bring in the statement before that date on **Add**.',
    related: ['getting-around', 'statements', 'wrong-number'],
  },
  {
    id: 'ask',
    title: 'Ask about your money',
    summary:
      'Ask a question in your own words, such as “How much did I spend on coffee in August?”, and get the answer from your own records: how much, against last time, where it went, your subscriptions, where the month ends, what is safe to spend, when you reach your goals, what a saving would do, and your debt-free date.',
    steps: [
      'Open **Ask** from **More** on a phone, type in the box at the bottom of the **Coach**, or press **Ask about this** in any screen’s **?**.',
      'Type your question and press **Ask**, or tap one of the questions under **Try asking**.',
      'Read **I read that as**, to check the app understood which categories and which days you meant.',
      'Read the answer: the figure, a sentence and, where there is one, the list under it.',
      'For a what-if, change **A month’s saving** to see another amount; nothing is saved.',
      'Press the link under the answer, such as **Open the Forecast**, to see the whole of it.',
    ],
    done: 'you have your answer, and you know which days and categories it counts.',
    stuck:
      'With free AI on, the AI reads your question (✨), and is sent only your question as you typed it, today’s date, your category names and the Help titles: never a figure or a charge from your records. It never works out the answer: the app does, from your records, the same way the Month, the Forecast and Savings do. With AI off, resting or not installed, the app reads the question itself, which works best with a category’s name and words like “this month” or “last week”. An amount the AI read is kept only when it is one you typed, and you can change it. Opened with **Ask about this**, Ask suggests that screen’s questions first. If it says “I can’t answer that from your figures yet”, try one of the questions it suggests. A question about days before your records says where they start: bring in an earlier statement on **Add**. The list of your last five questions is kept on this phone or computer only; **Clear these** forgets them.',
    related: ['coach', 'forecast', 'free-ai', 'ai-sees'],
  },
  {
    id: 'free-ai',
    title: 'Turn on free AI',
    summary:
      'AI writes the Coach’s words for you, free with OpenRouter, Groq or Google Gemini. Everything works without it, in the app’s own words. Pasting a key takes about 2 minutes, once the one-time updates are in.',
    steps: [
      'Open **Settings**, then **AI**, and read the sentence at the top.',
      'If it says the AI helper isn’t installed, or needs a one-time update, press **Open One-time updates** and do what it names next.',
      'If Google Gemini’s row says **Already on**, you are done: that is your receipts key.',
      'Otherwise press **Get** on a row under **Free AI**, and copy the key from the page that opens.',
      'Come back to AI settings, paste the key in that row, and press **Save & test**.',
      'Press **Test** to see how long that service takes.',
      'To pick another model, press **Check which models work** and choose one the key can use.',
    ],
    done: 'the row says "Works · key ending …" and the top says "AI is on".',
    stuck:
      'If it says the key isn’t valid, copy it again from the service’s page, all of it. If the service is busy, the key is saved and tried again later. Nothing breaks while AI is off: the Coach and every other screen use the app’s own words. To stop using AI altogether, turn off **Use AI** at the top of AI settings: nothing from your records is sent to any AI service while it is off, and every screen uses the app’s own words. Turn it on again the same way. A key is a password the service gives you for the app to use; the app only ever shows its last four characters, and **Remove key** deletes it.',
    related: ['updates', 'coach', 'more-ai'],
  },
  {
    id: 'more-ai',
    title: 'More AI services, paid ones too',
    summary:
      'Optional. One free service is enough; a second answers when the first is busy. OpenAI and Anthropic are paid, under Advanced, and used only if you switch them on.',
    steps: [
      'Open **Settings**, then **AI**, and find the service’s row under **Free AI** or **Advanced**.',
      'Press the link that starts with **Get**, and create a key on the page that opens.',
      'Copy the key, paste it in that row, and press **Save & test**.',
      'Under **Advanced**, use the arrows in **Try in this order** to move a service up or down.',
      'To let OpenAI or Anthropic answer, turn on **Use paid services**, knowing each use is billed to you by them.',
      'Choose a **Daily limit** if 40 AI calls a day is too many or too few.',
    ],
    done: 'the row says "Works · key ending …" and the service sits where you want it under Try in this order.',
    stuck:
      'Free services may keep what they are sent, and people there may read it, as with Gemini’s free tier. A paid key does nothing until **Use paid services** is on, so nothing is billed by surprise. **Remove key** on a row deletes that key alone.',
    related: ['free-ai', 'ai-rests'],
  },
  {
    id: 'ai-sees',
    title: 'What the AI sees, and how the Coach talks',
    summary:
      'For the Coach and Review, the AI is told what kind of thing changed, which way, and by a little or a lot, with your names for things, and never an amount, a balance or a date. You choose the Coach’s tone, and whether shop names are shared. **Use AI**, at the top of AI settings, turned off sends nothing at all.',
    steps: [
      'Open **Settings**, then **AI**, and press **Advanced** to find **How the Coach talks**.',
      'Choose **Cheerleader** for a win first and never a telling-off, or **Straight talker** for plain words.',
      'Turn **Share shop names with the AI** off to have the AI told “a shop” instead of the name, and Review’s suggestions stopped.',
      'Open **Coach** to read today’s words in the tone you chose.',
    ],
    done: 'the Coach speaks in the tone you chose, and AI settings shows your choices.',
    stuck:
      'Free AI services may keep what they are sent, and people there may read it. That is why the Coach sends only kinds of change, directions and your names for things, with long numbers in a name hidden. Ask sends only your question as you typed it (so an amount you type is sent too), today’s date, your category names and the Help titles, never a figure or a charge from your records. If choosing a tone says it needs a one-time update, see **One-time updates**: until then the Coach cheers you on.',
    related: ['coach', 'free-ai', 'updates'],
    terms: [
      { term: 'Sent for the Coach', meaning: 'what kind of change each is, up or down, a little or a lot, how many months of records it rests on, your category and goal names, and a short list of quotes.' },
      { term: 'Sent for Review’s suggestions', meaning: 'each shop’s name with long numbers hidden, whether it was money in or out, whether it was small (under $20), medium (under $100) or large, and your category names.' },
      { term: 'Never sent for the Coach or Review', meaning: 'an amount, a balance, a date, a card or account number, your name or your email.' },
      { term: 'Sent for Just type it', meaning: 'what you typed, which can include an amount and a shop’s name, today’s date and your category names.' },
      { term: 'Sent for a receipt photo', meaning: 'the photo, with the shop, total and date printed on it.' },
      { term: 'Use AI off', meaning: 'nothing is sent to any AI service, and every screen uses the app’s own words.' },
      { term: '✨', meaning: 'words written by AI from your numbers. Every figure in them is the app’s own.' },
    ],
  },
  {
    id: 'ai-rests',
    title: 'Why the AI sometimes rests',
    summary:
      'Free AI has daily limits, and so does the app. When a service is busy or out of free uses it rests for a while, and the next one is asked. When none can answer, the app shows its own words: nothing breaks.',
    steps: [
      'Open **Settings**, then **AI**, and read the top sentence and **Today: N of 40** under **Advanced**.',
      'If today’s calls reached the limit, wait until tomorrow, or raise the **Daily limit**.',
      'If every service is resting, wait a minute or two and press **Check again**.',
      'To have another service answer while one rests, add a free key under **Free AI**.',
    ],
    done: 'the top of AI settings says "AI is on" again.',
    stuck:
      'The free services reset overnight, at midnight Pacific time. A service that turns down its key is passed over until you paste the key again. While AI rests, the Coach and every other screen use the app’s own words, with your real figures.',
    related: ['more-ai', 'free-ai'],
  },
  {
    id: 'ai-apps',
    title: 'Use Claude or ChatGPT with your budget',
    summary:
      'Connect your own Claude or ChatGPT, then ask about your budget in a chat, tell it what you bought and it waits in Review for you, or ask it to review your budget and suggest changes, which wait in Review until you apply them. Every figure it is given is the app’s own, worked out the way your screens work it out. Off until you turn it on.',
    steps: [
      'Open **Settings** (on a phone, under **More**), and find **AI apps**.',
      'Turn on **Let AI apps connect**.',
      'Connect your AI app once, on a computer, as Connect Claude or Connect ChatGPT below says.',
      'In a chat, ask something like “How is my month going?” or “How much is left for groceries this week?”.',
      'Say what you bought, such as “I spent $12.50 on lunch at Subway today”, then open **Review** to approve it.',
      'To let AI apps only read, turn off **Let them add to Review** and **Let AI apps suggest changes**.',
      'To stop one app, press **Disconnect** beside it under **Connected apps**, then **Yes, disconnect**, and remove it in Claude or ChatGPT too.',
      'To stop every AI app reaching your budget at once, turn off **Let AI apps connect**; it does not end an app’s sign-in, which Disconnect should.',
    ],
    done: 'your AI app answers with the figures your screens show, and anything it adds or suggests waits in Review until you approve or apply it.',
    stuck:
      'An AI app cannot approve, reject, change or delete anything: only you can, in the app. A change it suggests waits under Suggested changes in Review, and only your **Apply** makes it. What it adds is marked Added by an AI app in Review, and in All transactions once you approve it. Approving or moving it files that one entry only: an AI app’s words are never learned as a shop the app files by itself. If a chat gives a figure that differs from your screen, your screen is right: the app hands the AI its figures ready to quote, and what it then writes is its own. Shop names come from your statements, and anyone can name a shop to read like an instruction. All Budget lets an AI do is add to Review and suggest changes for you to apply, but one that also has a connector able to send email or messages could be tricked into sending your figures on, so use Budget in chats where no other connector can send anything. If your AI app says the budget app needs a one-time update, or cannot reach it, or Let AI apps connect will not turn on, open One-time updates: AI apps wait for Allow new users to sign up to be off in Supabase, for the AI helper’s new version, and for read-receipt to be deleted or replaced. In an emergency, in this order: first press **Disconnect** beside each app under Connected apps, which should end its sign-in; then turn off **Let AI apps connect**, which stops every AI app reaching your budget; then in Supabase open the **SQL Editor** and run delete from auth.sessions; which ends every sign-in to your account for certain, yours too, so you sign in again after; and only then open **Authentication**, then **OAuth Server**, and turn it off, so no AI app can sign in again. With it off first, Connected apps cannot list an app to disconnect.',
    related: ['connect-claude', 'connect-chatgpt', 'ai-review', 'ai-sees', 'review', 'updates'],
    terms: [
      { term: 'It can', meaning: 'read your figures (a month, week, pay period or year, what is left in each category, the forecast, your savings goals and your debts), search your approved charges, see what waits in Review and your category names, add a purchase or money received to Review, suggest a category for a row waiting there, and suggest changes to your budget, which wait in Review until you apply them.' },
      { term: 'It cannot', meaning: 'approve or apply anything, or change anything in your budget itself: a budget, category, goal, charge or setting changes only when you tap Apply; delete anything; see a receipt photo; use the AI keys you saved in the app; or reach your budget while Let AI apps connect is off.' },
      { term: 'Its sign-in', meaning: 'like any sign-in, it could also be used on your Supabase account itself, such as its email or password, until its sign-in ends, which **Disconnect** should do (the emergency steps make sure of it); turning off Let AI apps connect does not end it. Only allow an app you trust.' },
      { term: 'Limits', meaning: '300 look-ups and 30 additions a day, and 60 requests to suggest changes, across all AI apps together; one question in a chat may use a few look-ups. They start again at midnight, your time. At most 100 suggestions wait at once, and each expires after 14 days.' },
      { term: 'Who sees it', meaning: 'what the app tells your AI app goes to the company that runs it, Anthropic for Claude, OpenAI for ChatGPT, and stays in your chat history there: figures, the names of categories, shops, goals and debts, and dates. Signing in tells it your email address.' },
      { term: 'Never sent', meaning: 'your password, the AI keys you saved in the app, or a receipt photo.' },
    ],
  },
  {
    id: 'connect-claude',
    title: 'Connect Claude',
    summary:
      'Let Claude read your budget, add purchases to Review and suggest changes for you to apply. Once, on a computer, in about 5 minutes; Claude’s desktop and iPhone apps then have it too. Any Claude plan works, Free included.',
    steps: [
      'In this app, open **Settings** (on a phone, under **More**), and turn on **Let AI apps connect** under **AI apps**.',
      'Press **Connect a new AI app**, which copies the address, and do the steps below within 15 minutes.',
      'On claude.ai, open **Customize**, then **Connectors**, and press **Add custom connector**.',
      'Name it **Budget** and paste the address.',
      'If Claude asks, choose **Sign in now**, and **Register automatically**, not **Use Claude’s published identity**.',
      'Press **Add**, then **Connect**.',
      'On the **Connect an AI app** page that opens, check it says **claude.ai** in bold, sign in if it asks, and press **Allow**.',
      'In a chat, press **+**, then **Connectors**, switch **Budget** on, and ask “How is my month going?”.',
    ],
    done: 'Claude answers “How is my month going?” with your own figures.',
    stuck:
      'Claude’s Free plan allows one custom connector. Claude marks its published identity as recommended, but the budget app’s sign-in cannot use it yet, so choose Register automatically. If the page says the connection wasn’t started from the budget app, press **Connect a new AI app** again and connect within 15 minutes; if it says the request has expired, press Connect in Claude again. If Claude says it cannot reach the server, or never opens the page, open One-time updates and do the step it names next. Connect from a computer: the app opened from its icon on an iPhone keeps a sign-in of its own. If the page names anything other than claude.ai, press **Deny**. These menus are as Anthropic’s help described them on 30 September 2026; if one has moved, look for Connectors in Claude’s settings.',
    related: ['ai-apps', 'ai-review', 'connect-chatgpt', 'updates'],
  },
  {
    id: 'connect-chatgpt',
    title: 'Connect ChatGPT',
    summary:
      'Let ChatGPT read your budget, add purchases to Review and suggest changes for you to apply. It needs ChatGPT Plus, Pro, Business, Enterprise or Edu, and works on the chatgpt.com website, not in the phone app. Once, on a computer, in about 5 minutes.',
    steps: [
      'In this app, open **Settings** (on a phone, under **More**), and turn on **Let AI apps connect** under **AI apps**.',
      'Press **Connect a new AI app**, which copies the address, and do the steps below within 15 minutes.',
      'On chatgpt.com, open **Settings**, then **Security and login**, and turn on **Developer mode**.',
      'Go to chatgpt.com/plugins, press **+**, name it **Budget**, and paste the address.',
      'Choose **OAuth**, and dynamic registration (**DCR**) if it asks how to register, then press **Create**.',
      'On the **Connect an AI app** page that opens, check it says **chatgpt.com** in bold, sign in if it asks, and press **Allow**.',
      'In a chat, press **+**, then **Developer mode**, and pick **Budget**.',
      'When ChatGPT asks you to confirm an addition, say yes only if it is right.',
    ],
    done: 'ChatGPT answers with your own figures, and asks you before it adds anything.',
    stuck:
      'Free ChatGPT cannot connect apps. ChatGPT warns that Developer mode is higher risk; that is expected. If the page says the connection wasn’t started from the budget app, press **Connect a new AI app** again and connect within 15 minutes; if it says the request has expired, go back to ChatGPT and connect again. If sign-in fails, open One-time updates and do the step it names next: ChatGPT cannot sign in until every step there is done. If the page names anything other than chatgpt.com, press **Deny**. These menus are as OpenAI’s help described them on 30 September 2026; if one has moved, look for Developer mode in ChatGPT’s settings.',
    related: ['ai-apps', 'ai-review', 'connect-claude', 'updates'],
  },
  {
    id: 'ai-review',
    title: 'Let Claude or ChatGPT review your budget',
    summary:
      'Ask the AI app you connected to look over your whole budget and suggest changes. Each one waits in Review, under Suggested changes, with the AI’s reason, and nothing changes until you tap Apply. The thinking is done by the model you pick in Claude or ChatGPT, such as Opus, on your own subscription; the budget app calls no AI for it.',
    steps: [
      'Connect Claude or ChatGPT once, as Connect Claude or Connect ChatGPT says, and leave **Let AI apps suggest changes** on under **AI apps** in **Settings**.',
      'In a new chat, pick the model you want and switch **Budget** on, as you did to connect it.',
      'Type “Review my whole budget and suggest any changes” and send it.',
      'Let it read, and say yes when it asks to look something up or to suggest a change.',
      'Open **Review**, where each suggestion waits under **Suggested changes** with what it changes, from what to what, and why.',
      'Press **Apply** on each one you want, or **Dismiss** on one you do not.',
      'To apply every one at once, press **Apply all 3** (with your own number), read what it says, and press **Apply all 3** again.',
    ],
    done: 'Suggested changes is gone from Review, and the changes you applied show on your screens.',
    stuck:
      'If your app lists the budget app’s prompts, Review my budget asks for the same review in one tap. A card that says **Changed since it was suggested** offers only **Dismiss**: you, or something else, changed it since, and applying it could undo that. **Already so** means it is done already; press **Clear**. Apply all leaves out "always file this shop here", since its shop’s later charges skip Review: apply each of those on its own card. Ask the AI app again for a fresh card once you have dismissed it. Suggestions expire after 14 days, or when the month of a budget or monthly amount ends; at most 100 wait at once; and a change you dismissed is not suggested again for 14 days unless what it changes has changed since. An AI app can suggest a budget, a weekly budget, a bill’s amount or day, a savings goal’s target or date, renaming, adding or moving a category, which category a charge belongs in, and always filing a shop there; it cannot delete anything, or change your debts, pay or starting balances. Shop names come from your statements, and anyone can name a shop to read like an instruction, so read each suggestion before you apply it. If your AI app says suggesting is switched off, turn **Let AI apps suggest changes** back on; if it says the budget app needs an update, open One-time updates.',
    related: ['ai-apps', 'connect-claude', 'connect-chatgpt', 'review'],
  },
  {
    id: 'wrong-number',
    title: 'Why does a number look wrong?',
    summary:
      'Almost always one of six things: a statement not brought in yet, rows waiting in Review, no starting balance, card payments, a planned bill, or a charge counted twice.',
    steps: [
      'Open **Review** and approve anything waiting, because a waiting row is not counted yet.',
      'Open **Add** and bring in your latest statement if the last one ended a while ago.',
      'On the **Month**, check that **Start** shows the balance your bank showed on the 1st.',
      'Tap the row that looks wrong to see each charge behind it.',
      'If one charge is there twice, typed once and imported once, open **All transactions** (on a phone, under **More**), press the bin beside the one marked added by hand, then **Remove**.',
    ],
    done: 'each row’s charges add up to what you expected.',
    stuck:
      'Card payments sit on Not spending and never count as spending, because the purchases on the card already did. A bill counts its planned amount until the real charge comes in, then the charge takes its place.',
    related: ['review', 'budgets', 'statements'],
  },
  {
    id: 'codes',
    title: 'Messages with a code in brackets',
    summary:
      'When something does not work, the app says what happened, then a code in brackets such as (code 42501). The code is for looking it up.',
    steps: [
      'Read the sentence before the brackets: it says what happened.',
      'Do what it says, such as pressing **Try again**.',
      'If the code is in the list below, follow what it says there.',
      'If it keeps happening, take a screenshot with the code showing.',
    ],
    done: 'what you were doing works without a message.',
    stuck: 'Nothing is lost when a message shows: a change that fails is not saved half way.',
    related: ['updates', 'wrong-number', 'signing-in'],
    terms: [
      { term: 'PGRST205, 42P01, PGRST202, 42883, 42703', meaning: 'A one-time update is missing. Open Help, then One-time updates.' },
      { term: '42501', meaning: 'Something was changed on another device, or your sign-in needs refreshing. Sign out and back in.' },
      { term: '28000, PGRST301', meaning: 'You were signed out. Sign in again; nothing was saved.' },
      { term: '23505', meaning: 'You already have one with that name, so nothing was added.' },
      { term: '23514, 23503', meaning: 'A rule your lists follow stopped the change, so nothing was saved.' },
      { term: 'unknown, or no code', meaning: 'The app could not reach the internet. Check your connection and try again.' },
    ],
  },
  {
    id: 'signing-in',
    title: 'Signing in and out',
    summary:
      'Only you can sign in: there is no sign-up page, and the sign-in page never says whether an address has an account here.',
    steps: [
      'Type your **Email address** and **Password**, and press **Sign in**.',
      'Or press **Email me a link instead**, then **Email me a link**, and open the link on the same device, in the same browser.',
      'In the app on your iPhone’s Home Screen, sign in with your password, since an emailed link opens in Safari instead.',
      'To sign out, press the button beside your name at the foot of the sidebar, or **Sign out** under **Account** in **Settings** (on a phone, under **More**).',
    ],
    done: 'your budget opens, and signing out brings back the sign-in page.',
    stuck:
      'To change a forgotten password, type your email on the sign-in screen and choose **Forgot your password?**, then open the emailed link on the same device, in the same browser, and choose a new password. Links sent from the Supabase dashboard (Reset password, Send magic link) do not work with this app. “Check your email” shows for any address, with an account here or not, so no one can use the page to learn whether yours is here; if no email comes, check the spelling and use your password. A wrong password and an unknown address get the same message, for the same reason. Emailed links are limited to a few an hour, so a password is quicker when you sign in often.',
    related: ['iphone', 'codes', 'getting-around'],
  },
  {
    id: 'iphone',
    title: 'Put it on your iPhone',
    summary: 'Open the app from your home screen like any other app. About 1 minute.',
    steps: [
      'Open the app’s address in **Safari**.',
      'Tap **Share**, the square with an arrow, or tap **⋯** first if you do not see it.',
      'Scroll down and tap **Add to Home Screen**.',
      'Tap **Add**.',
    ],
    done: 'the app’s icon is on your home screen and opens full screen.',
    stuck:
      'It has to be Safari. If Add to Home Screen is missing, tap **Edit Actions** at the bottom of the Share list and add it. Sign in there with your password: an emailed link opens in Safari instead of the app.',
    related: ['start', 'signing-in'],
  },
]

/**
 * The articles holding every word of `query`, in any letter case, anywhere
 * in their text; all of them for an empty query. Every word must match, so
 * "starting balance" finds the articles about it rather than every one
 * that says "starting".
 */
export function searchArticles(query: string): readonly Article[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '')
  if (words.length === 0) return ARTICLES
  return ARTICLES.filter((a) => {
    const text = [a.title, a.summary, a.done, a.stuck, ...a.steps, ...(a.terms ?? []).flatMap((t) => [t.term, t.meaning])]
      .join(' ')
      .replaceAll('**', '')
      .toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

/** The article with this id, or undefined for a topic not written yet. */
export function articleFor(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id)
}
