/**
 * The one place the AI apps server writes a log line, and all it can say: a
 * fixed code and numbers (PLAN §2.6). Never a token, a tool's arguments or
 * result, a name, an amount, a user id, or an error's message, which can
 * carry any of them. eslint allows `console` in no other file here.
 */
export type LogCode =
  | 'not_configured'
  | 'origin_refused'
  | 'auth_unreachable'
  | 'auth_status'
  | 'token_refused'
  | 'deadline'
  | 'sdk_error'
  | 'rpc_unreachable'
  | 'rpc_status'
  | 'rpc_shape'
  | 'records_unreadable'
  | `tool_${'list_categories' | 'get_period' | 'get_spending' | 'get_forecast' | 'get_savings_goals' | 'get_debts' | 'search_transactions' | 'list_review_queue'}_${'ok' | 'refused'}`

/** The counts a line may carry, by fixed name, so no key can carry content either. */
export type LogCounts = Readonly<Partial<Record<'check' | 'status' | 'ms' | 'rows', number>>>

export function log(code: LogCode, counts: LogCounts = {}): void {
  console.log(JSON.stringify({ fn: 'mcp', code, ...counts }))
}
