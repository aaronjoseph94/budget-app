/**
 * golden-verification — the workbook is the oracle.
 *
 * INVERTED CONTROL, deliberately: this harness accepts a calculator function
 * rather than importing one. That is what allows a golden assertion to be
 * written and observed FAILING before any engine code exists. If this module
 * imported the engine, it could not be built first — and it would no longer be
 * an independent opinion about the engine's correctness.
 *
 * This is the project's only external, non-circular check. Every other test is
 * the author grading their own work.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface Provenance {
  readonly sourceWorkbook: string
  readonly sourceSheet: string
  readonly cells: Readonly<Record<string, string>>
  readonly extractedOn: string
  readonly note?: string
}

export interface GoldenFixture<TInput, TExpected> {
  readonly $provenance: Provenance
  readonly $semantics: Readonly<Record<string, string>>
  readonly input: TInput
  readonly expected: TExpected
}

/**
 * Load a fixture by name. Every fixture must carry provenance naming the
 * source sheet and cells — a fixture without it is an invented number, not a
 * golden value, and is rejected here rather than silently trusted.
 */
export function loadGolden<TInput, TExpected, TExtra = Record<string, never>>(
  name: string,
  /** The committed fixtures; the harness's own test passes a scratch folder (architecture-b-08). */
  dir: string = join(HERE, '..', 'fixtures'),
): GoldenFixture<TInput, TExpected> & TExtra {
  const path = join(dir, `${name}.golden.json`)
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as GoldenFixture<TInput, TExpected> & TExtra

  const p = parsed.$provenance
  if (!p?.sourceSheet || !p?.cells || !p?.extractedOn) {
    throw new Error(
      `Golden fixture "${name}" is missing provenance. Every golden value must name ` +
        `the workbook sheet and cells it was read from.`,
    )
  }
  return parsed
}

/** Count the golden assertions a fixture carries, for the CONSTRAINTS.md ratchet. */
export function countScheduleRows(schedules: Readonly<Record<string, readonly unknown[]>>): number {
  return Object.values(schedules).reduce((n, rows) => n + rows.length, 0)
}
