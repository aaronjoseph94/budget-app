/**
 * A link inside a sentence, as "…needs a one-time update. See One-time
 * updates".
 *
 * These were `inline-flex min-h-11`, a 44 px box, which made the line it
 * sat on 44 px tall and left a gap in the middle of the sentence when it
 * wrapped (N76, N86). Padding on an inline element grows the area a finger
 * can press to 44 px without moving the line: 14 px above and below the
 * letters, whose own box is about 16 px at the app's sizes (measured 44
 * to 47 in the preview). A link on a line of its own keeps the box.
 */
export const SENTENCE_LINK = 'py-3.5 font-medium underline underline-offset-4'
