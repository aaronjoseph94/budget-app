/**
 * savings-coach — the Coach's words, as pure functions (CAPABILITY-MAP.md).
 *
 * packages/core decides what is true and computes every figure; this package
 * decides how it is said: the app's own templates, which facts become cards,
 * and how a sentence with blanks is split into text and figures. No I/O, no
 * clock, no randomness, no DOM and no zod, so every rule about what the
 * Coach may say is testable without a network (ADR 0005).
 */
export { renderSegments, type RenderSegmentsInput, type RenderSegmentsOutput, type Segment } from './segments.js'
export {
  LINE_TEMPLATES,
  PLAIN_TEMPLATES,
  TONES,
  WATCH_TEMPLATES,
  cardTemplateKey,
  slotsOf,
  type CardTemplateKey,
  type LineKey,
  type Template,
  type Tone,
  type WatchKey,
  type WatchTemplate,
} from './templates.js'
export { dayLine, type DayLine } from './line.js'
