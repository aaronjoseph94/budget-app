import { useEffect, useRef, useState } from 'react'
import { useAppData } from '../app-data.js'
import { forgetShop, listLearnedShops, type LearnedShop } from '../learned-shops.js'
import { IngestedText } from '../ui.js'
import { Section } from '../forecast/parts.js'
import { Alert, Loading, SavedNote } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { useFocusDrawn, useFocusWhereItWas } from '../lib/return-focus.js'

/** Shops drawn before "Show all", as the Month's charges are (PERF-4). */
const FIRST = 20

/**
 * Settings → Shops the app files by itself (N17): each learned shop, the
 * category it goes to, and Forget. Forgetting changes no charge already
 * filed; the shop's next charges wait in Review, where approving one
 * teaches it again.
 */
export function LearnedShopsCard() {
  const { supabase, categories, version } = useAppData()
  const [shops, setShops] = useState<readonly LearnedShop[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let live = true
    listLearnedShops(supabase)
      .then((read) => live && setShops(read))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'The shops the app has learned could not be read just now.'))
    return () => {
      live = false
    }
  }, [supabase, version])

  const named = new Map(categories.map((c) => [c.id, c.name]))
  const shown = shops === null ? [] : all ? shops : shops.slice(0, FIRST)
  const list = useRef<HTMLUListElement>(null)
  const focusFrom = useFocusDrawn(list, shown.length)
  // Forget goes with its row: the next shop's Forget takes focus, or the
  // line saying none are left (e2e-setup-06).
  const none = useRef<HTMLParagraphElement>(null)
  const refocus = useFocusWhereItWas(list, `${busy ?? ''} ${shown.map((s) => s.id).join(' ')}`, 'button', none)
  const forget = async (shop: LearnedShop) => {
    setBusy(shop.id)
    setError(null)
    setNote(null)
    try {
      await forgetShop(supabase, shop.id)
      setShops((now) => now?.filter((s) => s.id !== shop.id) ?? null)
      setNote(`Forgotten. The next charge from ${shop.merchant} waits in Review for a category.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That shop was not forgotten. Try again.')
    } finally {
      refocus(shown.indexOf(shop))
      setBusy(null)
    }
  }

  return (
    <Section large title="Shops filed by themselves">
      <p className="text-muted-foreground">
        Each shop you have approved or moved with “Always file” is filed the same way from then on. Forget one and its next
        charge waits in Review again. Charges already filed stay where they are.
      </p>
      {error !== null ? <Alert tone="error">{error}</Alert> : null}
      {note !== null ? <SavedNote className="text-sm text-income">{note}</SavedNote> : null}
      {shops === null && error === null ? <Loading what="the shops the app has learned" /> : null}
      {shops !== null && shops.length === 0 ? (
        <p ref={none} tabIndex={-1} className="text-sm text-muted-foreground outline-none">
          None yet. Approve a charge in Review and its shop is learned.
        </p>
      ) : null}
      {shown.length > 0 ? (
        <ul ref={list} aria-label="Learned shops" className="divide-y rounded-lg border">
          {shown.map((shop) => (
            <li key={shop.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                {/* In the fixed-width face, as a statement printed it (step 10). */}
                <p className="font-mono [overflow-wrap:anywhere]">
                  <IngestedText>{shop.merchant}</IngestedText>
                </p>
                <p className="text-muted-foreground">{named.get(shop.categoryId) ?? 'A category that did not load'}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Forget ${shop.merchant}`}
                disabled={busy !== null}
                onClick={() => void forget(shop)}
              >
                {busy === shop.id ? 'Forgetting…' : 'Forget'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {shops !== null && shown.length < shops.length ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            focusFrom(FIRST)
            setAll(true)
          }}
        >
          Show all {shops.length}
        </Button>
      ) : null}
    </Section>
  )
}
