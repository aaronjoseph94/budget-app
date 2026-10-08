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
    id: 'add',
    title: 'Add a charge: statement, photo, typed',
    summary: 'A statement from your bank, a receipt photo, or one typed entry.',
    steps: [
      'Open **Add**.',
      'Choose **Statement** and press **Choose a statement**.',
      'Check the rows, then press **Import 42 transactions** or **Send 42 to the review queue**.',
      'For a receipt, choose **Photo**, then **Take or choose a receipt photo**, then **Send to review**.',
      'For cash, pay or a move to savings, choose **Type it**.',
      'Under **Just type it**, write “coffee 4.50 yesterday” and press **Fill in**.',
      'Check each field, then press **Add**.',
    ],
    done: 'the rows wait in Review, or a typed entry shows on the Month.',
    stuck:
      'If it cannot read the file, try the other format. **Does not add up**: try the CSV. A photo goes to your first AI service that reads photos, never stored. A charge brought in twice waits in Review: reject it.',
    related: ['review', 'updates'],
  },
  {
    id: 'review',
    title: 'Review',
    summary: 'Nothing counts until you approve it here.',
    steps: [
      'Open **Review**.',
      'Under **Suggested changes**, press **Apply** or **Dismiss** on each AI app suggestion.',
      'Check each row’s category: **✨ Suggested: …** is the AI’s guess; **Suggested** is your own rule.',
      'Pick another category where it is wrong, or press **Not this**.',
      'Press **Approve**, or **Approve these 12**, then **Approve all 12**.',
      'Press **✕** on a row that is not a real charge.',
      'At the bottom, press **Dismiss** on an unread line once you have typed it yourself.',
    ],
    done: 'Review says “Nothing waiting.”',
    stuck:
      'A shop you approved once is filed the same way next time. To stop that, press **Forget** under **Shops filed by themselves** in Settings. A wrong number: approve what waits, bring in the latest statement, check **Start**. A charge counted twice: remove the typed one in **All transactions**.',
    related: ['add', 'ai-apps'],
  },
  {
    id: 'budgets',
    title: 'Budgets and bills',
    summary: 'A budget is what you plan to spend. A bill is a monthly amount on a day.',
    steps: [
      'On the **Month**, tap a row’s Budgeted figure.',
      'Type the amount, choose **From this month on** or **Just this month**, and press **Save**.',
      'For a bill, open **Settings**, then **Lists**, and type its **Monthly amount** and **Day paid**.',
      'Open **Bill calendar** to see every bill on its day.',
      'For weekly budgets, tap one on the **Week**.',
    ],
    done: 'each row shows Budgeted, Actual and Left, and each list’s head a % pill.',
    stuck:
      'A bill counts its planned amount until the real charge arrives and takes its place. A shop charging a row every month: Lists says **Looks like a monthly bill: add it?**. Press **Fill it in**, then **Save**.',
    related: ['lists', 'getting-around'],
    terms: [
      { term: 'Start', meaning: 'The balance your bank showed on the 1st, as you typed it on the Month.' },
    ],
  },
  {
    id: 'lists',
    title: 'Your lists',
    summary: 'Your name and your categories, each on one list.',
    steps: [
      'Open **Settings**, then **Lists**.',
      'Type your name after **My name is**.',
      'With few categories, press **Use the starter list** for names to rename.',
      'To add one, type its name at the foot of a list and press **Add**.',
      'To rename one, type over its name; a tick shows it saved.',
      'The arrows move it, the two-arrow button changes its list, the bin removes it.',
      'On Bills, Debts and Subscriptions, type **Day paid** and **Monthly amount**.',
      'On Income, choose **How often** and **First payday**.',
    ],
    done: 'each category sits on its list, and **Fixed monthly bills** shows the total.',
    stuck:
      'A card you pay off from your bank goes on Not spending: its purchases are already counted. A category with charges cannot be removed: move them first with **Move to…** on the Month. **Stop** clears a monthly amount from this month on.',
    related: ['budgets', 'start'],
  },
  {
    id: 'savings',
    title: 'Savings',
    summary: 'Each goal has a fund on your Savings list; money moved in counts toward it.',
    steps: [
      'Open **Savings** (on a phone, under **More**).',
      'Press **Add a goal**, type its name and target, and press **Add goal**.',
      'Choose **Dollars** or **Hours** under **Show progress in**.',
      'Press **Edit goal** to change a goal; **Remove** deletes one with nothing saved.',
      'Press **Make main goal** on the one the Coach and the Week should show.',
      'Press **Pause** on a goal set aside, or **Mark as reached** when done.',
      'Record each move into a fund on **Add** as **I spent**.',
    ],
    done: 'your main goal is first on Savings, and the Coach shows it.',
    stuck:
      'If the saved amount looks low, check each move was filed under the fund, not as spending. A goal holding money cannot be removed: pause it or mark it reached.',
    related: ['coach', 'lists'],
  },
  {
    id: 'debts',
    title: 'Debts',
    summary: 'The loans and card balances you are paying down, and when each is paid off.',
    steps: [
      'Open **Debts** (on a phone, under **More**).',
      'Press **Add a debt**.',
      'Type its name, **Starting balance**, the **As of** month, **Minimum payment** and **APR**.',
      'Press **Save debt**.',
      'Read **Ways to pay it off**: how much sooner Snowball or Avalanche finishes.',
    ],
    done: 'each debt shows when it is paid off, and the summary your debt-free date.',
    stuck:
      'An estimate is fine: the balance is as of the **As of** month. Press **Edit** to fix a figure or add one under **Extra payments**. These debts are separate from the Month’s Debts list, which counts each month’s payments.',
    related: ['budgets', 'coach'],
  },
  {
    id: 'coach',
    title: 'Coach, Ask and the forecast',
    summary: 'The Coach reads your records and says how the month is going.',
    steps: [
      'Open **Coach**: a line on the month, your main goal, and up to three cards.',
      'Press **Why am I seeing this?** for the figures behind a card.',
      'From Sunday, press **Your Sunday check-in is ready** and answer **Was it planned?**.',
      'Open **Forecast** for **Safe to spend**, where the month ends, and each goal’s date.',
      'Open **Reports** for the month in review, **Trends**, **Shops** and **Habits**.',
      'Type a question under **Ask anything about your money**, or open **Ask**.',
    ],
    done: 'you know how the month is going, and when you reach your goals.',
    stuck:
      'Words marked ✨ are the AI’s; every figure is the app’s own. The AI never sees an amount or a date. Safe to spend needs **Start** on the Month. A goal’s date comes from what you really moved into its fund each month.',
    related: ['savings', 'ai', 'budgets'],
  },
  {
    id: 'ai',
    title: 'AI: turn it on, services, what it sees',
    summary: 'AI writes the Coach’s words; all works without it.',
    steps: [
      'Open **Settings**, then **AI**.',
      'If asked, press **Open One-time updates** first.',
      'Press **Get** on a **Free AI** row and copy the key.',
      'Paste it in that row and press **Save & test**.',
      'Under **Advanced**: service order, **Use paid services**, tone.',
      'Turn off **Share shop names with the AI** to send “a shop” instead.',
      '**Use AI** off sends nothing at all.',
    ],
    done: 'it says “AI is on”.',
    stuck:
      'A busy service rests and the next is asked. Past the **Daily limit** the app uses its own words. Free services may keep what they are sent.',
    related: ['coach', 'ai-apps', 'updates'],
    terms: [
      {
        term: 'What the AI sees',
        meaning:
          'Coach and Review: kinds of change and names, never an amount, a balance or a date. Just type it and a photo: what you typed or the photo, today’s date, your category names.',
      },
    ],
  },
  {
    id: 'ai-apps',
    title: 'Connect Claude or ChatGPT',
    summary: 'Claude or ChatGPT reads your budget; additions wait in Review.',
    steps: [
      'In **Settings**, then **Account**, turn on **Let AI apps connect**.',
      'Press **Connect a new AI app**, then connect within 15 minutes.',
      'In Claude, add a custom connector **Budget**; choose **Register automatically**.',
      'In ChatGPT, turn on **Developer mode** and add **Budget**.',
      'On **Connect an AI app**, check **claude.ai** or **chatgpt.com**, and **Allow**.',
    ],
    done: 'it answers with your figures; suggestions wait for **Apply**.',
    stuck:
      'In an emergency, in order: **Disconnect** each app; turn off **Let AI apps connect**. Then in Supabase run delete from auth.sessions; last, turn off **OAuth Server**.',
    related: ['review', 'ai', 'updates'],
    terms: [
      { term: 'It can', meaning: 'read your figures, add to Review, suggest changes you apply.' },
      { term: 'It cannot', meaning: 'approve, change or delete anything; see a photo; use your keys.' },
      { term: 'Its sign-in', meaning: 'reaches your Supabase account until it ends; **Disconnect** ends it.' },
      { term: 'Who sees it', meaning: 'Anthropic or OpenAI: figures, names, dates; never password or keys.' },
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
    related: ['start', 'ai', 'ai-apps', 'codes'],
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
    related: ['updates', 'signing-in'],
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
