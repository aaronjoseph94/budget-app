import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { readEnv } from '../src/env.js'

describe('zod under the Content-Security-Policy (SEC-NEW-1)', () => {
  // zod tries `Function('')` once to see whether it may compile a fast
  // parser. The policy refuses eval, so every page load filed a violation;
  // turned off before the first parse, the probe is never made.
  it('is set not to probe for eval, from the first parse on', () => {
    expect(readEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'a-public-anon-key-of-some-length' }).ok).toBe(true)
    expect(z.config().jitless).toBe(true)
  })
})
