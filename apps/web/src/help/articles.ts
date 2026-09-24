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
 * `SCREEN_HELP` in topics.ts, so the button itself carries no article text.
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
    related: ['statements', 'review', 'budgets'],
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
    related: ['budgets'],
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
    related: ['review', 'add'],
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
    related: ['statements', 'add'],
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
    related: ['statements', 'review'],
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
    related: ['periods', 'start'],
  },
  {
    id: 'savings',
    title: 'Savings and your flight goal',
    summary:
      'Each savings fund is a category on your Savings list. Money you move into it counts toward its goal.',
    steps: [
      'Open **More**, then **Setup**, and add a fund on the Savings list.',
      'Open **More**, then **Savings**.',
      'Press **Set a goal** on the fund and type its target and what is saved so far.',
      'Press **Save goal**.',
      'Each time you move money into the fund, record it on **Add** under **Type it**, filed under that fund.',
    ],
    done: 'the fund’s card shows what is saved, what is left, and what to save a month to get there.',
    stuck:
      'If the saved amount looks low, check that each move into the fund was recorded under that fund, and not as spending.',
    related: ['budgets'],
  },
]

/** The article with this id, or undefined for a topic not written yet. */
export function articleFor(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id)
}
