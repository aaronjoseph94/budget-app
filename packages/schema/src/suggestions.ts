import { z } from 'zod'
import { CategoryKindSchema } from './enums.js'
import { CentsSchema, IngestedTextSchema, IsoDateSchema, TimestampSchema, UuidSchema } from './primitives.js'

/**
 * A suggested change as it is stored (0039's ai_app_proposals) and read
 * back by Review and the AI apps server (ADR 0013). An AI app wrote it, so
 * it is a model's output at rest, parsed here like any model response: a
 * row that does not parse is shown as one that cannot be read, with
 * Dismiss only. Each kind's target, after and before are the values
 * PROPOSALS.md §2 names; no figure is ever read from them.
 */
const id = UuidSchema
const centsOrNone = z.union([CentsSchema, z.null()])
const dayOrNone = z.union([z.number().int().min(1).max(31), z.null()])
const category = z.object({ category_id: id }).strict()
const charge = z.object({ transaction_id: id }).strict()
const named = z.object({ name: IngestedTextSchema }).strict()
const listed = z.object({ list: CategoryKindSchema }).strict()
const amount = z.object({ cents: centsOrNone }).strict()
const bill = z.object({ cents: centsOrNone, due_day: dayOrNone }).strict()
const goal = z.object({ target_cents: CentsSchema, target_date: z.union([IsoDateSchema, z.null()]) }).strict()
const newCategory = z.object({ name: IngestedTextSchema, list: CategoryKindSchema }).strict()

const common = {
  id,
  client_id: id,
  reason: IngestedTextSchema,
  created_at: TimestampSchema,
  expires_at: TimestampSchema,
}

export const StoredSuggestionSchema = z.discriminatedUnion('kind', [
  z.object({
    ...common,
    kind: z.literal('set_budget'),
    target: z.object({ category_id: id, month: IsoDateSchema, applies: z.enum(['onward', 'only']) }).strict(),
    after: amount,
    before: amount,
  }),
  z.object({ ...common, kind: z.literal('set_weekly_limit'), target: category, after: amount, before: amount }),
  z.object({ ...common, kind: z.literal('set_bill'), target: z.object({ category_id: id, month: IsoDateSchema }).strict(), after: bill, before: bill }),
  z.object({ ...common, kind: z.literal('set_goal'), target: z.object({ goal_id: id }).strict(), after: goal, before: goal }),
  z.object({ ...common, kind: z.literal('rename_category'), target: category, after: named, before: named }),
  z.object({ ...common, kind: z.literal('add_category'), target: newCategory, after: newCategory, before: z.object({ exists: z.literal(false) }).strict() }),
  z.object({ ...common, kind: z.literal('move_category'), target: category, after: listed, before: listed }),
  z.object({ ...common, kind: z.literal('recategorise'), target: charge, after: z.object({ category_id: id }).strict(), before: z.object({ category_id: id }).strict() }),
  z.object({
    ...common,
    kind: z.literal('learn_shop'),
    target: charge,
    after: z.object({ category_id: id }).strict(),
    before: z.object({ category_id: id, rule_category_id: z.union([id, z.null()]) }).strict(),
  }),
])
export type StoredSuggestion = z.output<typeof StoredSuggestionSchema>

/** The kinds, in the order PROPOSALS.md §2 lists them. */
export const SUGGESTION_KINDS = StoredSuggestionSchema.options.map((o) => o.shape.kind.value)
export type SuggestionKind = StoredSuggestion['kind']
