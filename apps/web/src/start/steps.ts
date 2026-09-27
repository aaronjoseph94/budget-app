/**
 * Getting started's nine steps (plan §8.1), in the guide's own order.
 */
export const STEP_IDS = ['name', 'lists', 'pay', 'bills', 'goals', 'statement', 'balance', 'ai', 'phone'] as const
export type StepId = (typeof STEP_IDS)[number]
