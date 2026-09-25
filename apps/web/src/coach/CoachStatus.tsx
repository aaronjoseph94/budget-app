import type { AiProvider } from '@budget/schema'
import type { NarrationState } from './use-narration.js'

const BY: Readonly<Record<AiProvider, string>> = {
  gemini: 'free Google Gemini',
  groq: 'free Groq',
  openrouter: 'free OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

/**
 * One line under the Coach's title saying whose words these are (plan
 * §2.3): the AI's, and which service wrote them; the app's own; or that
 * the AI is being looked for or asked. It is a polite live region, so the
 * words arriving late are announced once, not every card over again.
 */
export function CoachStatus({ state }: { state: NarrationState }) {
  const { status, provider } = state
  let said = 'In the app’s own words, from your records.'
  if (status === 'loading') said = 'Looking for today’s AI words. The app’s own show meanwhile.'
  else if (status === 'asking') said = 'Asking the AI for today’s words. The app’s own show meanwhile.'
  else if (status === 'ai' && provider !== null) said = `✨ Words by AI (${BY[provider]}) from your numbers. Every figure is the app’s own.`
  return (
    <p aria-live="polite" className="text-xs text-muted-foreground">
      {said}
    </p>
  )
}
