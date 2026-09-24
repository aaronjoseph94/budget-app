/**
 * Module resolution dependency-cruiser cannot take in its own config.
 *
 * The Edge Functions import zod as Deno does, `npm:zod@4.6.5`, so each can be
 * pasted into the dashboard alone. tsc and vitest alias that name to the
 * functions package's zod (supabase/functions/tsconfig.json, vitest.config.ts);
 * this is the same alias for the boundary check, which otherwise reports the
 * import as unresolvable and could not see where it really goes.
 */
module.exports = {
  resolve: { alias: { 'npm:zod@4.6.5$': 'zod' } },
}
