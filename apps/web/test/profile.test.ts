import { describe, expect, it } from 'vitest'
import { displayNameOf, saveDisplayName } from '../src/profile.js'
import { createFakeSupabase } from './fake-supabase.js'

describe('displayNameOf', () => {
  it('reads the name Setup stored, and nothing else', () => {
    expect(displayNameOf({ display_name: 'Sam' })).toBe('Sam')
    // A name typed in the Supabase dashboard lands elsewhere; not ours to read.
    expect(displayNameOf({ full_name: 'Sam Smith' })).toBe('')
    expect(displayNameOf({ display_name: 42 })).toBe('')
    expect(displayNameOf(undefined)).toBe('')
  })
})

describe('saveDisplayName', () => {
  it('merges the name into your sign-in, keeping what else is there', async () => {
    const fake = createFakeSupabase()
    fake.user.user_metadata.theme = 'dark'
    await fake.signIn()

    await saveDisplayName(fake.client, 'Alex')

    expect(fake.user.user_metadata).toEqual({ theme: 'dark', display_name: 'Alex' })
    const { data } = await fake.client.auth.getUser()
    expect(displayNameOf(data.user?.user_metadata)).toBe('Alex')
  })

  it('fails in words, and saves nothing, when the server refuses', async () => {
    const fake = createFakeSupabase()
    await fake.signIn()
    fake.fail('auth/user', '500')

    await expect(saveDisplayName(fake.client, 'Alex')).rejects.toThrow(
      'Your name was not saved. Check your connection and try again.',
    )
    expect(fake.user.user_metadata).toEqual({})
  })
})
