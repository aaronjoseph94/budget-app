import type { HelpTopic } from '../help/topics.js'
import { hashOf, type Screen } from '../nav.js'
import type { StepId } from './steps.js'

/** Where each step's editor lives, until this screen holds it itself. */
const ELSEWHERE: Readonly<Record<StepId, { readonly screen: Screen; readonly param: HelpTopic | null; readonly words: string }>> = {
  name: { screen: 'setup', param: null, words: 'Open Setup' },
  lists: { screen: 'setup', param: null, words: 'Open Setup' },
  pay: { screen: 'setup', param: null, words: 'Open Setup' },
  bills: { screen: 'setup', param: null, words: 'Open Setup' },
  goals: { screen: 'savings', param: null, words: 'Open Savings' },
  statement: { screen: 'add', param: null, words: 'Open Add' },
  balance: { screen: 'month', param: null, words: 'Open the Month' },
  ai: { screen: 'ai', param: null, words: 'Open AI settings' },
  phone: { screen: 'help', param: 'iphone', words: 'Show me how' },
}

/** The control each step puts on its screen. */
export function StepBody({ id }: { id: StepId }) {
  const there = ELSEWHERE[id]
  return (
    <a href={hashOf({ screen: there.screen, param: there.param })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
      {there.words}
    </a>
  )
}
