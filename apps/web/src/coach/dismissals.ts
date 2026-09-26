/**
 * Insights the owner dismissed with ✕, kept in 0017's insight_dismissals by
 * their cause (plan §2.3): `category_change:<id>:2026-09-01:up`, say. The
 * same cause stays gone on every device; a new cause for the same thing,
 * such as next month's rise, comes back, because it is news.
 *
 * Without 0017 nothing is dismissed and ✕ is not offered, since a
 * dismissal that could not be kept would come straight back.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAppData } from '../app-data.js'
import { ReadRefused, needsOneTimeUpdate } from '../ledger.js'

/** A shop the owner marked "Not a subscription" on Reports → Shops, kept as a dismissal (F38). */
const NOT_SUBSCRIPTION = 'not_subscription:'
/** 0017 keeps at most 160 characters after the cause's colon. */
const MAX_SHOP = 160

export function notSubscriptionCause(shop: string): string | null {
  return [...shop].length > MAX_SHOP ? null : `${NOT_SUBSCRIPTION}${shop}`
}

/** The shops marked "Not a subscription", from the dismissed causes. */
export function notSubscriptionsOf(dismissed: ReadonlySet<string>): readonly string[] {
  return [...dismissed].filter((k) => k.startsWith(NOT_SUBSCRIPTION)).map((k) => k.slice(NOT_SUBSCRIPTION.length))
}

export interface Dismissals {
  /** Null while it loads. */
  readonly dismissed: ReadonlySet<string> | null
  /** False when 0017 is not in, or the read failed: ✕ is not offered. */
  readonly canDismiss: boolean
  /** The read failed because 0017 is not in yet, so a screen can point to One-time updates. */
  readonly missingUpdate: boolean
  readonly dismiss: (cause: string) => Promise<boolean>
}

export function useDismissals(): Dismissals {
  const { supabase, userId } = useAppData()
  const [state, setState] = useState<{ dismissed: ReadonlySet<string> | null; canDismiss: boolean; missingUpdate: boolean }>({
    dismissed: null,
    canDismiss: false,
    missingUpdate: false,
  })

  useEffect(() => {
    let live = true
    void supabase
      .from('insight_dismissals')
      .select('insight_key')
      .then(({ data, error }) => {
        if (!live) return
        if (error !== null) {
          const missingUpdate = needsOneTimeUpdate(new ReadRefused('Dismissed insights could not be read.', error.code))
          return setState({ dismissed: new Set(), canDismiss: false, missingUpdate })
        }
        const keys = (data as readonly { insight_key: unknown }[]).map((r) => r.insight_key).filter((k): k is string => typeof k === 'string')
        setState({ dismissed: new Set(keys), canDismiss: true, missingUpdate: false })
      })
    return () => void (live = false)
  }, [supabase])

  const dismiss = useCallback(
    async (cause: string) => {
      const { error } = await supabase
        .from('insight_dismissals')
        .upsert({ user_id: userId, insight_key: cause }, { onConflict: 'user_id,insight_key', ignoreDuplicates: true })
      if (error !== null) return false
      setState((s) => ({ ...s, dismissed: new Set([...(s.dismissed ?? []), cause]) }))
      return true
    },
    [supabase, userId],
  )

  return { ...state, dismiss }
}
