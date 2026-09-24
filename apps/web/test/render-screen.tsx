import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppDataProvider } from '../src/app-data.js'
import type { FakeSupabase } from './fake-supabase.js'

/**
 * Render a screen the way App does: inside the real AppDataProvider, which
 * loads the account, categories, goals and queue size through the fake client.
 * Nothing the screen reads is handed to it directly, so a test also covers
 * the provider's own loading.
 */
export function renderScreen(screen: ReactNode, fake: FakeSupabase, displayName = ''): RenderResult {
  return render(
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com" displayName={displayName}>
      {screen}
    </AppDataProvider>,
  )
}
