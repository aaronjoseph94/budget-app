# ADR 0015 — Fast, free AI: named models, quick services first, a speed test

**Date:** 2026-10-08 · **Decided by:** the engineer under the owner's
standing instruction ("Accept everything. Don't ask me for permission"),
on the owner's AI preference quoted below · **Status:** accepted
**Amends:** ADR 0004's allowlist (the models and the order the services
are tried in) and its AI settings layout; ADR 0002's "Gemini first".
**Research:** the services' own pages, read on 2026-10-08
(the figures that decided each pick are in "What the services offer"
below; nothing was run against a live key).

## For the owner

- The app now tries **OpenRouter, then Groq, then Google Gemini**, the
  quick free ones first. Gemini still works and is still free; it is
  third because it is slow for you.
- A receipt photo or a screenshot goes to a model that reads pictures on
  whichever of the three answers first. On OpenRouter that is
  **inkling-small**, the quickest free reader that day; on Groq it is
  **qwen3.8-27b**; on Gemini, Flash-Lite as before.
- **AI settings** has one **Free AI** card with the three free services in
  order, each with a **Test** button. Test makes one real call and says
  "Last test: 1.2 s on OpenRouter · inkling-small", so you can see for
  yourself which service is quick from your own phone.
- **Use AI** is at the top. Paid services, the daily limit, the order, the
  Coach's tone and shop names are under **Advanced**.
- No new service was added: nothing else free reads pictures quickly
  without a card (below).

## Context

The owner, 2026-10-08:

> I want open router, groq, and any other Free that does not take a long
> time to review my picture, screenshot or text... I want the AI to be
> available and quick.

and, of Gemini, that it is slow for them.

ADR 0004 put Gemini first, gave Groq two text-only models and OpenRouter
only its free router, which may pick a model that reads no image. So a
photo could go to Gemini or a paid service alone, and the default order
began with the slow one. Nothing measured how long a service took.

CLAUDE.md's **Ask first** covers adding an LLM provider. The owner's "any
other Free" is taken as approval to add one free service that is quick
and reads pictures, if one exists; none was added (Decision 4), so no
provider joins the allowlist under it.

## What the services offer (read 2026-10-08)

OpenRouter (`GET /api/v1/models`, each model's page for p50 latency and
throughput, `/models/{id}/endpoints` for uptime): 16 `:free` models, of
which seven read images. The quick, healthy readers: inkling-small
(0.86 s to first byte, 102 tokens/s, p90 2.1 s, 99.8 % up),
gemma-4-26b-a4b-it (0.96 s, 40 tok/s, p90 1.7 s), gemma-4-31b-it (1.42 s,
22 tok/s, p90 35 s), inkling (1.86 s, 32 tok/s), the Nvidia omni model
(0.38 s, 44 tok/s, but 79 % up, marked unhealthy). For words alone:
nemotron-3-super-120b (0.62 s, 93 tok/s, 99.96 % up), ling-3.0-flash-sante
(112 tok/s), nemotron-3.5-lightning (30 tok/s, p90 39 s: not quick that
day). No `qwen/*` or `z-ai/glm*` free id exists today. Free models are
capped per minute and per day; the helper's 40 a day stays below the
lowest documented tier (50). `GET /api/v1/models/user` refuses a wrong key
and lists what the key may use, so one call tests the key and ticks the
live ids.

Groq (`console.groq.com/docs/models`, `/docs/vision`, `/docs/rate-limits`):
Llama 4 Scout and Maverick are no longer listed; `qwen/qwen3.8-27b` is the
one model that reads images (up to 3 of 20 MB; 450 tokens/s); gpt-oss-20b
(about 1,000 tokens/s) and gpt-oss-120b (about 500) are the quickest text
models. Free plan: 30 a minute, 1,000 a day.

