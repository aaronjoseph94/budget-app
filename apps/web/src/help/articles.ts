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
    related: ['savings', 'free-ai', 'budgets'],
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
