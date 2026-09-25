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
    summary:
      'The first things to set up, in order. Each takes a few minutes, and nothing breaks if you stop part way and come back later.',
    steps: [
      'Open **More**, then **Setup**, and type your name beside **My name is**.',
      'Press **Use the starter list** to fill your lists with names you can rename.',
      'On an Income row in Setup, choose how often it is **Paid** and its **First payday**.',
      'On each bill, type its **Monthly amount** and its **Day paid**.',
      'Open **Add** and bring in your latest card statement.',
      'Open **Review** and give each waiting row a category.',
      'On the **Month**, tap **Type your starting bank balance** and type what your bank showed on the 1st.',
    ],
    done: 'the Month shows Start, Spent, Left to spend and End of month, and Review says "Nothing waiting."',
    stuck:
      'Do the steps you can and skip the rest. Every screen works with what it has, and says what it is missing in one line.',
    related: ['statements', 'review', 'budgets', 'updates'],
  },
  {
    id: 'updates',
    title: 'One-time updates',
    summary:
      'Some parts of the app need a one-time update pasted into Supabase, where your budget is kept online. This page checks which are in and names the next one. About 2 minutes each, easiest on a computer.',
    steps: [
      'Open Supabase in a new tab and choose your project.',
      'Press **SQL Editor**, then **New query**.',
      'On this page, press **Copy** beside the file it names next, or open that file on GitHub and copy all of it.',
      'Paste it into the new query and press **Run**.',
      'Wait until it says Success, then press **Check again** on this page.',
      'When the next step is the AI helper, follow the clicks this page shows for it instead.',
    ],
    done: 'this page says "All done".',
    stuck:
      'If Supabase says anything other than Success, stop there: nothing is lost, and the message names the line. A file already pasted is refused rather than applied twice, so pasting one again does no harm.',
    related: ['start', 'codes'],
  },
  {
    id: 'periods',
    title: 'Month, Week, Pay and Year',
    summary:
      'Four ways to look at the same money. The Month opens first; the switch at the top moves between them.',
    steps: [
      'Open the **Month** to see this month: what you planned, what you spent, and what is left.',
      'Tap **Week** in the switch at the top to see Monday to Sunday.',
      'Tap **Pay** to see one pay period, from one payday to the next.',
      'Tap **Year** to see twelve months side by side.',
      'Use the arrows beside the title to step back or forward one month, week or pay period.',
      'Tap a row to see the charges behind it.',
    ],
    done: 'you can move between the four views and step back to last month.',
    stuck:
      'Pay needs to know when you are paid: set **Paid** and **First payday** on an Income row in Setup. On a phone, the Week is in the switch, not the bottom bar.',
    related: ['comparisons', 'budgets', 'wrong-number'],
  },
  {
    id: 'statements',
    title: 'Bring in a statement',
    summary:
      'Your card statement brings in most of your spending at once. Download it from your bank as a PDF or a CSV file first. About 3 minutes.',
    steps: [
      'Open **Add**.',
      'Choose the **Statement** tab.',
      'Press **Choose a statement** and pick the file you downloaded.',
      'Check the rows it read, then press **Import**.',
      'Press **Go to review** to give the new rows their categories.',
    ],
    done: 'Review lists the new rows, and a statement you bring in again adds nothing twice.',
    stuck:
      'If the app says it could not read the file, try the other format your bank offers (PDF or CSV). Lines it could not read wait at the bottom of Review with the reason.',
    related: ['review', 'add', 'wrong-number'],
  },
  {
    id: 'review',
    title: 'Why things wait in Review',
    summary:
      'Nothing reaches your budget until you approve it. Every imported row waits here for its category, so a wrong guess never counts by itself.',
    steps: [
      'Open **Review**.',
      'Choose a category for the first row.',
      'Press **Approve**.',
      'For a row that is not a real charge, press the **✕** beside it.',
      'At the bottom, press **Dismiss** on a line the reader could not read once you have typed it yourself.',
    ],
    done: 'Review says "Nothing waiting." A shop you approved once is filed the same way next time, without waiting.',
    stuck:
      'If a shop keeps landing in the wrong place, move one of its charges from the Month with **Move to…** and leave **Always file** ticked.',
    related: ['statements', 'add', 'wrong-number'],
  },
  {
    id: 'add',
    title: 'Add: a statement, a photo, or type it',
    summary: 'Three ways to put money in: a statement from your bank, a receipt photo, or one entry typed by hand.',
    steps: [
      'Open **Add**.',
      'For a receipt, choose **Photo**, then **Take or choose a receipt photo**.',
      'Check what it read, then press **Send to review**.',
      'For cash, pay or a move to savings, choose **Type it**.',
      'Fill in each field, then press **Add**.',
    ],
    done: 'a photo waits in Review, and a typed entry shows on the Month on its date.',
    stuck:
      'Reading a photo needs the receipt reader set up (see One-time updates). You can always type the receipt instead.',
    related: ['statements', 'review', 'updates'],
  },
  {
    id: 'budgets',
    title: 'Budgets and bills',
    summary:
      'A budget is what you plan to spend on something. A bill has a monthly amount and a day it is paid, and counts as planned until the real charge arrives.',
    steps: [
      'On the **Month**, tap a row’s Budgeted figure.',
      'Type the amount, and choose **From this month on** or **Just this month**.',
      'For a bill, open **More**, then **Setup**, and type its **Monthly amount**.',
      'Choose its **Day paid**.',
      'To see every bill by its day, tap the calendar button beside the Month’s title.',
      'For weekly budgets, open **More**, then **Settings**, and type them under **Weekly budgets**.',
    ],
    done: 'each row on the Month shows Budgeted, Actual and Left, and the Bill calendar shows your bills on their days.',
    stuck:
      'A bill with no charge yet this month counts its planned amount. When the real charge comes in, it takes the planned amount’s place, so it is never counted twice.',
    related: ['periods', 'wrong-number', 'start'],
  },
  {
    id: 'savings',
    title: 'Savings and your goals',
    summary:
      'Each goal has a fund, a category on your Savings list, and money you move into the fund counts toward the goal. Your main goal is the one the Coach and the Week show.',
    steps: [
      'Open **More**, then **Savings**.',
      'Read each goal’s card: what is saved, what is left, what to save a month, and one thing to trim to get there sooner.',
      'Press **Make main goal** on the goal you want the Coach and the Week to show.',
      'Press the up and down arrows on a goal to put your goals in the order you like.',
      'Press **Pause** on a goal you are putting aside, or **Mark as reached** when it is done.',
      'Each time you move money into a fund, record it on **Add** under **Type it**, filed under that fund.',
    ],
    done: 'your main goal is first on Savings, and the Coach and the Week show it.',
    stuck:
      'If the saved amount looks low, check that each move into the fund was recorded under that fund, and not as spending. Paused and reached goals are folded away under Reached and paused, at the bottom of Savings, where Resume brings one back. When your main goal has a cost an hour, a spending charge opened from the Month also says what it cost in that goal’s time.',
    related: ['goals', 'coach', 'comparisons', 'budgets'],
  },
  {
    id: 'goals',
    title: 'Add a savings goal',
    summary:
      'Save for anything, not only flying: a trip, a car, a rainy-day fund. Each goal gets its own fund on your Savings list. About 2 minutes.',
    steps: [
      'Open **More**, then **Savings**.',
      'Press **Add a goal**.',
      'Type the goal’s name and its target.',
      'Type what is saved already and a target date, if you have them.',
      'Under **Show progress in**, choose **Dollars**, or **Hours** with what an hour costs.',
      'Press **Add goal**.',
    ],
    done: 'the goal has its own card on Savings, and its fund is on your Savings list.',
    stuck:
      'A name already used on another list, such as Bills, cannot be a goal’s fund: use another name, or move that category to Savings in Setup. Money you move into the fund after today adds to the goal. Nothing breaks if you stop part way.',
    related: ['savings', 'coach'],
  },
  {
    id: 'debts',
    title: 'Debts',
    summary:
      'The loans and card balances you are paying down, and when each is paid off. These are separate from the Month’s Debts list, which counts each month’s payments.',
    steps: [
      'Open **More**, then **Debts**.',
      'Press **Add a debt**.',
      'Type its starting balance, the month beside it, its minimum payment and its APR.',
      'Press **Save debt**.',
      'Read **Ways to pay it off** to see how much sooner Snowball or Avalanche finishes than minimums only.',
    ],
    done: 'each debt shows when it is paid off, and the summary shows the date you are debt-free.',
    stuck:
      'An estimate is fine: the balance is as of the month beside it. Tap a debt to fix a figure or add an extra payment.',
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
      'Read the quote or tip at the bottom, picked for what your day is about.',
    ],
    done: 'you have read the line, your goal’s date and the cards, and you know why each one is there.',
    stuck:
      'Words marked ✨ were written by AI. The AI is never sent an amount, a balance or a date: it writes around blanks, and the app fills each blank with your own figure as it draws, so a figure is never the AI’s. A sentence that breaks the app’s rules is dropped, and that card shows the app’s own words. The AI is asked by itself at most once a day, and its words are kept and reused while what they say is still true. The Coach never moves money and never changes a budget without your tap. The date comes from what you really moved into the goal’s fund in each whole month: with under three months it is one rough date, and before a whole month is in, it says when to check back. A goal on no fund has no date until you press **Make it a fund** on Savings. Every quote and tip comes from a book, a speech or a public page, never written by AI; the AI may only pick one and say why it fits. A category shows only when it moves more than it usually does, so a quiet month has no cards. The same line sits at the top of the **Month**; tap it to come here. Under the cards, the forecast card says where the month is heading and what is safe to spend each day; press **Open the Forecast** for the whole of it.',
    related: ['savings', 'goals', 'forecast', 'ai-sees', 'free-ai', 'comparisons'],
  },
  {
    id: 'forecast',
    title: 'How the forecast works',
    summary:
      'The Forecast says where this month is heading and how much is safe to spend each day, worked out by the app from your own records, your planned bills and the pay still to come.',
    steps: [
      'Open **Forecast** from **More**, or press **Open the Forecast** on the Coach.',
      'Read the sentence at the top: where the month is heading, in a few words.',
      'Read **Safe to spend**: what you can spend each day, today included, once your bills and savings are counted.',
      'Read where the month ends: a range, or one rough figure early in the month or with little history, with what is still to come under it.',
      'Read **The next 30 days**: your balance day by day, the tightest day ahead, and the bills due this week.',
      'Read **Debt-free**, the date on your payoff plan, and press **Open Debts** to change the plan.',
    ],
    done: 'you know what you can spend today and still end the month as planned.',
    stuck:
      'Safe to spend needs this month’s starting balance: type it on the **Month**, under **Start**. It counts your pay still to come from each income’s pay schedule, at what it usually pays; if it says pay is not counted, give that income a pay schedule in **Setup**, or a goal on the **Month**. Savings you still plan to move this month are kept aside, so they are never counted as money to spend. The month’s end is worked out from this month’s pace and each of up to six earlier whole months, rounded to $10: before the 7th, or with under three whole months of records, it is one rough figure, and with no whole month before the 7th it says when to check back. The next 30 days add each payday and each bill on its day, and your everyday spending at its average over the last 90 days once there are 14 days of records; a bill whose day has passed with no charge yet is counted tomorrow. If it says it needs a one-time update, see One-time updates.',
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
    related: ['forecast', 'periods', 'wrong-number'],
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
    related: ['periods', 'statements', 'wrong-number'],
  },
  {
    id: 'free-ai',
    title: 'Turn on free AI',
    summary:
      'AI writes the Coach’s words for you, free with Google Gemini. Everything works without it, in the app’s own words. Pasting the key takes about 2 minutes, once the one-time updates are in.',
    steps: [
      'Open **More**, then **AI settings**, and read the sentence at the top.',
      'If it says the AI helper isn’t installed, or needs a one-time update, press **Open One-time updates** and do what it names next.',
      'If the Gemini card says **Already on**, you added a key for receipt photos and there is nothing more to do.',
      'Otherwise press **Get a free key**, then **Create API key** in the Google AI Studio tab that opens, and copy the key.',
      'Come back to AI settings, paste the key in the box, and press **Save & test**.',
      'To pick another model, press **Check which models work** and choose one the key can use.',
    ],
    done: 'the Gemini card says "Works · key ending …" and the top says "AI is on".',
    stuck:
      'If it says the key isn’t valid, copy it again from AI Studio, all of it. If Google is busy, the key is saved and tried again later. Nothing breaks while AI is off: the Coach and every other screen use the app’s own words. A key is a password Google gives you for the app to use; the app only ever shows its last four characters, and **Remove key** deletes it.',
    related: ['updates', 'coach', 'more-ai'],
  },
  {
    id: 'more-ai',
    title: 'More AI services, paid ones too',
    summary:
      'Optional. Gemini alone is enough. Adding Groq or OpenRouter, both free, means another service answers when Gemini is busy. OpenAI and Anthropic are paid, and used only if you switch them on.',
    steps: [
      'Open **More**, then **AI settings**, and press **More AI services** to unfold the cards.',
      'On the card you want, press the link that starts with **Get**, and create a key on the page that opens.',
      'Copy the key, paste it in that card, and press **Save & test**.',
      'Under **Try in this order**, press the arrows to put the services in the order you want them asked.',
      'To let OpenAI or Anthropic answer, turn on **Use paid services**, knowing each use is billed to you by them.',
      'Choose a **Daily limit** if 40 AI calls a day is too many or too few.',
    ],
    done: 'the card says "Works · key ending …" and the service sits where you want it under Try in this order.',
    stuck:
      'Free services may keep what they are sent, and people there may read it, as with Gemini’s free tier. A paid key does nothing until **Use paid services** is on, so nothing is billed by surprise. **Remove key** on a card deletes that key alone.',
    related: ['free-ai', 'ai-rests'],
  },
  {
    id: 'ai-sees',
    title: 'What the AI sees, and how the Coach talks',
    summary:
      'The AI is told what kind of thing changed, which way, and by a little or a lot, with your names for things. It is never told an amount, a balance or a date. You choose the Coach’s tone, and whether shop names are shared.',
    steps: [
      'Open **More**, then **AI settings**, and find **How the Coach talks**.',
      'Choose **Cheerleader** for a win first and never a telling-off, or **Straight talker** for plain words.',
      'Turn **Share shop names with the AI** off to have the AI told “a shop” instead of the name.',
      'Open **Coach** to read today’s words in the tone you chose.',
    ],
    done: 'the Coach speaks in the tone you chose, and AI settings shows your choices.',
    stuck:
      'Free AI services may keep what they are sent, and people there may read it. That is why the Coach sends only kinds of change, directions and your names for things, with long numbers in a name hidden. If choosing a tone says it needs a one-time update, see **One-time updates**: until then the Coach cheers you on.',
    related: ['coach', 'free-ai', 'updates'],
    terms: [
      { term: 'Sent for the Coach', meaning: 'what kind of change each is, up or down, a little or a lot, how many months of records it rests on, your category and goal names, and a short list of quotes.' },
      { term: 'Never sent', meaning: 'an amount, a balance, a date, a card or account number, your name or your email.' },
      { term: '✨', meaning: 'words written by AI from your numbers. Every figure in them is the app’s own.' },
    ],
  },
  {
    id: 'ai-rests',
    title: 'Why the AI sometimes rests',
    summary:
      'Free AI has daily limits, and so does the app. When a service is busy or out of free uses it rests for a while, and the next one is asked. When none can answer, the app shows its own words: nothing breaks.',
    steps: [
      'Open **More**, then **AI settings**, and read the sentence at the top and the line **Today: N of 40**.',
      'If today’s calls reached the limit, wait until tomorrow, or raise the **Daily limit**.',
      'If every service is resting, wait a minute or two and press **Check again**.',
      'To have another service answer while Gemini rests, add a free one under **More AI services**.',
    ],
    done: 'the top of AI settings says "AI is on" again.',
    stuck:
      'The free services reset overnight, at midnight Pacific time. A service that turns down its key is passed over until you paste the key again. While AI rests, the Coach and every other screen use the app’s own words, with your real figures.',
    related: ['more-ai', 'free-ai'],
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
      'If one charge is there twice, typed once and imported once, open **More**, then **All transactions**, and remove the typed one.',
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
    related: ['updates', 'wrong-number'],
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
    id: 'iphone',
    title: 'Put it on your iPhone',
    summary: 'Open the app from your home screen like any other app. About 1 minute.',
    steps: [
      'Open the app’s address in **Safari**.',
      'Tap **Share**, the square with an arrow.',
      'Scroll down and tap **Add to Home Screen**.',
      'Tap **Add**.',
    ],
    done: 'the app’s icon is on your home screen and opens full screen.',
    stuck: 'It has to be Safari. If Add to Home Screen is missing, tap **Edit Actions** at the bottom of the Share list and add it.',
    related: ['start'],
  },
  {
    id: 'words',
    title: 'Words the app uses',
    summary: 'The words on the screens, in plain terms.',
    steps: ['Find the word in the list below.', 'Tap **?** beside a screen’s title to read how that screen uses it.'],
    done: 'the word on the screen makes sense.',
    stuck: 'If a word is not here, open **Help** and search for it.',
    related: ['periods', 'wrong-number'],
    terms: [
      { term: 'Start', meaning: 'The balance your bank showed on the 1st of the month, as you typed it.' },
      { term: 'Spent', meaning: 'Everything that went out this month, with each bill counted even before its charge arrives.' },
      { term: 'Left to spend', meaning: 'What your Variable expenses budgets allow that is not spent yet.' },
      { term: 'End of month', meaning: 'Start, plus what came in, less what was spent and saved.' },
      { term: 'Budgeted, Actual, Left', meaning: 'What you planned, what happened, and the difference.' },
      { term: 'Planned', meaning: 'A bill’s monthly amount, counted until its real charge comes in.' },
      { term: 'Not spending', meaning: 'Money that moves but is not spent, such as paying off your card.' },
      { term: 'Pay period', meaning: 'From one payday to the day before the next.' },
      { term: 'Fund', meaning: 'A savings category that money is moved into, with a goal.' },
      { term: 'Main goal', meaning: 'The savings goal the Coach and the Week show. You choose it on Savings.' },
      { term: 'Review', meaning: 'Where new rows wait for you to approve them.' },
      { term: 'One-time update', meaning: 'Something pasted into Supabase once, so a new part of the app has somewhere to keep its figures.' },
    ],
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
