import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { useCoachSettings } from '../src/coach/settings.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * The Coach's settings for the screens that speak: Share shop names is a
 * privacy choice, so a read that fails never turns it on (backend-b-02).
 */
function settingsWith(fake: FakeSupabase) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com" displayName="">
      {children}
    </AppDataProvider>
  )
  return renderHook(() => useCoachSettings(), { wrapper })
}

describe('the Coach’s settings', () => {
  it('reads the owner’s choices', async () => {
    const fake = createFakeSupabase({ ai_settings: [{ user_id: 'u1', tone: 'straight', share_shop_names: false }] })
    const { result } = settingsWith(fake)
    await waitFor(() => expect(result.current).toEqual({ tone: 'straight', shareShopNames: false }))
  })

  it('keeps shop names to itself when the settings could not be read, in the default tone', async () => {
    const fake = createFakeSupabase({ ai_settings: [{ user_id: 'u1', tone: 'cheerleader', share_shop_names: false }] })
    fake.fail('GET ai_settings', '57014')
    const { result } = settingsWith(fake)
    await waitFor(() => expect(result.current).toEqual({ tone: 'cheerleader', shareShopNames: false }))
  })
})
