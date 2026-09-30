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

export function log(code: LogCode, counts: Readonly<Record<string, number>> = {}): void {
  console.log(JSON.stringify({ fn: 'mcp', code, ...counts }))
}
