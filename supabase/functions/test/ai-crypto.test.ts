import { describe, expect, it } from 'vitest'
import { openKey, sealKey } from '../ai/index.js'

/**
 * How a pasted key is sealed before 0016's ai_provider_keys keeps it (ADR
 * 0004): AES-256-GCM under a key derived from a root the helper holds, with
 * the user and the service as additional data. Every key and root here is
 * obviously fake, so the secret scanners have nothing to find.
 */

const USER = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455'
const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-99aabbccddee'
const KEY = 'test-not-a-real-key-0001'
const LEGACY = ['header', 'payload', 'signature'].join('.')
const OWN_ROOT = 'test-not-a-real-root-for-keys'
const FRESH = JSON.stringify({ default: 'sb_secret_notarealkey0001' })

describe('a sealed key', () => {
  it('opens again for the same user and service, and never holds the key in the clear', async () => {
    const sealed = await sealKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', KEY)
    expect(sealed).not.toBeNull()
    if (sealed === null) return
    // The shapes 0016's CHECKs demand of the row.
    expect(sealed.ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(sealed.ciphertext.length).toBeGreaterThanOrEqual(48)
    expect(sealed.iv).toMatch(/^[A-Za-z0-9+/]{16}$/)
    expect(sealed.kek_id).toMatch(/^[0-9a-f]{16}$/)
    expect(sealed.key_v).toBe(1)
    expect(JSON.stringify(sealed)).not.toContain('real-key')
    expect(await openKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', sealed)).toBe(KEY)
  })

  it('is sealed afresh each time, with a new IV', async () => {
    const a = await sealKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', KEY)
    const b = await sealKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', KEY)
    expect(a?.iv).not.toBe(b?.iv)
    expect(a?.ciphertext).not.toBe(b?.ciphertext)
    expect(a?.kek_id).toBe(b?.kek_id)
  })

  it('cannot be opened as another user’s, or as another service’s', async () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: LEGACY }
    const sealed = await sealKey(env, USER, 'gemini', KEY)
    if (sealed === null) throw new Error('not sealed')
    expect(await openKey(env, OTHER, 'gemini', sealed)).toBeNull()
    expect(await openKey(env, USER, 'groq', sealed)).toBeNull()
    // A damaged row is locked too, never an error.
    expect(await openKey(env, USER, 'gemini', { ...sealed, iv: '!!!!' })).toBeNull()
  })
})

describe('which root seals, and which opens', () => {
  it('seals with the owner’s own root first, then the legacy key, then the new secret key', async () => {
    const own = await sealKey({ AI_KEYS_ROOT: OWN_ROOT, SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: FRESH }, USER, 'gemini', KEY)
    const legacy = await sealKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: FRESH }, USER, 'gemini', KEY)
    const fresh = await sealKey({ SUPABASE_SECRET_KEYS: FRESH }, USER, 'gemini', KEY)
    const ids = [own?.kek_id, legacy?.kek_id, fresh?.kek_id]
    expect(new Set(ids).size).toBe(3)
    // Each opens under that one root alone.
    if (own === null || legacy === null || fresh === null) throw new Error('not sealed')
    expect(await openKey({ AI_KEYS_ROOT: OWN_ROOT }, USER, 'gemini', own)).toBe(KEY)
    expect(await openKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', legacy)).toBe(KEY)
    expect(await openKey({ SUPABASE_SECRET_KEYS: FRESH }, USER, 'gemini', fresh)).toBe(KEY)
  })

  it('opens with whichever root its kek_id names, when a root is added later', async () => {
    const sealed = await sealKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', KEY)
    if (sealed === null) throw new Error('not sealed')
    expect(await openKey({ AI_KEYS_ROOT: OWN_ROOT, SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', sealed)).toBe(KEY)
    // Only a root whose id the row names is tried: a row naming one the helper does not hold stays locked.
    expect(await openKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', { ...sealed, kek_id: '0123456789abcdef' })).toBeNull()
  })

  it('is locked, not an error, when the root that sealed it has changed', async () => {
    const sealed = await sealKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY }, USER, 'gemini', KEY)
    if (sealed === null) throw new Error('not sealed')
    const changed = ['header', 'payload', 'rotated'].join('.')
    expect(await openKey({ SUPABASE_SERVICE_ROLE_KEY: changed }, USER, 'gemini', sealed)).toBeNull()
    expect(await openKey({}, USER, 'gemini', sealed)).toBeNull()
  })

  it('seals nothing when the helper holds no root at all', async () => {
    expect(await sealKey({}, USER, 'gemini', KEY)).toBeNull()
    expect(await sealKey({ AI_KEYS_ROOT: '  ', SUPABASE_SECRET_KEYS: 'not json' }, USER, 'gemini', KEY)).toBeNull()
  })
})
