import type { ConfigEnv, UserConfigFnObject } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import config from '../vite.config.js'
import { SECRET_KEY_REFUSED } from '../src/public-key.js'

/**
 * The build's own refusal, through the real config (security-c2-02): the
 * check alone was tested, and taking its call out of vite.config.ts left
 * every test green while a secret key would be compiled into the
 * published JavaScript.
 */

const build: ConfigEnv = { mode: 'production', command: 'build' }
const run = () => (config as UserConfigFnObject)(build)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('building with the public key set', () => {
  it('stops when the key is a secret one, naming the variable and not the value', () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_secret_' + 'x'.repeat(30))
    expect(run).toThrow(SECRET_KEY_REFUSED)
  })

  it('goes ahead with the publishable key', () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_' + 'x'.repeat(30))
    expect(run()).toHaveProperty('plugins')
  })
})
