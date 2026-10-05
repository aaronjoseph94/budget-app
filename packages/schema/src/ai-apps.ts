import { z } from 'zod'
import { ASK_MONTHS, ASK_PERIODS } from './ask.js'
import { IngestedTextSchema } from './primitives.js'

/**
 * The AI apps server's version (ADR 0012), which its `/mcp/health` answers so
 * One-time updates can tell an old paste of `mcp-function.ts` from this
 * site's. Bumped with every change the owner must paste, as `YYYY-MM-DD.N`.
 */
export const MCP_SERVER_VERSION = '2026-10-02.1'

/*
 * What an AI app may send the server's tools (PLAN §2.4): each tool's input
 * object is built from these, `.strict()`.
 * zod's messages name the field and never echo the value.
 */

/**
 * Money in is text, never a JSON number, so no float ever arrives: dollars
 * with at most two decimals, grouped by commas or not, at most $999,999.99
 * before the tools' own cap. Read by statement-parsers' parseTypedAmount.
 */
export const AmountTextSchema = z.string().regex(/^\$?(\d{1,3}(,\d{3})+|\d{1,6})(\.\d{1,2})?$/, 'Expected an amount like 12.50')

/** A category, goal, debt or pay schedule's name, as the AI read it from a result. */
export const NameSchema = z.string().trim().min(1).max(60)

/** Which of the workbook's lists; Not spending is named only where a tool allows it. */
export const ListSchema = z.enum(['variable', 'bill', 'debt', 'subscription', 'income', 'savings'])

/**
 * Characters that draw as nothing: soft hyphen, the Arabic letter mark,
 * the Mongolian vowel separator, zero-width space/joiners and the LRM/RLM
 * marks, the word joiner and invisible operators, and the BOM. Two words
 * that differ only by one look the same in Review while hashing apart
 * (security review mcp-2-05). Refused only where an AI app adds: a shop's
 * own name on a statement may need U+200C or U+200D. 0034 refuses the same
 * set in ai_app_add_candidate.
 */
const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u2060-\u2065\uFEFF]/
const shown = (text: string) => !INVISIBLE.test(text)

/** What an AI app adds was: the owner's own words, held as ingested text, trimmed, every character visible. */
export const WordsSchema = z.string().trim().max(120).pipe(IngestedTextSchema).refine(shown, 'Expected no invisible characters')

/** `list_categories` takes nothing. */
export const ListCategoriesInputSchema = z.object({}).strict()

/** Something the owner said, for `add_note`, read as Just type it reads it. */
export const NoteTextSchema = z.string().trim().max(300).pipe(IngestedTextSchema).refine(shown, 'Expected no invisible characters')

/**
 * `get_period`: `date` picks the period holding that day, the owner's today
 * when left out; `income` names whose paydays a pay period follows.
 */
export const GetPeriodInputSchema = z
  .object({
    period: z.enum(['month', 'week', 'pay_period', 'year']).default('month'),
    date: z.iso.date().optional(),
    income: NameSchema.optional(),
    list: ListSchema.optional(),
    categories: z.array(NameSchema).min(1).max(10).optional(),
    compare: z.boolean().default(true),
  })
  .strict()

/**
 * `get_spending`: the questions the app's Ask answers from figures alone,
 * over one of its periods, or a month by name this year or last (`month`
 * is used instead of `period` when both are given).
 */
export const GetSpendingInputSchema = z
  .object({
    question: z.enum(['spend_in', 'compare', 'top_categories', 'top_shops', 'subscriptions', 'explain_month']),
    period: z.enum(ASK_PERIODS).optional(),
    month: z.enum(ASK_MONTHS).optional(),
    year: z.enum(['this', 'last']).default('this'),
    categories: z.array(NameSchema).min(1).max(3).optional(),
  })
  .strict()

/** `get_debts`: every debt, and with `debt` its schedule for `months` months from this one. */
export const GetDebtsInputSchema = z
  .object({
    debt: NameSchema.optional(),
    months: z.number().int().min(1).max(36).default(12),
  })
  .strict()

/** `get_forecast`: this month's forecast, as the Forecast shows it, and what a month's saving would do for the main goal. */
export const GetForecastInputSchema = z.object({ what_if_monthly_saving: AmountTextSchema.optional() }).strict()

/** `get_savings_goals` takes nothing: every goal, as Savings shows it. */
export const GetSavingsGoalsInputSchema = z.object({}).strict()

/**
 * `search_transactions`: approved rows by words in the shop's name, the
 * categories' exact names, a list (Not spending too), dates and amounts
 * compared without their sign. The dates' defaults and span are the server's.
 */
