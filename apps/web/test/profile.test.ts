import { describe, expect, it } from 'vitest'
import { NO_MARKS, displayNameOf, saveDisplayName, saveSetupMarks, setupMarksOf } from '../src/profile.js'
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

describe('setupMarksOf', () => {
  it('reads what Getting started kept, and anything else there as nothing kept', () => {
    expect(setupMarksOf({ setup_later: ['goals', 7, 'phone'], setup_phone_ticked: true, setup_opened: true })).toEqual({
      later: ['goals', 'phone'],
      phoneTicked: true,
      opened: true,
    })
    expect(setupMarksOf({ setup_later: 'goals', setup_phone_ticked: 'yes', setup_opened: 1 })).toEqual(NO_MARKS)
    expect(setupMarksOf(undefined)).toEqual(NO_MARKS)
  })
})

describe('saveSetupMarks', () => {
  it('keeps only the marks it is given, beside the name and the others', async () => {
    const fake = createFakeSupabase()
    fake.user.user_metadata = { display_name: 'Sam', setup_opened: true }
    await fake.signIn()

    await saveSetupMarks(fake.client, { later: ['ai'] })

    expect(fake.user.user_metadata).toEqual({ display_name: 'Sam', setup_opened: true, setup_later: ['ai'] })
    await saveSetupMarks(fake.client, { phoneTicked: false })
    expect(setupMarksOf(fake.user.user_metadata)).toEqual({ later: ['ai'], phoneTicked: false, opened: true })
  })

  it('fails in words when the server refuses', async () => {
    const fake = createFakeSupabase()
    await fake.signIn()
    fake.fail('auth/user', '500')

    await expect(saveSetupMarks(fake.client, { opened: true })).rejects.toThrow('That was not saved. Check your connection and try again.')
    expect(fake.user.user_metadata).toEqual({})
  })
})
