import { useId } from 'react'
import { parseMoneyInput } from '../app-data.js'
import { formatForInput } from '../format.js'
import { Field, Input } from '../components/ui/form.js'

/** "Show progress in", as typed: dollars, or hours of something at a cost an hour. */
export interface UnitText {
  readonly inHours: boolean
  readonly cost: string
  readonly label: string
}

/** A goal's unit, ready to edit; a goal with no cost an hour is in dollars. */
export function unitText(goal: { readonly unit_cost_cents: number | null; readonly unit_label: string | null } | null): UnitText {
  return goal === null || goal.unit_cost_cents === null
    ? { inHours: false, cost: '', label: '' }
    : { inHours: true, cost: formatForInput(goal.unit_cost_cents), label: goal.unit_label ?? '' }
}

/** The unit as it is saved, or the sentence saying why it cannot be. */
export function readUnit(
  unit: UnitText,
): { readonly unitCostCents: number | null; readonly unitLabel: string | null } | { readonly problem: string } {
  if (!unit.inHours) return { unitCostCents: null, unitLabel: null }
  const cost = parseMoneyInput(unit.cost)
  if (cost === null || cost <= 0) return { problem: 'Type what an hour costs, like 275 or 275.00.' }
  const label = unit.label.trim()
  return label === '' ? { problem: 'Say what the hours are of, like flight time.' } : { unitCostCents: cost, unitLabel: label }
}

/**
 * "Show progress in" (F45): dollars, or hours of something at what an hour
 * costs, as the flight goal counts flight time at $275.00. Shared by Add a
 * goal and a goal's editor, so both ask the same way. The two choices are
 * radio buttons drawn as one wide switch, each a full finger's height.
 */
export function GoalUnitFields({ unit, onChange }: { unit: UnitText; onChange: (unit: UnitText) => void }) {
  const group = useId()
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">Show progress in</legend>
      <div className="grid grid-cols-2 gap-2">
        {[false, true].map((hours) => (
          <label
            key={String(hours)}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name={group}
              className="sr-only"
              checked={unit.inHours === hours}
              onChange={() => onChange({ ...unit, inHours: hours })}
            />
            {hours ? 'Hours' : 'Dollars'}
          </label>
        ))}
      </div>
      {unit.inHours ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost of an hour ($)">
            <Input inputMode="decimal" value={unit.cost} onChange={(e) => onChange({ ...unit, cost: e.target.value })} />
          </Field>
          <Field label="Hours of" hint="Like flight time.">
            <Input value={unit.label} maxLength={40} onChange={(e) => onChange({ ...unit, label: e.target.value })} />
          </Field>
        </div>
      ) : null}
    </fieldset>
  )
}
