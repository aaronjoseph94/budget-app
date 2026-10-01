import { z } from 'zod'
import { ASK_MONTHS, ASK_PERIODS } from './ask.js'
import { IngestedTextSchema } from './primitives.js'

/**
 * The AI apps server's version (ADR 0012), which its `/mcp/health` answers so
 * One-time updates can tell an old paste of `mcp-function.ts` from this
 * site's. Bumped with every change the owner must paste, as `YYYY-MM-DD.N`.
 */
export const MCP_SERVER_VERSION = '2026-10-01.1'

/*
 * What an AI app may send the server's tools (PLAN §2.4). Each tool's input
 * object is built from these in the slice that adds the tool, `.strict()`.
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

/** What an AI app adds was: the owner's own words, held as ingested text, trimmed. */
export const WordsSchema = z.string().trim().max(120).pipe(IngestedTextSchema)

/** `list_categories` takes nothing. */
export const ListCategoriesInputSchema = z.object({}).strict()

/** Something the owner said, for `add_note`, read as Just type it reads it. */
export const NoteTextSchema = z.string().trim().max(300).pipe(IngestedTextSchema)

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
