# Budget App

A personal budget app for one person. It was rebuilt from a 28-sheet budget
spreadsheet (called **the workbook** everywhere in this repository), and it
runs as a web app you can install on an iPhone's Home Screen or open on a
computer.

**Live site:** [https://aaron-budget-app.pages.dev](https://aaron-budget-app.pages.dev)

It reads credit card statements, receipt photos and typed notes, puts
everything in a **Review** list for you to approve, and then shows where the
month is going, what to cut and when you will reach your goals. AI writes
the words; the app's own engine works out every number.

New here? Read [`HANDOFF.md`](HANDOFF.md) first. It is the current status,
the owner's to-do list and the next agent's starting point.

## What it does

| Screen | What it is for |
|---|---|
| Month | Opens first. Left to spend, End of month, Start and Spent, last month beside it, your lists, the charts |
| Week, Paycheck, Year | The same view for a week, a pay period or twelve months. The **Month · Week · Pay · Year** switch at the top of each of the four moves between them |
| Bill calendar | Each bill on its day, paydays, each week's total |
| Coach and Check-in | How the month is going, your goals, what to try next, a weekly check-in from Sunday |
| Forecast | Safe to spend a day, where the month will end, the next 30 days, goal dates, what-ifs, the debt-free date |
| Reports | The month in review, trends, shops and subscriptions, habits; **Save as PDF** and **Download CSV** |
| Ask | A question about your money in your own words; the answer's figure comes from the engine |
| Savings, Debts, All transactions | Every savings goal in your order; every debt and when it is paid off; every approved charge |
| Add, Review | A statement, a receipt photo or a typed note; everything waits in Review until you approve it |
| Setup, Settings, AI settings | Your lists and bills; weekly budgets and learned shops; AI on or off, keys and a daily limit |
| Help, Getting started | An article for every screen (the **?** beside each title), One-time updates, nine setup steps |

## How AI is used, and its rules

- **AI suggestions always wait in Review.** Nothing an AI reads or suggests
  reaches your spending until you approve it. Only an exact match to a shop
  you taught the app is approved by itself.
- **The AI never supplies a number.** It writes around blanks, and the app
  fills each blank from its own engine ([ADR 0005](docs/adr/0005-grounded-ai-text.md)).
  With AI off, every screen still works and shows the app's own words.
- **Keys never reach the browser.** Every AI call goes through one server
  function, `ai`, which keeps keys encrypted in the database (or uses a
  server-side `GEMINI_API_KEY` secret). A key pasted in **AI settings** is
  never shown again. The older `read-receipt` function is retired once `ai`
  is in.
- **A fixed list of services.** Free: Google Gemini (the default), Groq and
  OpenRouter. Paid, off until you switch **Use paid services** on: OpenAI and
  Anthropic. The addresses are written into the code; a setting can only
  pick from that list ([ADR 0004](docs/adr/0004-ai-providers-and-keys.md)).
- **Free tiers may keep what they are sent.** The owner accepted that trade
  for receipts ([ADR 0002](docs/adr/0002-gemini-free-tier-for-receipts.md))
  and for the other AI tasks ([ADR 0004](docs/adr/0004-ai-providers-and-keys.md));
  Help's "What the AI sees, and how the Coach talks" article lists what
  each task sends.

## Connecting Claude or ChatGPT (AI apps)

The app can act as an MCP server (Model Context Protocol, the way AI apps
call tools on another service). Once connected, Claude or ChatGPT can read
your figures and add entries to **Review**. They cannot approve, change or
delete anything. It is off until you turn it on: in **Settings** (on a
phone, under **More**), under **AI apps**, turn on **Let AI apps connect**,
press **Connect a new AI app**, and then press **Allow** on the budget
app's own page. Connecting is done once, on a computer.

- Step by step, in the app: **Help → Connect Claude** and
  **Help → Connect ChatGPT** (the words are in
  [`apps/web/src/help/articles.ts`](apps/web/src/help/articles.ts)).
- The one-time Supabase setup (paste the `mcp` server, OAuth, signing key):
  [`HANDOFF.md`](HANDOFF.md) section 3, Part F.
- The design and its security review: [ADR 0012](docs/adr/0012-mcp-server.md)
  and [`docs/design/mcp/PLAN.md`](docs/design/mcp/PLAN.md).

## The three rules the code keeps

1. **All arithmetic lives in `packages/core`.** Screens, server functions and
   the database only show numbers; they never work them out. A wrong number
   is fixed in the engine and gets a new test against the workbook.
2. **Money is whole cents.** An integer in the code, `bigint` in the
   database. Never a decimal fraction.
3. **Nothing a model produced reaches the ledger unreviewed.** Every import
   becomes a row in Review first.

The full rules are [`CLAUDE.md`](CLAUDE.md); what the checks enforce is
[`CONSTRAINTS.md`](CONSTRAINTS.md); which module may use which is
[`CAPABILITY-MAP.md`](CAPABILITY-MAP.md).

**The workbook is the test oracle.** The engine must reproduce the
workbook's own saved results exactly. The canonical case: four debts from
2025-03-01 are paid off on 2034-05-01, starting from 2,173,300 cents with
77,500 cents of monthly minimums.

## Stack

- pnpm monorepo (pnpm 10.33.0, Node 22 or later)
- Vite, React 19, TypeScript, Tailwind v4; an installable web app (PWA),
  web first rather than a native app ([ADR 0001](docs/adr/0001-web-first-vite-react.md))
- Hand-rolled navigation instead of a router library
  ([ADR 0003](docs/adr/0003-hand-rolled-navigation.md),
  [ADR 0006](docs/adr/0006-navigation-for-an-ai-first-app.md))
- zod for checking data at the edges; Vitest for tests
- Supabase: Postgres with row-level security, private Storage, Edge Functions
- Cloudflare Pages for the website (`aaron-budget-app.pages.dev`); the old
  Netlify address redirects there

## What is where

| Folder | What it holds |
|---|---|
| `apps/web` | The web app: every screen, Help's articles, the PWA setup |
| `packages/core` | The engine: every figure the app shows, tested against the workbook |
| `packages/money-primitives` | The cents type and the one place money is formatted for display |
| `packages/golden-verification` | Fixtures copied from the workbook's saved results, and the tests that compare |
| `packages/statement-parsers` | Reading card statements (PDF, CSV, spreadsheet) into rows for Review |
| `packages/schema` | The shapes data must have when it crosses an edge (zod) |
| `packages/savings-coach` | The coach's words and checks |
| `packages/chart-specs` | What each chart draws, worked out from engine output |
| `packages/report-export` | The CSV writer for Reports |
| `packages/ai-apps` | The MCP server for Claude and ChatGPT, built into one pasteable file |
| `supabase/migrations` | Database changes `0001` to `0038`, pasted in the order One-time updates names, never edited once applied |
| `supabase/functions` | The `ai` helper (and the retired `read-receipt` source, kept for an optional paste), with their tests |
| `supabase/tests` | Checks that the database refuses what it should |
| `scripts` | The checks (`gates.sh`), the bundle-size budget, the migration replay, the gitleaks installer |
| `docs` | Decisions, plans and setup notes (see below) |

## Running it locally

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in the two public values
pnpm --filter @budget/app-client dev           # the app at http://localhost:5173
pnpm test                                      # every test, once
```

`apps/web/.env.local` holds only the Supabase project URL and its public
(anon) key. Nothing else goes there, and it is never committed.

### The checks

Run `./scripts/gates.sh quick` while working and `./scripts/gates.sh full`
before work lands. Only a run that ends with `status=GREEN` counts. A check
whose tool is missing reports `MISCONFIGURED` and fails; it is never quietly
skipped.

| Check | Quick | Full | What it does |
|---|:-:|:-:|---|
| types | yes | yes | TypeScript compiles everything |
| lint | yes | yes | ESLint |
| purity | yes | yes | dependency-cruiser: screens never compute money, modules keep to their boundaries |
| secrets | yes | yes | gitleaks scans the working files for keys |
| golden | yes | yes | Every Vitest test, including the workbook comparisons |
| brand | yes | yes | The workbook vendor's name appears nowhere |
| history | | yes | gitleaks scans every past commit |
| schema | | yes | Replays every migration on a throwaway local PostgreSQL and checks what it refuses |
| coverage | | yes | Tests with coverage thresholds |
| deps | | yes | `pnpm audit` for high-severity advisories |
| bundle | | yes | Builds the app and fails if the first screen's JavaScript is over budget |

The full run needs `gitleaks` (`scripts/install-gitleaks.sh`) and a local
`psql`. CI runs the same checks on every push (`.github/workflows/gates.yml`).

## Deploying

The live site is on Cloudflare Pages. Setup is done once by hand;
[`HANDOFF.md`](HANDOFF.md) section 3 has every click; [`docs/setup.md`](docs/setup.md)
has the detail behind each one. In outline:

1. **Database.** Paste each file in `supabase/migrations` into Supabase's
   SQL Editor in the order **Help → One-time updates** names (mostly number
   order; `0035` before `0030` on purpose). That page checks which are in
   and has a **Copy** button for each
   ([ADR 0007](docs/adr/0007-one-time-updates-copied-from-the-app.md)).
2. **Edge Functions.** Paste the `ai` helper, and optionally the `mcp`
   server for AI apps, from the same Help page. Delete `read-receipt` once
   `ai` is live.
3. **Website.** Cloudflare Pages builds `pnpm --filter @budget/app-client build`
   from `main` and serves `apps/web/dist`, with the two public values as
   environment variables. Pushing to `main` deploys. The Netlify site, if
   still named, only redirects to the Pages address.

## Where the docs are

| Document | What it is |
|---|---|
| [`HANDOFF.md`](HANDOFF.md) | Start here: what is new, the owner's steps, screen-by-screen checks, what is left |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What the app is for, what is next and what is deliberately deferred |
| [`docs/adr/`](docs/adr) | Architecture decisions 0001 to 0012, each with its options and reasons |
| [`docs/formula-decisions.md`](docs/formula-decisions.md) | How each unclear workbook formula was read, with sheet and cell |
| [`docs/divergences.md`](docs/divergences.md) | Every place the app deliberately differs from the workbook, and why |
| [`NOTICED-NOT-TOUCHING.md`](NOTICED-NOT-TOUCHING.md) | Problems seen in passing and left for their own change |
| [`docs/setup.md`](docs/setup.md) | Hosting and Supabase settings in detail |
| [`docs/design/`](docs/design) | The current look (Mockup A) and the MCP plan |

## Privacy and security

- **One person's data.** Every table has row-level security: a signed-in
  user sees only their own rows. There is no sign-up screen; accounts are
  made in Supabase, and public sign-up is switched off there
  ([`HANDOFF.md`](HANDOFF.md) section 3, Part A).
- **Only two values are public:** the Supabase project URL and its anon
  (publishable) key. The `service_role` key and every AI key stay on the
  server.
- **Receipt photos are not kept.** A photo is sent to be read and then
  dropped; it is not saved in Supabase or on the device. The database's
  only Storage bucket is private, readable only from your own folder.
- **Logs carry ids, codes and counts only**, never an amount, shop, note,
  image path, prompt or AI reply.
- **Text from a receipt or an AI reply is shown as plain text**, never run
  as markup or followed as an instruction.
- **Nothing private is in this repository:** no workbook, statements,
  receipts, keys or `.env` files. Test files use invented data.

This is a personal project for one owner. No licence is granted.
