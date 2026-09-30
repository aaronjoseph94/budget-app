/**
 * Where the pasted function starts: it serves only when it runs under Deno,
 * and hands over only the names the server reads (never a service key).
 */
import { handle } from './handle.js'

if (typeof Deno !== 'undefined') {
  Deno.serve((req) =>
    handle(
      req,
      {
        SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
        SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
        EXTRA_ORIGINS: Deno.env.get('EXTRA_ORIGINS'),
      },
      fetch,
    ),
  )
}
