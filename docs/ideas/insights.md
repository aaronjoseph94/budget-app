# Always-on insights

## Problem

The user wants the AI "always scanning my stuff and giving me insights."

## The decision that makes or breaks it

**Detection is deterministic. The model only narrates what a detector found.**

An LLM asked to "find something interesting" always will, because that is what
it is for. The output is a stream of true, useless observations — spending up
3%, groceries slightly higher — and the feature is muted within a month.

Detectors are rules over the ledger, and they live in `calc-engine` like every
other piece of arithmetic. They fire or they do not. When none fire, the app
says nothing. That single property is what separates an insight feed from a
notification tax.

It is also the privacy design and the cost design. A detector runs locally over
rows already on the device. A model is called only when there is a specific
thing to phrase, a handful of times a week — comfortably inside a free tier,
and no financial data leaves on a schedule.

## Detectors worth building

Ranked by how much money they find, which is the only ranking that matters.

| Detector | Fires when | Why it earns a place |
|---|---|---|
| **New recurring charge** | An unseen merchant bills a similar amount 2+ times at a regular interval | Subscription creep is the single most common invisible leak |
| **Price increase** | A known recurring charge rises | Streaming and insurance rises are designed not to be noticed |
| **Duplicate charge** | Same merchant, same amount, same day, distinct transaction ids | Real money, recoverable, and easy to miss |
| **Zombie subscription** | A recurring charge with no related activity for N weeks | Paying for something unused |
| **Velocity** | Spend rate implies breaching a weekly limit before the week ends | Warns while it can still be acted on |
| **Upcoming squeeze** | Forecast shows a shortfall on a specific date | Several commitments landing the same week |
| **Unfamiliar merchant, large amount** | Above a threshold, never seen before | Fraud, or a purchase worth questioning |
| **Category drift** | A category rises N weeks running | Slow trends are invisible week to week |
| **Goal impact** | A week materially moved the goal date | The tradeoff, made concrete after the fact |
| **Personal best** | Lowest spend in a category since a prior date | A feed that only ever accuses gets muted |

Every one of these is arithmetic. None require a model to detect.

## Quality bar

An insight must clear all four, or it is not shown:

1. **Actionable** — the user could do something differently.
2. **Non-obvious** — not visible by glancing at the week's total.
3. **Quantified** — carries a dollar figure and, where relevant, its cost in
   flight hours.
4. **Novel** — not a repeat of something already shown and dismissed.

Ranked by dollar impact. At most three surfaced at once.

## Cadence

- **On import** — detectors re-run; urgent classes (duplicate charge, new
  recurring charge, upcoming squeeze) may notify.
- **Weekly digest** — the Sunday check-in, where non-urgent insights collect.
- **Never a daily push.** Nothing here decays in a day, and a daily
  notification is how the feature gets switched off.

Every insight is dismissible. A dismissed detector does not re-fire for the
same underlying cause.

## Not Doing

- **No LLM scanning loop.** No scheduled job that asks a model to look for
  something. Detectors fire; the model phrases.
- **No LLM-computed figures.** Every number in an insight comes from
  `calc-engine`. The model receives numbers and returns a sentence.
- **No sentiment or judgement without a number.** "You have been spending a lot
  lately" is banned. "Restaurants: $412 this week, $103 above your average,
  1h30m of flight time" is the form.
- **No daily notifications.**
- **No advice beyond the user's own data.** No products, rates, or allocations.

## Must be true

- Imports are regular enough that detection is current. A stale ledger produces
  confidently wrong insights, which is worse than silence.
- 8+ weeks of history before baseline-relative detectors (drift, personal best,
  velocity) mean anything. Before that they stay dormant and say so.

## Where it lives

Detectors are `calc-engine` functions — arithmetic, golden-testable, pure.
`savings-coach` owns surfacing: ranking, dismissal state, cadence, narration
prompts. No new module; the two halves are mutually referential (insights cite
goals, the check-in presents insights), and CAPABILITY-MAP.md says that makes
them one module.
