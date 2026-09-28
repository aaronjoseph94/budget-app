/**
 * A receipt photo, read through the AI helper's `receipt` task (plan A23),
 * which tries the owner's services that read images in their order; or,
 * while the helper is not there to answer, through the read-receipt Edge
 * Function with the Gemini secret, exactly as before the helper.
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
import { parseReceiptReply, type AiProvider, type ReceiptPhoto, type ReceiptReading } from '@budget/schema'
import { askAi, ranOf, type AiState } from './ai/client.js'
import type { SupabaseClient } from './supabase.js'

const LONG_SIDE = 1600

/** Where a failed reading's one line points: One-time updates, AI settings, or why the AI rests. */
export type ReceiptLink = 'updates' | 'ai' | 'ai-rests'

export type ReceiptRead =
  | { readonly ok: true; readonly reading: ReceiptReading; readonly by: string }
  | { readonly ok: false; readonly message: string; readonly link: ReceiptLink | null }

const MESSAGES: Record<string, string> = {
  unreadable: 'That does not look like a receipt, or the total could not be read. Try a closer, flatter photo in good light.',
  no_total: 'The total could not be found on that receipt. You can type it in below.',
  model_output_invalid: 'The reading came back in a form the app cannot trust, so it was not used. Try again, or type it in.',
  rate_limited: 'Too many receipts in a short time for the free tier. Wait a minute and try again.',
  // read-receipt answers only when the AI helper is missing or waits for
  // its update, so the fix for both is that update, not a Supabase secret
  // or a file in the repository (N108).
  not_configured: 'Reading receipt photos needs a one-time update, so the photo was not read. Type it in below meanwhile.',
  model_not_found: 'Reading receipt photos needs a one-time update, so the photo was not read. Type it in below meanwhile.',
  not_signed_in: 'You are not signed in any more. Sign in again and retry.',
  provider_unreachable: 'Could not reach Gemini. Check your connection and try again.',
  provider_error: 'Gemini could not read that photo right now. Try again in a moment.',
  bad_request: 'That photo could not be sent. Try a different one.',
  image_unreadable: 'That file could not be opened as a photo.',
}

const fallback = 'Receipt reading is not available right now. Try again, or type it in.'

/** The company that read it, as the Photo tab names it. */
const BY: Readonly<Record<AiProvider, string>> = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', openai: 'OpenAI', anthropic: 'Anthropic' }

/**
 * When read-receipt answers instead: the helper is not deployed, 0016 is
 * not pasted, or the helper cannot do its part (an older copy refuses the
 * receipt task as a bad request, which reads as helper_error). The owner's
 * own choices, AI off, a limit or a rest, are never gone around.
 */
const FALLS_BACK: ReadonlySet<AiState> = new Set(['not_deployed', 'needs_update', 'helper_error'])

/** Why the helper read nothing, in the Photo tab's words, with the one place that fixes it. */
function stopped(state: AiState, sentence: string): Extract<ReceiptRead, { ok: false }> {
  const rests = 'The AI is resting, so the photo was not read. Type it in below, or try again later.'
  switch (state) {
    case 'off':
      return { ok: false, message: 'AI is off, so the photo was not read. Type it in below, or turn AI back on.', link: 'ai' }
    case 'not_set_up':
      return { ok: false, message: 'No AI service that reads photos is set up yet. Free Google Gemini reads them; type it in below meanwhile.', link: 'ai' }
    case 'limit_reached':
    case 'all_resting':
    case 'all_failed':
      return { ok: false, message: rests, link: 'ai-rests' }
    case 'key_rejected':
    case 'keys_locked':
      return { ok: false, message: sentence, link: 'ai' }
    case 'not_signed_in':
      return { ok: false, message: MESSAGES['not_signed_in'] ?? fallback, link: null }
    default:
      return { ok: false, message: sentence, link: null }
  }
}

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
export function base64Of(bytes: Uint8Array): string {
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

/** The reply's text through the one receipt zod, whichever function it came from. */
function readingOf(text: string, by: string): ReceiptRead {
  const parsed = parseReceiptReply(text)
  return parsed.ok ? { ok: true, reading: parsed.reading, by } : { ok: false, message: MESSAGES[parsed.failure] ?? fallback, link: null }
}

export async function readReceipt(supabase: SupabaseClient, file: File): Promise<ReceiptRead> {
  const image = await toJpegBase64(file)
  if (image === null) return { ok: false, message: MESSAGES['image_unreadable'] ?? fallback, link: null }
  return readReceiptPhoto(supabase, { image, mimeType: 'image/jpeg' })
}

/** The helper first; read-receipt only when the helper is not there to answer. */
export async function readReceiptPhoto(supabase: SupabaseClient, photo: ReceiptPhoto): Promise<ReceiptRead> {
  const answer = await askAi(supabase, { action: 'run', task: 'receipt', data: photo })
  if (answer.ok) {
    const ran = ranOf(answer.data)
    return ran === null ? { ok: false, message: MESSAGES['model_output_invalid'] ?? fallback, link: null } : readingOf(ran.text, BY[ran.provider])
  }
  if (!FALLS_BACK.has(answer.view.state)) return stopped(answer.view.state, answer.view.sentence)
  return viaReadReceipt(supabase, photo)
}

/** read-receipt, as the app called it before the helper: the Gemini secret, one model, no failover. */
async function viaReadReceipt(supabase: SupabaseClient, photo: ReceiptPhoto): Promise<ReceiptRead> {
  const { data, error } = await supabase.functions.invoke('read-receipt', { body: photo })

  if (error !== null) {
    // The function answers failures with { ok: false, code }. supabase-js
    // puts that response on error.context; its own message is generic.
    const reply = (error as { context?: unknown }).context
    // Supabase's own 404: read-receipt is not deployed, and the helper is
    // missing or waits for 0016, so the step left is a one-time update.
    if (reply instanceof Response && reply.status === 404) {
      return { ok: false, message: 'Reading receipt photos needs a one-time update, so the photo was not read. Type it in below meanwhile.', link: 'updates' }
    }
    let code = ''
    try {
      const body: unknown = reply instanceof Response ? await reply.json() : null
      if (typeof body === 'object' && body !== null && 'code' in body) code = String(body.code)
    } catch {
      code = ''
    }
    return { ok: false, message: MESSAGES[code] ?? fallback, link: code === 'not_configured' || code === 'model_not_found' ? 'updates' : null }
  }

  const replyText = typeof data === 'object' && data !== null && 'reply' in data ? data.reply : null
  if (typeof replyText !== 'string') return { ok: false, message: fallback, link: null }
  return readingOf(replyText, 'Gemini')
}
