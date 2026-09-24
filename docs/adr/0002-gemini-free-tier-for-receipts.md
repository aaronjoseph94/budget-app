# ADR 0002 — Receipt photos are read by Gemini's free tier

**Date:** 2026-09-22 · **Decided by:** the account holder · **Status:** accepted

## Context

CLAUDE.md lists "adding an LLM provider, or sending unredacted financial
content to any hosted provider" under *Ask first*, and warns that free tiers
may retain and train on what they are sent.

A receipt photo carries a merchant, an amount, a date, and sometimes the last
digits of a card.

## Options put to the user

| Option | Cost | Data |
|---|---|---|
| Gemini free tier | none | Google may use it to improve its products; people may review it |
| Gemini paid tier | small, per use | not used for training |
| Claude API | small, per use | not used for training by default |

An earlier message wrongly said the Claude option cost nothing beyond the
user's existing plan. It was corrected before this decision: a Claude
subscription does not cover what an app uses through the API.

## Decision

**Gemini's free tier.** In the user's words: "I don't care about privacy... use
Gemini free tier."

## How it is built, so that it can change

- A Supabase Edge Function, `supabase/functions/read-receipt`, holds the key as
  the secret `GEMINI_API_KEY`. The key never reaches the browser.
- It calls one hardcoded host. The model name comes from the `GEMINI_MODEL`
  secret, validated against a pattern, defaulting to `gemini-2.5-flash`
  (`gemini-3.5-flash-lite` from 2026-09-24: see the note below).
- It returns the model's reply as text and writes nothing. The app parses it
  with zod (`packages/schema/src/receipt.ts`) — the "model responses" boundary.
- Whatever it reads fills an editable form, then goes to the review queue.
  The model never chooses a category, and nothing it reads counts until the
  user approves it.
- The photo is resized on the phone and not stored anywhere.

Switching to the paid tier is a new key and nothing else. Switching provider
is a change to one function file.

## Note, 2026-09-24: the default model moves

Decided by the engineer under the owner's 2026-09-24 instruction to proceed
without questions (ADR 0004 quotes it). The owner's choice above, Gemini's
free tier, is unchanged; only the model within it moves.

- `read-receipt` now defaults to **`gemini-3.5-flash-lite`**, not
  `gemini-2.5-flash`. Search results report that Google Cloud's model
  lifecycle page lists `gemini-2.5-flash` for retirement on 20 October
  2026, that an earlier notice said 16 October, and that Google's release
  notes serve the 2.5 models only to keys that have used them before, so a
  key made today may not reach it at all. `gemini-3.5-flash-lite` was confirmed by its model
  page in Google's Gemini API documentation and by Firebase's list of
  supported models, both found by search: direct fetches of Google's pages
  were blocked from here, so it has not been called. Google describes it as
  its low-cost, low-latency model for extraction and document parsing, with
  image input, which is this task.
- Nothing else in the request changed: the refactored function and the old
  one sent the same bytes apart from the model name. `temperature: 0` stays;
  Google's documentation says 3.5 Flash-Lite ignores a custom temperature
  rather than refusing it.
- The `GEMINI_MODEL` secret still overrides the default, validated against
  the same pattern and placed in the same fixed URL.
- "Switching provider is a change to one function file" now means the `ai`
  helper (ADR 0004), which is to read receipts with failover (plan A23).
  `read-receipt` stays as its fallback until the owner retires it.

## Not yet met

CONSTRAINTS.md sets an extraction bar for `llm-providers`: ≥90% zod-valid and
≥98% exact amounts over ≥20 labelled receipts, with no live provider calls in
CI. No labelled receipts exist yet, so this is **unmeasured**. The function has
been exercised against a stand-in for the Deno runtime and a faked Gemini; it
has not been run against the real Gemini API from here, which cannot reach it.
