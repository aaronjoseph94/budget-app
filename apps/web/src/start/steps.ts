/**
 * Getting started's nine steps (plan §8.1), in the guide's own order, and
 * the words each screen says: committed words, drawn as text. Each says why
 * it matters in a sentence, and about how long it takes, so the owner
 * always knows what they are in for.
 */
export const STEP_IDS = ['name', 'lists', 'pay', 'bills', 'goals', 'statement', 'balance', 'ai', 'phone'] as const
export type StepId = (typeof STEP_IDS)[number]

export interface StepWords {
  readonly title: string
  /** One sentence on why it matters. */
  readonly why: string
  /** "about 2 minutes". */
  readonly time: string
}

export const STEP_WORDS: Readonly<Record<StepId, StepWords>> = {
  name: {
    title: 'Your name',
    why: 'So the app, and the Coach, can talk to you by name.',
    time: 'under a minute',
  },
  lists: {
    title: 'Your lists',
    why: 'Every charge is filed under a category, and each category sits on a list. The starter list fills them with names you can rename.',
    time: 'about 2 minutes',
  },
  pay: {
    title: 'When you’re paid',
    why: 'Your paydays tell the Paycheck view and the Forecast when money comes in.',
    time: 'about 1 minute',
  },
  bills: {
    title: 'Your bills',
    why: 'A bill’s monthly amount counts on the Month until its real charge arrives. Nothing due is forgotten.',
    time: 'about 3 minutes',
  },
  goals: {
    title: 'Your savings goals',
    why: 'The Coach shows how far each goal has come, and what would get you there sooner.',
    time: 'about 2 minutes',
  },
  statement: {
    title: 'Your first statement',
    why: 'Your card statement fills the Month with what you really spent. Each charge waits in Review for you to file it.',
    time: 'about 5 minutes',
  },
  balance: {
    title: 'This month’s starting balance',
    why: 'With your bank’s balance on the 1st, the Month can say where it will end. The Forecast can say what is safe to spend.',
    time: 'about 1 minute',
  },
  ai: {
    title: 'Turn on free AI',
    why: 'Free Google Gemini writes the Coach’s tips and reads your receipts and questions. Everything works without it too.',
    time: 'under 2 minutes',
  },
  phone: {
    title: 'Put it on your iPhone',
    why: 'Open the app from your home screen like any other app. Optional: skip it on a computer.',
    time: 'about 1 minute',
  },
}
