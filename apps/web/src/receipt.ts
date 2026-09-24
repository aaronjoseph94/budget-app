/**
 * A receipt photo, read by Gemini through the read-receipt Edge Function.
 *
 * The photo is shrunk on the phone first: an iPhone photo is several megabytes
 * and 12 megapixels, and a receipt is readable at 1600px on its long side.
 * Smaller is faster on a phone connection and well inside the free tier's
 * request limits. Drawing it through a canvas also turns an iPhone HEIC into a
 * JPEG, which is a format the function accepts, and drops the photo's location
 * metadata on the way.
 *
 * The photo itself is not stored anywhere — not in Supabase, not here.
 */
import { parseReceiptReply, type ReceiptReading } from '@budget/schema'
import type { SupabaseClient } from './supabase.js'

const LONG_SIDE = 1600

export type ReceiptRead =
  | { readonly ok: true; readonly reading: ReceiptReading }
  | { readonly ok: false; readonly message: string }

const MESSAGES: Record<string, string> = {
  unreadable: 'That does not look like a receipt, or the total could not be read. Try a closer, flatter photo in good light.',
  no_total: 'The total could not be found on that receipt. You can type it in below.',
  model_output_invalid: 'The reading came back in a form the app cannot trust, so it was not used. Try again, or type it in.',
  rate_limited: 'Too many receipts in a short time for the free tier. Wait a minute and try again.',
  not_configured: 'Receipt reading is not set up yet — the Gemini key has not been added in Supabase. See docs/setup.md.',
  model_not_found: 'The Gemini model this uses has been retired. Set GEMINI_MODEL in Supabase to a current one.',
  not_signed_in: 'You are not signed in any more. Sign in again and retry.',
  provider_unreachable: 'Could not reach Gemini. Check your connection and try again.',
  provider_error: 'Gemini could not read that photo right now. Try again in a moment.',
  bad_request: 'That photo could not be sent. Try a different one.',
  image_unreadable: 'That file could not be opened as a photo.',
}

const fallback = 'Receipt reading is not available right now. Try again, or type it in.'

/** Shrink and re-encode the photo as JPEG, returning its base64 body. */
async function toJpegBase64(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (ctx === null) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    // toBlob encodes off the main thread; toDataURL did it in place, and a
    // 12-megapixel photo held the page still for about 300 ms (PERF-9).
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return jpeg === null ? null : base64Of(new Uint8Array(await jpeg.arrayBuffer()))
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Bytes as base64, a slice at a time: one call with every byte overruns the argument limit. */
function base64Of(bytes: Uint8Array): string {
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

export async function readReceipt(supabase: SupabaseClient, file: File): Promise<ReceiptRead> {
  const image = await toJpegBase64(file)
  if (image === null) return { ok: false, message: MESSAGES['image_unreadable'] ?? fallback }

  const { data, error } = await supabase.functions.invoke('read-receipt', {
    body: { image, mimeType: 'image/jpeg' },
  })

  if (error !== null) {
    // The function answers failures with { ok: false, code }. supabase-js
    // puts that response on error.context; its own message is generic.
    let code = ''
    try {
      const body: unknown = await (error as { context?: Response }).context?.json()
      if (typeof body === 'object' && body !== null && 'code' in body) code = String(body.code)
    } catch {
      code = ''
    }
    return { ok: false, message: MESSAGES[code] ?? fallback }
  }

  const replyText = typeof data === 'object' && data !== null && 'reply' in data ? data.reply : null
  if (typeof replyText !== 'string') return { ok: false, message: fallback }

  const parsed = parseReceiptReply(replyText)
  return parsed.ok ? parsed : { ok: false, message: MESSAGES[parsed.failure] ?? fallback }
}
