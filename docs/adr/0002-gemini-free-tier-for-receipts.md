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
  secret, validated against a pattern, defaulting to `gemini-2.5-flash`.
- It returns the model's reply as text and writes nothing. The app parses it
  with zod (`packages/schema/src/receipt.ts`) — the "model responses" boundary.
- Whatever it reads fills an editable form, then goes to the review queue.
  The model never chooses a category, and nothing it reads counts until the
  user approves it.
- The photo is resized on the phone and not stored anywhere.

Switching to the paid tier is a new key and nothing else. Switching provider
is a change to one function file.

## Not yet met

CONSTRAINTS.md sets an extraction bar for `llm-providers`: ≥90% zod-valid and
≥98% exact amounts over ≥20 labelled receipts, with no live provider calls in
CI. No labelled receipts exist yet, so this is **unmeasured**. The function has
been exercised against a stand-in for the Deno runtime and a faked Gemini; it
has not been run against the real Gemini API from here, which cannot reach it.
