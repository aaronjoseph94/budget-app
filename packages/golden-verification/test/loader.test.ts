import { afterEach, describe, expect, it } from 'vitest'
import { rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { countScheduleRows, loadGolden } from '../src/index.js'

/**
 * This module is the project's only External check — the one opinion the
 * author did not write (CONSTRAINTS.md, "Check classes"). Its guard is the
 * provenance requirement: a fixture that does not name the workbook sheet and
 * cells it came from is an invented number wearing a golden value's clothes.
 *
 * That guard had no test. Had it silently stopped rejecting, every golden
 * assertion would have quietly demoted to a Suite check and still looked green.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const PROBE = 'zz-provenance-probe'

/** Written into the real fixtures directory so the real loader path runs. */
function writeProbe(body: unknown): void {
  writeFileSync(join(FIXTURES, `${PROBE}.golden.json`), JSON.stringify(body), 'utf8')
}

afterEach(() => {
  rmSync(join(FIXTURES, `${PROBE}.golden.json`), { force: true })
})

function provenanceWithout(field: string): Record<string, unknown> {
  const provenance: Record<string, unknown> = {
    sourceWorkbook: 'Ultimate Annual Budget.xlsx',
    sourceSheet: 'Debt Calculator',
    cells: { startingTotal: 'J18' },
    extractedOn: '2026-09-21',
  }
  delete provenance[field]
  return { $provenance: provenance, $semantics: {}, input: {}, expected: {} }
}

describe('loadGolden provenance guard', () => {
  it('loads the committed debt fixture and finds its provenance', () => {
    const fixture = loadGolden<unknown, unknown>('debt-payoff')
    expect(fixture.$provenance.sourceSheet).toBeTruthy()
    expect(fixture.$provenance.cells).toBeTruthy()
    expect(fixture.$provenance.extractedOn).toBeTruthy()
  })

  it('throws for a fixture that does not exist', () => {
    expect(() => loadGolden('no-such-fixture')).toThrow()
  })

  it.each([
    ['no $provenance key at all', { input: {}, expected: {} }],
    ['provenance with no sourceSheet', provenanceWithout('sourceSheet')],
    ['provenance with no cells', provenanceWithout('cells')],
    ['provenance with no extractedOn', provenanceWithout('extractedOn')],
  ])('refuses a fixture with %s', (_label, body) => {
    // An unsourced number is not a golden value. Accepting one would turn the
    // only External check into the author grading their own work.
    writeProbe(body)
    expect(() => loadGolden(PROBE)).toThrow(/provenance/i)
  })

  it('accepts a fixture once its provenance is complete', () => {
    // The guard must reject for the stated reason, not reject everything.
    writeProbe({
      $provenance: {
        sourceWorkbook: 'Ultimate Annual Budget.xlsx',
        sourceSheet: 'Debt Calculator',
        cells: { startingTotal: 'J18' },
        extractedOn: '2026-09-21',
      },
      $semantics: {},
      input: {},
      expected: {},
    })
    expect(() => loadGolden(PROBE)).not.toThrow()
  })
})

describe('countScheduleRows', () => {
  it('counts every row across every schedule', () => {
    // Feeds CONSTRAINTS.md's golden-assertion ratchet, which must not fall.
    expect(countScheduleRows({ a: [1, 2, 3], b: [4, 5] })).toBe(5)
  })

  it('counts nothing for an empty set, and ignores empty schedules', () => {
    expect(countScheduleRows({})).toBe(0)
    expect(countScheduleRows({ a: [], b: [] })).toBe(0)
    expect(countScheduleRows({ a: [1], b: [] })).toBe(1)
  })
})
