import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AI_CODES, AiProviderSchema } from '../src/index.js'

// The enum as 0016 creates it, read from the migration itself, so the app's
// list and the database's cannot drift apart.
const migration = readFileSync(new URL('../../../supabase/migrations/0016_ai_foundation.sql', import.meta.url), 'utf8')
const created = /create type public\.ai_provider as enum \(([^)]*)\)/.exec(migration)?.[1] ?? ''

describe('AiProviderSchema', () => {
  it('holds exactly 0016’s ai_provider enum, in its order', () => {
    expect(AiProviderSchema.options).toEqual(created.split(',').map((v) => v.trim().replace(/^'|'$/g, '')))
    expect(AiProviderSchema.options[0]).toBe('gemini')
  })

  it('refuses a service the database does not have', () => {
    expect(AiProviderSchema.safeParse('mistral').success).toBe(false)
    expect(AiProviderSchema.safeParse('Gemini').success).toBe(false)
  })
})

describe('AI_CODES', () => {
  it('are distinct snake_case codes, safe to log', () => {
    expect(new Set(AI_CODES).size).toBe(AI_CODES.length)
    for (const code of AI_CODES) expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/)
  })
})
