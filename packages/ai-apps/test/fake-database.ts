/**
 * A fake of the database behind the read tools: Auth accepts the AI app's
 * token, and each RPC is answered by the test. Nothing reaches Supabase.
 */
import { handle } from '../src/handle.js'
import { AI_APP_TOKEN, ENV, PROJECT, fakeFetch, signedIn, type Respond } from './fake-auth.js'

export type Rpc = (fn: string, args: Record<string, unknown>) => Response

/** Auth accepts the token; each RPC is answered by `rpc`. */
export function database(rpc: Rpc): Respond {
  return (url, init) => {
    const fn = /\/rest\/v1\/rpc\/(\w+)$/.exec(url)?.[1]
    return fn === undefined ? signedIn(url, init) : rpc(fn, JSON.parse(String(init.body)) as Record<string, unknown>)
  }
}

export const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function ask(respond: Respond, method: string, params?: unknown) {
  const fake = fakeFetch(respond)
  const res = await handle(
    new Request(`${PROJECT}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${AI_APP_TOKEN}`,
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
    }),
    ENV,
    fake.fetchFn,
  )
  const text = await res.text()
  const message = JSON.parse(/^data: (.*)$/m.exec(text)?.[1] ?? text) as { result: Record<string, unknown> }
  return { result: message.result, rpcCalls: fake.calls.filter((c) => c.url.includes('/rest/')) }
}

/** Call one tool, as an AI app would. */
export const callTool = (rpc: Rpc, name: string, args: Record<string, unknown>) => ask(database(rpc), 'tools/call', { name, arguments: args })
