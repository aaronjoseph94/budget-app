/**
 * A CSV file's bytes as text, in the encoding it was saved in.
 *
 * `file.text()` always decodes UTF-8, so a statement saved by Windows or an
 * older bank system (Windows-1252) showed "CAFÉ" as "CAF�", in the preview
 * and in Review. A byte-order mark names UTF-8 or UTF-16 outright; without
 * one, bytes that are valid UTF-8 are UTF-8, and any others are read as
 * Windows-1252, which gives every byte a character. Bytes that are no text
 * at all still read as noise, which `looksLikeText` refuses.
 */
export function decodeStatementText(bytes: Uint8Array): string {
  const [a, b, c] = bytes
  if (a === 0xef && b === 0xbb && c === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (a === 0xff && b === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (a === 0xfe && b === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // Not UTF-8: the one other encoding statements are saved in.
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
