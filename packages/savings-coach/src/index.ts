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
  GOAL_LINE_TEMPLATES,
  LINE_TEMPLATES,
  PLAIN_TEMPLATES,
  TONES,
  WATCH_TEMPLATES,
  cardTemplateKey,
  cardWords,
  slotsOf,
  type CardTemplateKey,
  type LineKey,
  type Template,
  type Tone,
  type WatchKey,
  type WatchTemplate,
} from './templates.js'
export { dayLine, type DayLine } from './line.js'
export { forecastCard, rankCards, type Card, type CardAction, type RankCardsInput } from './rank.js'
export { LIBRARY, LIBRARY_VERSION, QUOTE_TAGS, type LibraryEntry, type QuoteTag } from './library.js'
export { pickQuote, quoteTags, type PickQuoteInput, type PickedQuote, type QuoteTagsInput } from './pick-quote.js'
export {
  canonicalJson,
  canonicalPayload,
  cardSignature,
  goalLineSignature,
  letterOf,
  maskLabel,
  modelPayload,
  type CardSignatureInput,
  type ModelPayload,
  type ModelPayloadInput,
  type PayloadGoal,
} from './payload.js'
export { checkReply, type CheckDrop, type CheckDropReason, type CheckReplyInput, type CheckedReply } from './check-reply.js'
export { reportBrief, reportFacts, type ReportFact, type ReportFactKind, type ReportFacts, type ReviewedMonth } from './report.js'
