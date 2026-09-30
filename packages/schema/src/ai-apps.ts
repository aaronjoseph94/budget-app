import { z } from 'zod'
import { ASK_MONTHS, ASK_PERIODS } from './ask.js'
import { IngestedTextSchema } from './primitives.js'

/**
 * The AI apps server's version (ADR 0012), which its `/mcp/health` answers so
 * One-time updates can tell an old paste of `mcp-function.ts` from this
 * site's. Bumped with every change the owner must paste, as `YYYY-MM-DD.N`.
 */
export const MCP_SERVER_VERSION = '2026-09-30.1'

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
