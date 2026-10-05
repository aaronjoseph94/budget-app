/**
 * The one prompt, `review_my_budget` (ADR 0013, PROPOSALS.md §3): what a
 * full review is, in the order to do it, for clients that offer a
 * server's prompts. Its words are a fixed string here; it takes no
 * arguments and reads nothing, so no stored text can change what it asks.
 * Clients that do not show prompts get the same steps from the tools'
 * descriptions and the instructions.
 */
import type { McpServer } from '@modelcontextprotocol/server'

export const REVIEW_PROMPT =
  'Review my whole budget in the budget app, then suggest changes.\n' +
  '1. Read everything first: list_categories, get_period (this month, and this week), get_spending (top_categories, ' +
  'subscriptions and explain_month), get_forecast, get_savings_goals, get_debts, list_review_queue and list_suggestions.\n' +
  '2. Before acting on a pattern, check it with search_transactions.\n' +
  '3. Suggest categories for the rows waiting in Review with suggest_review_categories.\n' +
  '4. Suggest a few changes with propose_change, each with a short reason that quotes the app’s figures exactly as ' +
  'given. Do not repeat a change that is waiting, or one I dismissed.\n' +
  '5. Tell me what you suggested and that it waits in Review, under Suggested changes. Nothing changes until I tap ' +
  'Apply, so never say a change was made.'

export function registerReviewPrompt(server: McpServer): void {
  server.registerPrompt(
    'review_my_budget',
    { title: 'Review my budget', description: 'Review the whole budget and suggest changes, which wait in the app until the owner applies them.' },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: REVIEW_PROMPT } }] }),
  )
}
