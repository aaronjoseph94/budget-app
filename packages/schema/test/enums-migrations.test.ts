import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CandidateStatusSchema,
  CategoryKindSchema,
  CategorySourceSchema,
  IngestSourceSchema,
  RejectionReasonSchema,
} from '../src/index.js'

/**
 * Every enum the app and the database share, as the migrations build it:
 * `create type` and each later `alter type … add value`, in file order
 * (architecture-a-13). A value added to one side and not the other is a
 * row the database keeps and the app refuses, or the other way round.
 */
const folder = new URL('../../../supabase/migrations/', import.meta.url)
const sql = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(new URL(name, folder), 'utf8'))
  .join('\n')

function built(type: string): string[] {
  const values: string[] = []
  const created = new RegExp(`create type public\\.${type} as enum \\(([^)]*)\\)`).exec(sql)
  if (created === null) throw new Error(`no create type for ${type}`)
  for (const [, value] of created[1]!.matchAll(/'([^']+)'/g)) values.push(value!)
  for (const [, value] of sql.matchAll(new RegExp(`alter type public\\.${type} add value (?:if not exists )?'([^']+)'`, 'g'))) values.push(value!)
  return values
}

describe('the enums the app and the database share', () => {
  it.each([
    ['ingest_source', IngestSourceSchema.options],
    ['candidate_status', CandidateStatusSchema.options],
    ['category_source', CategorySourceSchema.options],
    ['rejection_reason', RejectionReasonSchema.options],
    ['category_kind', CategoryKindSchema.options],
  ] as const)('%s holds exactly the values the migrations give it', (type, options) => {
    expect([...options].sort()).toEqual(built(type).sort())
  })
})