Other free services: Mistral's models read images, but its free API tier
is not documented anywhere reachable (the tier page is 404; the pricing
page describes a consumer plan and says nothing about API limits or a
card). Cerebras is text only and its credit needs a card. Neither passes
"free, quick, reads pictures, no card".

## Decision

1. **Named models, each saying whether it reads a photo.** The helper's
   allowlist and `packages/schema`'s `AI_MODELS` hold the same lists, held
   equal by the contract test. OpenRouter: inkling-small, gemma-4-26b,
   gemma-4-31b, inkling, nemotron-3-nano-omni (readers), then
   nemotron-3-super-120b, ling-3.0-flash-sante, nemotron-3.5-lightning
   (text), then `openrouter/free` last. Groq: gpt-oss-20b, gpt-oss-120b,
   qwen3.8-27b (reader). Gemini, OpenAI and Anthropic unchanged. A photo
   goes to the owner's chosen model when it reads one, else the first on
   that service that does (`modelForTask`); a service with no reader is
   passed over without a call. Every invariant of ADR 0004 stands: fixed
   hosts and paths, and a model id reaches a request only from the list.
2. **Default order: openrouter, groq, gemini, openai, anthropic.**
   Migration 0041 makes it the column default and `ai_context_for`'s
   fallback, and backfills a saved order still equal to 0016's, which was
   inherited, never chosen; an order the owner changed is kept. The
   helper's `DEFAULT_ORDER` and the app's `AI_DEFAULT_ORDER` are the same
   list, held equal by the contract test.
3. **A speed test.** A `run` of the `test` task may name one service; the
   helper asks that service alone, with the switches still holding (no
   key, or a paid service while paid is off, is not set up and spends
   nothing). Every run's reply says how long the attempt took (`ms`,
   measured around the one call to the service), on a good reply and on
   each entry of `tried`. The time is a count, never logged. AI settings'
   **Test** button shows "Last test: 1.2 s on OpenRouter · inkling-small"
   from that reply, so per-service latency is measured from the owner's
   own browser against the owner's own key.
4. **No new service.** Mistral is worth a second look when the owner can
   open an account and see what its Studio offers; recorded in
   NOTICED-NOT-TOUCHING.
5. **AI settings:** Use AI at the top, beside the one sentence on whether
   AI is on; one **Free AI** card with the three free services in the
   owner's order, each with its key steps, Check which models work, Test
   and Remove key, and the model it will use; **Advanced**, folded,
   holds the paid services' keys, Use paid services, Daily limit, Try in
   this order and How the Coach talks. The screen takes `embedded`, so
   Settings can mount it as a tab without its own title. *(At the merge
   of 2026-10-08 the prop went: Settings' AI tab is the one place the
   screen is drawn, ADR 0014 §2, so it never draws a title.)*
   Every new sentence is short; hints are under eight words.

## Considered

- **Keep `openrouter/free` as OpenRouter's one model.** It may route a
  photo to a model that reads none, and gives no way to prefer a quick
  reader. Kept, but last, as the catch-all.
- **Measure speed in the helper's logs.** Logs carry no content and
  nobody reads them from the app; the owner wants to see it, so the time
  goes in the reply, and the browser shows it.
- **Add Mistral now.** Not confirmed free without a card; adding a service
  on a guess fails CLAUDE.md's ask-first rule for providers.
- **Gemini stays** as the third free service: it reads images, the owner
  has a key, and OpenRouter's Gemma 4 models are served by Google AI
  Studio too, so if Google itself is what is slow, the speed test will
  show it and the owner can move Gemini down or remove its key.

## Consequences

- VERSION 2026-10-08.2; One-time updates asks for the paste, and for 0041.
- A new model is still a code change and a re-paste (ADR 0004); the
  speed test makes a slow one visible without one.
- The soft daily limits of ADR 0004 are unchanged and still under each
  service's documented free limits.
- Help's AI articles name the Free AI card, Test and Advanced; a later
  wave shortens Help as a whole.
