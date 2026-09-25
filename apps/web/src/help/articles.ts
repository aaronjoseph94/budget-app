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
      'The Coach reads your own records and tells you, in plain words, how the month is going, what changed, when you will reach your goals, and what to trim to get there sooner.',
    steps: [
      'Open **Coach**.',
      'Read the line at the top: how your spending compares with the same days last month, or last week.',
      'Read your main goal’s card: what is saved, and when you will get there at your own pace.',
      'Read the line under the date: one thing to trim, and how many weeks sooner that gets you there.',
      'Read the cards under it: at most three, the most important first, each with one thing to try.',
      'Press a card’s button, such as **See the Month** or **See your goals**, to act on it.',
      'Press **Why am I seeing this?** to see the figures behind a card.',
      'Read the quote or tip at the bottom, picked for what your day is about.',
    ],
    done: 'you have read the line, your goal’s date and the cards, and you know why each one is there.',
    stuck:
      'The Coach never moves money and never changes a budget without your tap, and every figure comes from your own records. The date comes from what you really moved into the goal’s fund in each whole month: with under three months it is one rough date, and before a whole month is in, it says when to check back. A goal on no fund has no date until you press **Make it a fund** on Savings. Every quote and tip comes from a book, a speech or a public page, checked when it was added, never written by AI, and the same one does not come back within two weeks on this device. A category shows only when it moves more than it usually does, so a quiet month has no cards. The same line sits at the top of the **Month**; tap it to come here.',
    related: ['savings', 'goals', 'comparisons', 'statements'],
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
      'AI writes the Coach’s words for you, free with Google Gemini. Everything works without it, in the app’s own words. The first time takes about 15 minutes, once, easiest on a computer.',
    steps: [
      'Open **More**, then **AI settings**, and read the sentence at the top.',
      'If it says the AI helper isn’t installed, or needs a one-time update, press **Open One-time updates** and do what it names next.',
      'If you added a Gemini key for receipt photos, there is nothing more to do: AI settings says it is on, using your receipts key.',
      'Otherwise, open Google AI Studio in a new tab and press **Create API key**, then copy the key.',
      'In Supabase, open **Edge Functions**, then **Secrets**, and add it named **GEMINI_API_KEY**.',
      'Come back to AI settings and press **Check again**.',
    ],
    done: 'AI settings says "AI is on".',
    stuck:
      'Nothing breaks while AI is off: the Coach and every other screen use the app’s own words. A key is a password Google gives you for the app to use; AI settings only ever shows its last four characters.',
    related: ['updates', 'coach'],
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