export const SearchTransactionsInputSchema = z
  .object({
    text: z.string().trim().max(60).pipe(IngestedTextSchema).optional(),
    categories: z.array(NameSchema).min(1).max(10).optional(),
    list: z.enum([...ListSchema.options, 'transfer']).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    min_amount: AmountTextSchema.optional(),
    max_amount: AmountTextSchema.optional(),
    flow: z.enum(['spent', 'received', 'any']).default('any'),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()

/** `list_review_queue`: what waits in Review, oldest first, at most `limit` rows. */
export const ListReviewQueueInputSchema = z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict()

/** Which identical purchase of the day this is: the dedupe hash's occurrence (1 is the first). */
const SameAgainSchema = z.number().int().min(1).max(9).default(1)

/**
 * `add_expense`: one purchase, or money received, for Review. The amount is
 * dollars without a sign, `flow` gives it one; the date must fall in the
 * owner's past year, which only the server can check, knowing their today.
 */
export const AddExpenseInputSchema = z
  .object({
    amount: AmountTextSchema,
    what: WordsSchema,
    date: z.iso.date().optional(),
    flow: z.enum(['spent', 'received']).default('spent'),
    category: NameSchema.optional(),
    same_again: SameAgainSchema,
  })
  .strict()

/** `add_note`: what the owner said, read as Just type it reads it; `same_again` as add_expense's. */
export const AddNoteInputSchema = z.object({ text: NoteTextSchema, category: NameSchema.optional(), same_again: SameAgainSchema }).strict()

/*
 * Suggesting changes (ADR 0013, PROPOSALS.md §2): what an AI app may ask
 * the owner to apply. Each change names what it changes as list_categories,
 * get_savings_goals and search_transactions hand it out, and carries a
 * reason, which is stored and shown as the AI app's words.
 */

/** A month as `YYYY-MM`; the server holds it to this month and the twelve after. */
const MonthTextSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month like 2026-11')

/** Why, in the AI app's words: one line, every character visible, at most 300 characters. */
export const ReasonSchema = z.string().trim().min(1).max(300).pipe(IngestedTextSchema).refine(shown, 'Expected no invisible characters')

/** A category's new name: a name, every character visible. */
const NewNameSchema = NameSchema.pipe(IngestedTextSchema).refine(shown, 'Expected no invisible characters')

/** An amount, or null for none: no budget, no weekly limit, a bill stopped. */
const AmountOrNoneSchema = z.union([AmountTextSchema, z.null()])

/** A list, Not spending (`transfer`) included. */
const AnyListSchema = z.enum([...ListSchema.options, 'transfer'])

const reason = { reason: ReasonSchema }

/** One change, by kind; every member strict. */
export const ChangeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('set_budget'),
      category: NameSchema,
      month: MonthTextSchema.optional(),
      applies: z.enum(['onward', 'only']).default('onward'),
      amount: AmountOrNoneSchema,
      ...reason,
    })
    .strict(),
  z.object({ kind: z.literal('set_weekly_limit'), category: NameSchema, amount: AmountOrNoneSchema, ...reason }).strict(),
  z
    .object({
      kind: z.literal('set_bill'),
      category: NameSchema,
      from_month: MonthTextSchema.optional(),
      amount: AmountOrNoneSchema.optional(),
      due_day: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
      ...reason,
    })
    .strict()
    .refine((c) => c.amount !== undefined || c.due_day !== undefined, 'Expected amount or due_day'),
  z
    .object({
      kind: z.literal('set_goal'),
      goal: NameSchema,
      target: AmountTextSchema.optional(),
      target_date: z.union([z.iso.date(), z.null()]).optional(),
      ...reason,
    })
    .strict()
    .refine((c) => c.target !== undefined || c.target_date !== undefined, 'Expected target or target_date'),
  z.object({ kind: z.literal('rename_category'), category: NameSchema, new_name: NewNameSchema, ...reason }).strict(),
  z.object({ kind: z.literal('add_category'), name: NewNameSchema, list: AnyListSchema, ...reason }).strict(),
  z.object({ kind: z.literal('move_category'), category: NameSchema, to_list: AnyListSchema, ...reason }).strict(),
  z.object({ kind: z.literal('recategorise'), transaction: z.uuid(), category: NameSchema, ...reason }).strict(),
  z.object({ kind: z.literal('learn_shop'), transaction: z.uuid(), category: NameSchema, ...reason }).strict(),
])
export type Change = z.output<typeof ChangeSchema>

/** `propose_change`: one to twenty changes, each standing alone. */
export const ProposeChangeInputSchema = z.object({ changes: z.array(ChangeSchema).min(1).max(20) }).strict()

/** `list_suggestions`: newest first; `expired` is a waiting one past its day. */
export const ListSuggestionsInputSchema = z
  .object({
    status: z.enum(['pending', 'applied', 'dismissed', 'replaced', 'expired', 'any']).default('any'),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()

/** `suggest_review_categories`: a category for each row waiting in Review, by its `id` from list_review_queue. */
export const SuggestReviewCategoriesInputSchema = z
  .object({ suggestions: z.array(z.object({ id: z.uuid(), category: NameSchema }).strict()).min(1).max(50) })
  .strict()
