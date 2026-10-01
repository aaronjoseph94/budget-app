/**
 * How the Coach talks, for the screens that speak (plan §2.3, A12): the
 * owner's tone and Share shop names from ai_settings. Null while it loads,
 * so no sentence is drawn in one tone and redrawn in the other. A missing
 * 0016, or a read that fails, is 0016's default tone: the Coach cheers the
 * owner on, and says nothing about the failure here, since AI settings
 * is where it can be fixed. Share shop names is a privacy choice, so an
 * unread one is taken as off, never as 0016's on (backend-b-02).
 */
import { useEffect, useState } from 'react'
import { useAppData } from '../app-data.js'
import { DEFAULT_COACH, readCoachSettings, type CoachSettings } from '../ai/coach-settings.js'

export function useCoachSettings(): CoachSettings | null {
  const { supabase, userId } = useAppData()
  const [settings, setSettings] = useState<CoachSettings | null>(null)
  useEffect(() => {
    let live = true
    void readCoachSettings(supabase, userId).then((read) => {
      if (live) setSettings(read.ok ? read.settings : { ...DEFAULT_COACH, shareShopNames: false })
    })
    return () => void (live = false)
  }, [supabase, userId])
  return settings
}
