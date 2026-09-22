# Savings Coach

## Problem

The workbook records what was spent. It never argues. The user wants something
that applies pressure: hard weekly limits, direct questions about discretionary
spending, and every purchase priced against what it delays.

The named goal is **$30,000 for flying lessons.**

## Why the goal matters to the design

Flight training is billed by the hour, which gives the coach a unit far more
visceral than currency. Every discretionary purchase converts to flight time:

> "$80 dinner = 20 minutes of flight time."
> "Restaurants this week: 1.4 hours you didn't fly."

Dollars are abstract. Logbook hours are not. The conversion rate is the user's
own local hourly training rate, stored as a goal setting rather than assumed.

## MVP Scope

1. **Goal record** — name, target amount, optional target date, optional unit
   conversion (hours, at a rate the user sets). Progress derived from
   contributions, never stored.
2. **Weekly limits** — per discretionary category, committed at the start of a
   week, tracked down through it. Red on breach.
3. **The grid** — GitHub contribution layout: 7 rows (days) x 52 columns
   (weeks), coloured by discretionary spend against the daily allowance. Weekly
   savings streak as a strip above it. The day-of-week pattern is the point;
   a weekly-only grid would hide it.
4. **Savings capacity** — `calc-engine`: income minus committed outflow minus
   essentials at the user's own historical floor. Ranked by where the gap is
   largest.
5. **Proven-floor targets** — the target for a category is the best the user has
   actually achieved, not an invented ideal. "Your restaurant average is
   $103/week; your best week was $34. That gap is $3,588/year." Motivating
   because it is evidence, not aspiration.
6. **Interrogation** — the coach asks about specific discretionary purchases
   ("planned or impulse?"). Answers are stored and become training data for the
   impulse classifier. The loop makes it sharper about this user specifically.
7. **Tradeoff framing** — every discretionary transaction annotated with its
   cost in goal-units.

## Not Doing

- **No investment or financial advice.** The coach reasons only over the user's
  own transaction history. It never recommends products, rates, or allocations.
- **No guilt-based nagging after the fact.** Pressure lands before a purchase
  (limit visible, tradeoff priced) or at the weekly commitment point. A message
  that only says "you overspent" changes nothing and gets muted within weeks.
- **No LLM-computed numbers.** Every figure comes from `calc-engine`. The model
  writes the sentence around a number it was handed.
- **No automatic transfers or bank actions.** The app never moves money.
- **Not porting the workbook's Savings sheet layout** — seven fixed fund columns
  with manually maintained "Current Amount" cells. Contributions are
  transactions; balances are derived.

## Must be true

- The user imports statements regularly enough for weekly analysis to be real.
  A stale ledger makes the coach confidently wrong, which is worse than silent.
- There is enough history (8+ weeks) before "proven floor" targets mean
  anything. Before that the coach sets provisional limits and says so.
- The user tolerates being asked questions. If interrogation gets muted, the
  grid and the limits still work standalone.

## Open Questions

- Currency and locale for formatting. The workbook uses `$` without specifying.
- The user's hourly flight training rate, for the goal-unit conversion.
- Target date, or preferred weekly contribution. $30k is 5yr 9mo at $100/week
  and 1yr 11mo at $300/week; the user picks which end to fix.
- Split between debt payoff and the flying fund once real balances are known.
