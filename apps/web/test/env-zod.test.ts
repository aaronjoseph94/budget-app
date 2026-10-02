import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { readEnv } from '../src/env.js'
import { refuseSecretKey } from '../src/public-key.js'

describe('zod under the Content-Security-Policy (SEC-NEW-1)', () => {
  // zod tries `Function('')` once to see whether it may compile a fast
  // parser. The policy refuses eval, so every page load filed a violation;
  // turned off before the first parse, the probe is never made.
  it('is set not to probe for eval, from the first parse on', () => {
    expect(readEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'a-public-anon-key-of-some-length' }).ok).toBe(true)
    expect(z.config().jitless).toBe(true)
  })
})

/** A JWT of the given role, as Supabase's legacy keys are; the signature is never checked here. */
const legacyKey = (role: string) =>
  ['{"alg":"HS256","typ":"JWT"}', JSON.stringify({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role })]
    .map((part) => btoa(part).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'))
    .concat('c2lnbmF0dXJl')
    .join('.')

describe('a key that bypasses row-level security, as the public key (security-c2-02)', () => {
  const url = 'https://example.supabase.co'

  it('is refused at runtime, naming the variable and never the value', () => {
    for (const key of ['sb_secret_' + 'x'.repeat(30), legacyKey('service_role'), 'aaaaaaaa.bbbbbbbb.cccccccc']) {
      const out = readEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key })
      expect(out).toEqual({ ok: false, missing: ['VITE_SUPABASE_ANON_KEY'] })
    }
  })

  it('stops the build before anything is written', () => {
    expect(() => refuseSecretKey({ VITE_SUPABASE_ANON_KEY: 'sb_secret_' + 'x'.repeat(30) })).toThrow(
      'VITE_SUPABASE_ANON_KEY is a secret or service_role key, which bypasses every access rule. Use the publishable key.',
    )
    expect(() => refuseSecretKey({ VITE_SUPABASE_ANON_KEY: legacyKey('service_role') })).toThrow(/VITE_SUPABASE_ANON_KEY/)
  })

  it('lets the publishable key, the legacy anon key and an unconfigured build through', () => {
    for (const key of ['sb_publishable_' + 'x'.repeat(30), legacyKey('anon'), 'placeholder-public-key-for-measuring']) {
      expect(readEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key }).ok, key).toBe(true)
      expect(() => refuseSecretKey({ VITE_SUPABASE_ANON_KEY: key })).not.toThrow()
    }
    expect(() => refuseSecretKey({})).not.toThrow()
  })
})
