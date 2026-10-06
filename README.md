# Budget App

A personal budget app for one person. Rebuilt from a 28-sheet spreadsheet
(**the workbook**). Install it on an iPhone Home Screen or open it on a
computer.

**Live site:** [https://aaron-budget-app.pages.dev](https://aaron-budget-app.pages.dev)

It reads card statements, receipt photos and typed notes, holds them in
**Review** until you approve them, then shows where the month is going and
when you will reach your goals. AI can write the words; every number comes
from the app's own engine.

## Start here

| Document | What it is |
|---|---|
| [`HANDOFF.md`](HANDOFF.md) | Current status, owner steps, screen checks |
| [`docs/setup.md`](docs/setup.md) | Supabase and Cloudflare once-off setup |
| [`CLAUDE.md`](CLAUDE.md) | Binding rules for anyone changing the code |

## Run locally

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local         # then fill in the two public values
pnpm --filter @budget/app-client dev                 # http://localhost:5173
pnpm test
```

Only the Supabase URL and public (anon) key belong in `.env.local`. Never
commit that file.

Before landing work: `./scripts/gates.sh full` must print `status=GREEN`.

## Stack

pnpm · Node 22+ (Cloudflare and CI use Node 24) · Vite · React 19 ·
TypeScript · Tailwind · Supabase · Cloudflare Pages

## Rules in short

1. All arithmetic lives in `packages/core`.
2. Money is whole cents (`bigint` in Postgres).
3. Nothing from a model reaches the ledger until you approve it.

This is a personal project for one owner. No licence is granted.
